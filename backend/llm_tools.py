"""
LLM 챗 엔드포인트가 호출하는 도구 함수들. 모두 username 스코프 — 호출자
사용자 본인의 디바이스/자동화에만 영향. HTTP 라우터와 같은 device_actions
및 state 모듈을 통해 동작하므로, UI 토글과 LLM 명령은 정확히 같은
경로로 디바이스를 제어한다.

`bedroom3 only` 같은 dev guard 는 이 모듈에선 강제하지 않는다 — caller
(llm_router) 가 디바이스 카탈로그를 줄여 LLM 에 전달하는 방식으로 가드.
"""
from __future__ import annotations

import datetime
import logging
import time
import uuid
from typing import Any

import home_store
from device_actions import execute_device_action
from state import load_user_state, save_user_state

log = logging.getLogger("llm.tools")

KST = datetime.timezone(datetime.timedelta(hours=9))


# ──────────────────────────────────────────────────────────────
# 카탈로그 (LLM 시스템 프롬프트에 박을 컨텍스트)
# ──────────────────────────────────────────────────────────────

# 디바이스 type 별 가능 action — LLM 한테 보여줄 카탈로그용 요약.
DEVICE_ACTIONS_BY_TYPE: dict[str, list[dict]] = {
    "fan": [
        {"action": "on"},
        {"action": "off"},
        {"action": "speed", "params": {"percent": "1..100"}},
        {"action": "oscillation", "params": {"enabled": "bool"}},
        {"action": "angle", "params": {"angle": "30..140"}},
        {"action": "left"},
        {"action": "right"},
    ],
    "airpurifier": [
        {"action": "on"},
        {"action": "off"},
        {"action": "mode", "params": {"mode": "0=Auto,1=Sleep,2=Favorite,3=Fan"}},
        {"action": "fan_level", "params": {"level": "1..3"}},
        {"action": "favorite_level", "params": {"level": "0..14"}},
        {"action": "buzzer", "params": {"enabled": "bool"}},
        {"action": "led", "params": {"enabled": "bool"}},
    ],
    "blind": [
        {"action": "open"},
        {"action": "close"},
        {"action": "pause"},
        {"action": "level", "params": {"level": "0..100"}},
    ],
    # SmartThings 일반 스위치/조명
    "bolt": [{"action": "on"}, {"action": "off"}],
    "light": [{"action": "on"}, {"action": "off"}, {"action": "level", "params": {"level": "0..100"}}],
    "switch": [{"action": "on"}, {"action": "off"}],
}


def device_label_filter(prefix: str | None) -> callable:
    """라벨 prefix 로 디바이스 화이트리스트 (dev guard). prefix 가 비면 모두 허용."""
    if not prefix:
        return lambda d: True
    return lambda d: (d.get("label") or "").startswith(prefix)


def build_device_catalog(username: str, label_prefix: str | None = None) -> list[dict]:
    """LLM 한테 줄 디바이스 카탈로그 — 위젯/필터링 제외, action 가능 목록 포함."""
    devices = home_store.list_all_devices(username)
    keep = device_label_filter(label_prefix)
    out: list[dict] = []
    for d in devices:
        if d.get("provider") == "widgets":
            continue
        if not keep(d):
            continue
        t = d.get("type") or ""
        out.append({
            "id": d["id"],
            "label": d.get("label", ""),
            "type": t,
            "provider": d.get("provider", ""),
            "actions": DEVICE_ACTIONS_BY_TYPE.get(t, [{"action": "on"}, {"action": "off"}]),
        })
    return out


def build_automation_summary(username: str) -> list[dict]:
    """현재 등록된 자동화 요약 (LLM 이 '있는 자동화 끄기' 같은 요청 처리할 때 참조)."""
    state = load_user_state(username)
    out: list[dict] = []
    for a in state.get("automations", []) or []:
        item: dict[str, Any] = {
            "id": a.get("id"),
            "name": a.get("name"),
            "enabled": bool(a.get("enabled")),
            "trigger": a.get("trigger"),
            "oneShot": bool(a.get("oneShot")),
        }
        if a.get("trigger") == "time":
            item["triggerTime"] = a.get("triggerTime")
        elif a.get("trigger") == "sensor":
            item["triggerSensor"] = a.get("triggerSensor")
        item["actions"] = [
            {"deviceId": x.get("deviceId"), "action": x.get("action"),
             **{k: v for k, v in x.items() if k not in ("deviceId", "action", "deviceLabel", "label")}}
            for x in a.get("actions", []) or []
        ]
        out.append(item)
    return out


# ──────────────────────────────────────────────────────────────
# Tool 1: control_device — 즉시 실행
# ──────────────────────────────────────────────────────────────

def tool_control_device(username: str, allowed_device_ids: set[str], call: dict) -> dict:
    """
    call: {deviceId, action, params?: {...}}
    """
    did = call.get("deviceId")
    action = call.get("action")
    params = call.get("params") or {}
    if not did or not action:
        return {"ok": False, "error": "deviceId/action 누락"}
    if did not in allowed_device_ids:
        return {"ok": False, "error": f"권한 없음: {did} (허용 디바이스 외)"}
    devices = home_store.list_all_devices(username)
    device = next((d for d in devices if d.get("id") == did), None)
    if not device:
        return {"ok": False, "error": f"디바이스 없음: {did}"}
    res = execute_device_action(username, device, action, params)
    return {
        "ok": bool(res["ok"]),
        "deviceId": did,
        "label": device.get("label"),
        "action": action,
        "result": res.get("result"),
        "error": res.get("error"),
    }


# ──────────────────────────────────────────────────────────────
# Tool 2: create_automation
#   trigger: "time" | "sensor"
#   - time: triggerTime "HH:MM" (KST). delayMinutes 도 허용 — 현재시각 + N분으로 계산.
#   - sensor: triggerSensor {deviceId, field, op, value}
#   actions: [{deviceId, action, ...params}]
#   oneShot: bool (default true if delayMinutes 사용)
# ──────────────────────────────────────────────────────────────

def _resolve_trigger_time(call: dict) -> tuple[str | None, str | None]:
    """triggerTime 우선. 없으면 delayMinutes 로 계산 (현재시각 + N분, KST).
    Returns (HHMM, error)."""
    t = (call.get("triggerTime") or "").strip()
    if t:
        # 검증: HH:MM
        try:
            hh, mm = t.split(":")
            hh_i, mm_i = int(hh), int(mm)
            if 0 <= hh_i < 24 and 0 <= mm_i < 60:
                return f"{hh_i:02d}:{mm_i:02d}", None
        except Exception:
            pass
        return None, f"invalid triggerTime: {t!r} (HH:MM 형식)"
    delay = call.get("delayMinutes")
    if delay is not None:
        try:
            mins = int(delay)
            if mins < 1 or mins > 24 * 60:
                return None, "delayMinutes 는 1..1440"
            now = datetime.datetime.now(KST) + datetime.timedelta(minutes=mins)
            return now.strftime("%H:%M"), None
        except Exception:
            return None, "delayMinutes 정수가 아님"
    return None, "triggerTime 또는 delayMinutes 필요"


def tool_create_automation(username: str, allowed_device_ids: set[str], call: dict) -> dict:
    """
    call: {
      name, trigger ('time'|'sensor'),
      triggerTime? "HH:MM"  | delayMinutes? int,
      triggerSensor? {deviceId, field, op, value},
      actions: [{deviceId, action, ...params}],
      oneShot? bool, enabled? bool
    }
    """
    name = (call.get("name") or "").strip() or "새 자동화"
    trigger = call.get("trigger") or "time"
    if trigger not in ("time", "sensor"):
        return {"ok": False, "error": f"unsupported trigger: {trigger}"}

    # Actions 검증
    raw_actions = call.get("actions") or []
    if not isinstance(raw_actions, list) or not raw_actions:
        return {"ok": False, "error": "actions 가 비어있음"}
    devices = {d["id"]: d for d in home_store.list_all_devices(username)}
    norm_actions: list[dict] = []
    for a in raw_actions:
        did = a.get("deviceId")
        act = a.get("action")
        if not did or not act:
            return {"ok": False, "error": f"action 항목 누락: {a}"}
        if did not in allowed_device_ids:
            return {"ok": False, "error": f"권한 없음: {did}"}
        if did not in devices:
            return {"ok": False, "error": f"디바이스 없음: {did}"}
        params = {k: v for k, v in a.items() if k not in ("deviceId", "action")}
        norm_actions.append({"deviceId": did, "deviceLabel": devices[did].get("label"),
                             "action": act, **params})

    new_auto: dict[str, Any] = {
        "id": "a_" + uuid.uuid4().hex[:10],
        "name": name,
        "enabled": bool(call.get("enabled", True)),
        "trigger": trigger,
        "oneShot": bool(call.get("oneShot", call.get("delayMinutes") is not None)),
        "actions": norm_actions,
    }

    if trigger == "time":
        hhmm, err = _resolve_trigger_time(call)
        if err:
            return {"ok": False, "error": err}
        new_auto["triggerTime"] = hhmm
    else:  # sensor
        spec = call.get("triggerSensor") or {}
        sdid = spec.get("deviceId")
        if sdid not in allowed_device_ids:
            return {"ok": False, "error": f"sensor 디바이스 권한 없음: {sdid}"}
        new_auto["triggerSensor"] = {
            "deviceId": sdid,
            "field": spec.get("field"),
            "op": spec.get("op"),
            "value": spec.get("value"),
        }

    state = load_user_state(username)
    state.setdefault("automations", []).append(new_auto)
    save_user_state(username, state)
    log.info("LLM created automation %s for %s", new_auto["id"], username)
    return {"ok": True, "automation": new_auto}


# ──────────────────────────────────────────────────────────────
# Tool 3: toggle_automation (enable/disable)
# ──────────────────────────────────────────────────────────────

def tool_toggle_automation(username: str, call: dict) -> dict:
    """call: {id, enabled}"""
    aid = call.get("id")
    enabled = call.get("enabled")
    if aid is None or enabled is None:
        return {"ok": False, "error": "id/enabled 누락"}
    state = load_user_state(username)
    target = next((a for a in state.get("automations", []) if a.get("id") == aid), None)
    if not target:
        return {"ok": False, "error": f"자동화 없음: {aid}"}
    target["enabled"] = bool(enabled)
    save_user_state(username, state)
    return {"ok": True, "id": aid, "enabled": bool(enabled), "name": target.get("name")}


# ──────────────────────────────────────────────────────────────
# Tool 4: delete_automation
# ──────────────────────────────────────────────────────────────

def tool_delete_automation(username: str, call: dict) -> dict:
    aid = call.get("id")
    if not aid:
        return {"ok": False, "error": "id 누락"}
    state = load_user_state(username)
    autos = state.get("automations", [])
    target = next((a for a in autos if a.get("id") == aid), None)
    if not target:
        return {"ok": False, "error": f"자동화 없음: {aid}"}
    state["automations"] = [a for a in autos if a.get("id") != aid]
    save_user_state(username, state)
    return {"ok": True, "id": aid, "name": target.get("name")}


# ──────────────────────────────────────────────────────────────
# Dispatch — LLM 이 plan 한 actions 를 순서대로 실행
# ──────────────────────────────────────────────────────────────

def dispatch_plan(username: str, allowed_device_ids: set[str], plan_actions: list[dict],
                  max_actions: int = 8) -> list[dict]:
    """plan_actions: [{tool: 'control_device'|'create_automation'|...,  ...args}]"""
    out: list[dict] = []
    for i, p in enumerate(plan_actions[:max_actions]):
        tool = p.get("tool")
        try:
            if tool == "control_device":
                r = tool_control_device(username, allowed_device_ids, p)
            elif tool == "create_automation":
                r = tool_create_automation(username, allowed_device_ids, p)
            elif tool == "toggle_automation":
                r = tool_toggle_automation(username, p)
            elif tool == "delete_automation":
                r = tool_delete_automation(username, p)
            else:
                r = {"ok": False, "error": f"unknown tool: {tool}"}
        except Exception as e:
            log.exception("dispatch error: %s", e)
            r = {"ok": False, "error": f"{type(e).__name__}: {e}"}
        out.append({"tool": tool, **r})
    if len(plan_actions) > max_actions:
        out.append({"tool": "_truncated",
                    "error": f"plan 이 너무 김 ({len(plan_actions)}>{max_actions}) — 뒤쪽 무시"})
    return out
