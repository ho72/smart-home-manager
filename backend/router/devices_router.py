from __future__ import annotations

import concurrent.futures
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from auth import require_auth
import scale_store
import sensor_history
import home_store
from device_actions import execute_device_action
from state import load_user_state
from devices.fan import get_fan, make_fan
from devices.airpurifier import make_air_purifier
from devices.smartthings import get_client, find_window_shade_component, SmartThingsNotConnected
from xiaomi_status_cache import get_cached_status, set_cached_status


def _fan_for_device(d: dict):
    """Return a fan client for the given device record. Builtin fans use the
    env-configured singleton; xiaomi-provider fans use the per-device IP/token
    captured at add time."""
    if d.get("provider") == "xiaomi":
        return make_fan(d.get("xiaomiIp", ""), d.get("xiaomiToken", ""))
    return get_fan()


def _airp_for_device(d: dict):
    return make_air_purifier(
        d.get("xiaomiIp", ""),
        d.get("xiaomiToken", ""),
        d.get("xiaomiModel", "zhimi.airpurifier.mb3"),
    )


_AIRP_MODE_LABELS = {0: "Auto", 1: "Sleep", 2: "Favorite", 3: "Fan"}

router = APIRouter()


def _apply_saved_device_order(username: str, devices: list[dict]) -> list[dict]:
    settings = load_user_state(username).get("settings", {})
    order = settings.get("deviceOrder")
    if not isinstance(order, list) or not order:
        return devices

    rank = {device_id: i for i, device_id in enumerate(order)}
    return [
        d for _, d in sorted(
            enumerate(devices),
            key=lambda item: (rank.get(item[1].get("id"), len(rank)), item[0]),
        )
    ]


def _devices_for_user(username: str) -> list[dict]:
    return _apply_saved_device_order(username, home_store.list_main_devices(username))


def _smartthings_clients_for(username: str, devices: list[dict]) -> dict[str | None, Any | None]:
    clients: dict[str | None, Any | None] = {}
    home_ids = {d.get("homeId") for d in devices if d.get("provider") == "smartthings"}
    for home_id in home_ids:
        try:
            clients[home_id] = get_client(username, home_id)
        except SmartThingsNotConnected:
            clients[home_id] = None
    return clients


def _persist_device_patch(username: str, device_id: str, patch: dict, *, owner_required: bool = True) -> dict | None:
    return home_store.patch_device(username, device_id, patch, owner_required=owner_required)


def _xiaomi_status(device: dict, loader) -> dict:
    cached = get_cached_status(device)
    if cached is not None:
        return cached
    status = loader()
    set_cached_status(device, status)
    return status


def _fetch_device_status(d: dict, st_client, force_refresh: bool = False, username: str | None = None) -> dict:
    """Build the augmented per-device status. When `force_refresh` is True and
    the device is on a platform that supports the SmartThings 'refresh'
    capability, send a refresh command first so the cloud has the latest value.
    Devices without refresh fall through unchanged (no extra latency)."""
    info: dict[str, Any] = {**d, "power": False, "sub": "Offline"}

    if d.get("type") == "fan" and d.get("provider") in ("builtin", "xiaomi"):
        try:
            fan = _fan_for_device(d)
            s = _xiaomi_status(d, fan.get_status) if d.get("provider") == "xiaomi" else fan.get_status()
            info["power"] = bool(s.get("power", False))
            info["sub"] = f"Speed {s.get('speed', 0)} · {s.get('angle', 0)}°"
            info["fanStatus"] = s
        except Exception as e:
            info["sub"] = "Offline"
            info["error"] = str(e)

    elif d.get("type") == "airpurifier" and d.get("provider") == "xiaomi":
        try:
            airp = _airp_for_device(d)
            s = _xiaomi_status(d, airp.get_status)
            info["power"] = bool(s.get("power", False))
            mode_label = _AIRP_MODE_LABELS.get(s.get("mode"), "—")
            aqi = s.get("aqi")
            temp = s.get("temperature")
            parts = [mode_label]
            if aqi is not None:
                parts.append(f"AQI {aqi}")
            if temp is not None:
                parts.append(f"{float(temp):.0f}°")
            info["sub"] = " · ".join(parts)
            info["airStatus"] = s
        except Exception as e:
            info["sub"] = "Offline"
            info["error"] = str(e)

    elif d.get("provider") == "widgets" and d.get("iconKey") == "cloud":
        # Weather widget — KMA 기반. screen 자동 보강 + 메인 타일 sub 에 현재 온도/조건.
        info["power"] = True
        try:
            from weather import get_current, get_forecast
            cur = get_current()
            try:
                forecast = get_forecast()
                today = (forecast.get("daily") or [None])[0]
                if today:
                    cur["today"] = {
                        "tmin": today.get("tmin"),
                        "tmax": today.get("tmax"),
                    }
            except Exception:
                pass
            info["sub"] = f"{cur['temp']:.0f}° · {cur['skyText']}"
            info["weather"] = cur
        except Exception as e:
            info["sub"] = "—"
            info["error"] = str(e)
        if not d.get("screen"):
            info["screen"] = "weather"

    elif d.get("provider") == "widgets" and d.get("iconKey") == "scale":
        try:
            if not username:
                raise ValueError("username_required")
            scale = scale_store.summary(username, d.get("homeId"))
            latest = scale.get("latest")
            pending_count = scale.get("pendingCount") or 0
            info["scale"] = scale
            info["power"] = latest is not None
            if latest:
                weight_text = latest.get("weightKgText") or f"{float(latest['weightKg']):.2f}"
                info["sub"] = f"{weight_text}kg"
                if latest.get("impedanceOhm"):
                    info["sub"] += f" · {latest['impedanceOhm']}Ω"
            else:
                info["sub"] = "측정 대기"
            if pending_count:
                info["sub"] += f" · 미확인 {pending_count}"
        except Exception as e:
            info["sub"] = "설정 필요"
            info["error"] = str(e)
        if not d.get("screen"):
            info["screen"] = "scale"

    elif d.get("provider") == "widgets" and d.get("iconKey") == "clock":
        info["power"] = True
        info["sub"] = time.strftime("%H:%M")
        if not d.get("screen"):
            info["screen"] = "clock"

    elif d.get("provider") == "smartthings":
        try:
            client = st_client
            if force_refresh:
                # 일부 디바이스(특히 Tuya 같은 플랫폼 통합)는 refresh capability
                # 를 지원해서, get_status 직전에 refresh 명령을 보내면 클라우드가
                # 최신 상태로 업데이트된다. 지원 안 하는 디바이스(422)는 fast-fail
                # 이므로 best-effort 로 시도. 짧은 대기 후 status 읽음.
                if client.try_refresh(d["stDeviceId"]):
                    time.sleep(0.4)
            status = client.get_device_status(d["stDeviceId"])
            shade_component = d.get("blindComponent") or find_window_shade_component(status)
            if shade_component:
                # Auto-promote legacy entries that were saved as bulb/light
                info["iconKey"] = "blind"
                info["screen"] = "blind"
                info["type"] = "blind"
                info["blindComponent"] = shade_component
                level = client.get_level(status)
                shade_state = client.get_shade_state(status, shade_component)
                if level is None:
                    level = 0
                info["power"] = level > 0
                info["level"] = level
                info["shadeState"] = shade_state
                if shade_state in ("opening", "closing"):
                    info["sub"] = shade_state.capitalize() + f"… {level}%"
                elif level == 0:
                    info["sub"] = "Closed"
                elif level >= 100:
                    info["sub"] = "Open"
                else:
                    info["sub"] = f"{level}% open"
            else:
                power = client.get_switch_state(status)
                level = client.get_level(status)
                info["power"] = power
                info["sub"] = ("On" if power else "Off") + (f" · {level}%" if level is not None else "")
                info["stStatus"] = status
                # Cloud-reported value timestamp — 프런트엔드가 "클라우드가 우리 명령
                # 이후로 새 상태를 보고했는가" 를 stale 검사용으로 쓸 수 있게 노출.
                ts_str = (status.get("components", {}).get("main", {})
                          .get("switch", {}).get("switch", {}).get("timestamp"))
                if ts_str:
                    try:
                        from datetime import datetime
                        info["powerTimestamp"] = int(
                            datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp() * 1000
                        )
                    except Exception:
                        pass
                # 단순 switch 디바이스도 light 디테일(ON/OFF) 페이지로 갈 수 있게 screen 보강.
                # _MIGRATABLE_KEYS 처리로 state.json 에도 자동 반영됨.
                if not d.get("screen"):
                    info["screen"] = "light"
        except Exception as e:
            info["sub"] = "Offline"
            info["error"] = str(e)

    return info


_MIGRATABLE_KEYS = ("iconKey", "screen", "type", "blindComponent")


@router.get("")
def list_devices(username: str = Depends(require_auth)):
    devices = _devices_for_user(username)

    # SmartThings 는 home별 OAuth 토큰을 쓴다. 여러 홈의 타일을 한 번에
    # 렌더링할 수 있으므로 기기 homeId마다 클라이언트를 분리한다.
    st_clients = _smartthings_clients_for(username, devices)

    def fetch_one(d: dict) -> dict:
        st_client = st_clients.get(d.get("homeId"))
        if d.get("provider") == "smartthings" and st_client is None:
            return {**d, "power": False, "sub": "Connect SmartThings", "error": "not_connected"}
        return _fetch_device_status(d, st_client, username=username)

    # Cap concurrency to stay under SmartThings' per-token rate limit when many
    # devices are registered. 4 in-flight keeps sync responsive without a large burst.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(fetch_one, devices))

    # Persist any iconKey/screen/type/blindComponent corrections that the live status
    # fetch derived (e.g. legacy 'bulb' entry that's actually a windowShade blind).
    # Without this migration, a transient SmartThings failure later would let the tile
    # fall back to its stored type.
    for orig, fetched in zip(devices, results):
        patch = {
            k: fetched.get(k)
            for k in _MIGRATABLE_KEYS
            if k in fetched and fetched.get(k) and fetched.get(k) != orig.get(k)
        }
        if patch:
            _persist_device_patch(username, orig["id"], patch, owner_required=False)

    return results


def _maybe_migrate(username: str, original: dict, fetched: dict) -> None:
    """When live status promotes type/icon/screen/blindComponent (e.g. a legacy
    'bulb' that's actually a windowShade), persist the change so a transient
    cloud failure later doesn't cause UI regressions."""
    patch = {
        k: fetched.get(k)
        for k in _MIGRATABLE_KEYS
        if k in fetched and fetched.get(k) and fetched.get(k) != original.get(k)
    }
    if patch:
        _persist_device_patch(username, original["id"], patch, owner_required=False)


@router.get("/bare")
def list_devices_bare(username: str = Depends(require_auth)):
    """Return the stored device list without any live-status fetch. Frontend
    calls this first to render tiles immediately, then fetches each device's
    /info in parallel for per-tile loading state."""
    return _devices_for_user(username)


@router.get("/{device_id}/info")
def device_info(
    device_id: str,
    refresh: bool = Query(False, description="True 면 SmartThings refresh capability 를 best-effort 로 호출해서 클라우드 cache 를 강제 갱신 (사용자 PTR 등에서만 켜기 — silent polling 에선 끔)"),
    username: str = Depends(require_auth),
):
    """Return one device with its live status augmented (same shape as one
    entry from GET /devices). 404 if unknown id."""
    devices = _devices_for_user(username)
    device = next((d for d in devices if d.get("id") == device_id), None)
    if device is None:
        raise HTTPException(404, "Device not found")

    st_client = None
    if device.get("provider") == "smartthings":
        try:
            st_client = get_client(username, device.get("homeId"))
        except SmartThingsNotConnected:
            return {**device, "power": False, "sub": "Connect SmartThings", "error": "not_connected"}

    info = _fetch_device_status(device, st_client, force_refresh=refresh, username=username)
    _maybe_migrate(username, device, info)
    return info


@router.get("/{device_id}/history")
def device_history(
    device_id: str,
    h: float = Query(24.0, gt=0, le=24.0, description="가져올 시간 범위(시간). 최대 24h — 그 이상은 보관 안 함."),
    username: str = Depends(require_auth),
):
    """센서 시계열. 1분 폴링되는 디바이스(공기청정기 등) 의 24h 이내 sample 을
    ts 오름차순으로 반환. 비어 있으면 [] (이제 막 추가했거나 폴링 실패 중)."""
    devices = _devices_for_user(username)
    device = next((d for d in devices if d.get("id") == device_id), None)
    if device is None:
        raise HTTPException(404, "Device not found")
    import time
    since_ts = int(time.time() - h * 3600)
    return {
        "deviceId": device_id,
        "since": since_ts,
        "samples": sensor_history.query(device_id, since_ts),
    }


@router.post("")
def add_device(
    device: dict,
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    for field in ("id", "provider", "type", "label", "iconKey"):
        if field not in device:
            raise HTTPException(400, f"Missing required field: {field}")

    try:
        saved = home_store.add_device(username, device, home_id)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        if str(exc) == "device_id_already_exists":
            raise HTTPException(409, "Device ID already exists") from exc
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "device": saved}


@router.delete("/{device_id}")
def remove_device(device_id: str, username: str = Depends(require_auth)):
    try:
        removed = home_store.remove_device(username, device_id)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    if not removed:
        raise HTTPException(404, "Device not found")
    return {"ok": True}


@router.patch("/{device_id}")
def update_device(device_id: str, body: dict, username: str = Depends(require_auth)):
    """
    디바이스 부분 수정 — 현재는 label(표시 이름)만 변경 가능.
    추후 iconKey/screen 등 확장하려면 ALLOWED 추가.
    """
    ALLOWED = {"label"}
    patch = {
        k: v.strip()
        for k, v in body.items()
        if k in ALLOWED and isinstance(v, str) and v.strip()
    }
    try:
        target = _persist_device_patch(username, device_id, patch)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    if target is None:
        raise HTTPException(404, "Device not found")
    return {"ok": True, "device": target}


@router.get("/{device_id}/status")
def device_status(device_id: str, username: str = Depends(require_auth)):
    devices = _devices_for_user(username)
    device = next((d for d in devices if d["id"] == device_id), None)
    if not device:
        raise HTTPException(404, "Device not found")

    if device.get("type") == "fan" and device.get("provider") in ("builtin", "xiaomi"):
        fan = _fan_for_device(device)
        return _xiaomi_status(device, fan.get_status) if device.get("provider") == "xiaomi" else fan.get_status()

    if device["provider"] == "smartthings":
        try:
            return get_client(username, device.get("homeId")).get_device_status(device["stDeviceId"])
        except SmartThingsNotConnected:
            raise HTTPException(401, "SmartThings not connected. Please connect first.")

    raise HTTPException(400, "Unknown device provider")


@router.post("/{device_id}/command")
def device_command(device_id: str, body: dict, username: str = Depends(require_auth)):
    devices = _devices_for_user(username)
    device = next((d for d in devices if d["id"] == device_id), None)
    if not device:
        raise HTTPException(404, "Device not found")

    action = body.get("action")
    # body 의 나머지 키들이 그대로 params 로 전달됨 (percent/level/enabled/angle/mode 등).
    params = {k: v for k, v in body.items() if k != "action"}
    res = execute_device_action(username, device, action, params)
    if not res["ok"]:
        raise HTTPException(res["status_code"], res["error"])
    return {"ok": True, "result": res["result"]}
