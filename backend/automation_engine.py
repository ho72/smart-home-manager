"""
자동화 실행 엔진.

- run_automation(username, automation): 한 자동화의 actions 를 즉시 실행.
- automation_scheduler(): 백그라운드 task. 매 분 정시에 모든 사용자의
  enabled time 트리거를 검사하여 매칭되는 자동화를 실행.

⚠ Multi-worker uvicorn (workers > 1) 환경에선 워커 수만큼 중복 실행됨.
   현재는 single worker(--reload 또는 default) 가정. 추후 sqlite-based
   분산 락 또는 별도 단일 스케줄러 프로세스로 분리해야 함.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
import time
from typing import Any

import sensor_history
import home_store
from device_actions import execute_device_action
from devices.airpurifier import make_air_purifier
from state import iter_all_users, load_user_state, save_user_state

log = logging.getLogger("automation")

KST = datetime.timezone(datetime.timedelta(hours=9))

SENSOR_HISTORY_RETENTION_SEC = 24 * 3600

_SENSOR_OPS = {
    ">":  lambda a, b: a > b,
    "<":  lambda a, b: a < b,
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
}


def _run_action(username: str, action: dict, device: dict) -> tuple[bool, str]:
    """device_actions.execute_device_action 으로 위임. action dict 의 'action'
    키가 동사, 나머지 키들이 params (percent/level/enabled/angle/mode/...).
    """
    act = action.get("action")
    params = {k: v for k, v in action.items() if k not in ("action", "deviceId", "deviceLabel", "label")}
    res = execute_device_action(username, device, act, params)
    return bool(res["ok"]), (res["result"] or "ok") if res["ok"] else (res["error"] or "error")


def run_automation(username: str, automation: dict) -> dict:
    """자동화 1개의 모든 actions 실행. 결과 요약 반환.
    디바이스는 사용자가 속한 active home의 물리 디바이스와 개인 위젯 목록에서 조회."""
    devices_by_id = {d["id"]: d for d in home_store.list_all_devices(username)}
    results: list[dict] = []

    for action in automation.get("actions", []):
        device = devices_by_id.get(action.get("deviceId"))
        if device is None:
            results.append({"deviceId": action.get("deviceId"), "ok": False, "message": "device not found"})
            continue
        ok, msg = _run_action(username, action, device)
        results.append({"deviceId": action.get("deviceId"), "label": device.get("label"), "ok": ok, "message": msg})
        if ok:
            log.info("automation %r action ok: %s -> %s", automation.get("name"), device.get("label"), action.get("action"))
        else:
            log.warning("automation %r action FAIL: %s -> %s : %s", automation.get("name"), device.get("label"), action.get("action"), msg)

    ok_count = sum(1 for r in results if r["ok"])
    return {
        "name": automation.get("name"),
        "ran_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "actions": results,
        "ok_count": ok_count,
        "total": len(results),
    }


def _check_time_triggers(now: datetime.datetime) -> int:
    """모든 사용자에 대해 현재 시각(HH:MM) 매치되는 time trigger 자동화를 실행.
    `oneShot: True` 인 자동화는 실행 후 state.json 에서 제거. 실행 개수 반환."""
    hhmm = now.strftime("%H:%M")
    fired = 0
    for username, user_state in iter_all_users():
        oneshot_ids: list[str] = []
        for automation in user_state.get("automations", []):
            if not automation.get("enabled"):
                continue
            if automation.get("trigger") != "time":
                continue
            if automation.get("triggerTime") != hhmm:
                continue
            try:
                run_automation(username, automation)
                fired += 1
                if automation.get("oneShot"):
                    oneshot_ids.append(automation["id"])
            except Exception as e:
                log.exception("scheduler failed to run automation %s/%s: %s", username, automation.get("name"), e)

        if oneshot_ids:
            # Reload to avoid clobbering concurrent edits by the user.
            fresh = load_user_state(username)
            fresh["automations"] = [a for a in fresh.get("automations", []) if a.get("id") not in oneshot_ids]
            save_user_state(username, fresh)
            log.info("oneShot purged %d automation(s) for %s", len(oneshot_ids), username)
    return fired


def _poll_airpurifier_sensors() -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """모든 사용자의 type=='airpurifier' 디바이스를 device_id 단위로 dedup 해서
    1회 status 폴링하고, sensor_history 에 append + 24h ring prune.
    Returns (prev_samples, current_samples) — sensor trigger edge 비교용.
    prev_samples 는 record() *직전* 의 가장 최근 row (없으면 None)."""
    seen: set[str] = set()
    prev_samples: dict[str, dict[str, Any]] = {}
    current_samples: dict[str, dict[str, Any]] = {}
    now_ts = int(time.time())

    for username, _user_state in iter_all_users():
        for d in home_store.list_all_devices(username):
            if d.get("type") != "airpurifier" or d.get("provider") != "xiaomi":
                continue
            did = d.get("id")
            if not did or did in seen:
                continue
            seen.add(did)
            try:
                airp = make_air_purifier(
                    d.get("xiaomiIp", ""),
                    d.get("xiaomiToken", ""),
                    d.get("xiaomiModel", "zhimi.airpurifier.mb3"),
                )
                status = airp.get_status()
            except Exception as e:
                log.warning("airpurifier poll failed for %s: %s", did, e)
                continue
            prev = sensor_history.latest(did)
            sensor_history.record(did, now_ts, status)
            if prev is not None:
                prev_samples[did] = prev
            current_samples[did] = status

    if seen:
        try:
            sensor_history.prune_older_than(now_ts - SENSOR_HISTORY_RETENTION_SEC)
        except Exception as e:
            log.warning("sensor history prune failed: %s", e)
    return prev_samples, current_samples


def _check_sensor_triggers(prev_samples: dict[str, dict[str, Any]],
                           current_samples: dict[str, dict[str, Any]]) -> int:
    """trigger=='sensor' 자동화를 edge-triggered 로 평가. 새 sample 이 임계값
    조건을 통과하고 직전 sample 은 통과하지 않은 경우에만 1회 fire."""
    fired = 0
    for username, user_state in iter_all_users():
        oneshot_ids: list[str] = []
        for automation in user_state.get("automations", []):
            if not automation.get("enabled"):
                continue
            if automation.get("trigger") != "sensor":
                continue
            spec = automation.get("triggerSensor") or {}
            did = spec.get("deviceId")
            field = spec.get("field")
            op = _SENSOR_OPS.get(spec.get("op"))
            try:
                threshold = float(spec.get("value"))
            except (TypeError, ValueError):
                continue
            if not (did and field and op is not None):
                continue
            cur = current_samples.get(did, {}).get(field)
            if cur is None:
                continue
            try:
                cur_f = float(cur)
            except (TypeError, ValueError):
                continue
            if not op(cur_f, threshold):
                continue  # 현재 통과 안 함

            prev = prev_samples.get(did, {}).get(field)
            prev_passed = False
            if prev is not None:
                try:
                    prev_passed = op(float(prev), threshold)
                except (TypeError, ValueError):
                    prev_passed = False
            if prev_passed:
                continue  # edge: 직전에도 통과했으면 무시 (지속 조건 아닌 cross 만)

            try:
                run_automation(username, automation)
                fired += 1
                if automation.get("oneShot"):
                    oneshot_ids.append(automation["id"])
            except Exception as e:
                log.exception("sensor trigger run failed %s/%s: %s",
                              username, automation.get("name"), e)

        if oneshot_ids:
            fresh = load_user_state(username)
            fresh["automations"] = [a for a in fresh.get("automations", [])
                                    if a.get("id") not in oneshot_ids]
            save_user_state(username, fresh)
            log.info("oneShot purged %d sensor automation(s) for %s",
                     len(oneshot_ids), username)
    return fired


async def automation_scheduler():
    """매 분 정시에 깨어 자동화 검사. FastAPI lifespan 에서 시작."""
    log.info("automation scheduler started")
    while True:
        # 다음 분 정각까지 대기
        now = datetime.datetime.now()
        sleep_secs = 60 - now.second + (1 - now.microsecond / 1_000_000)
        try:
            await asyncio.sleep(max(1, sleep_secs))
        except asyncio.CancelledError:
            log.info("automation scheduler cancelled")
            raise
        try:
            fired = _check_time_triggers(datetime.datetime.now(KST))
            # 센서 폴링은 시간 트리거 다음에 — 시간 자동화가 디바이스 ON 시키는
            # 흔한 패턴에서 ON 직후 첫 sample 부터 history 에 들어가도록.
            prev_samples, current_samples = _poll_airpurifier_sensors()
            fired += _check_sensor_triggers(prev_samples, current_samples)
            if fired:
                log.info("automation scheduler fired %d automation(s)", fired)
        except Exception as e:
            log.exception("automation scheduler error: %s", e)
