"""
디바이스 명령 dispatch — single source of truth.

execute_device_action(username, device, action, params) -> dict

  {ok: bool, result: str|None, error: str|None, status_code: int}

HTTP 라우터 (devices_router) 와 자동화 엔진 (automation_engine), LLM 툴
(llm_tools) 이 같은 함수를 통해 디바이스를 제어한다. 이 모듈은 비즈니스
로직만 담고 HTTPException 을 직접 발생시키지 않는다 — 호출자가 status_code
를 보고 매핑한다.

지원 매트릭스:
  fan         (builtin/xiaomi):  on, off, speed, oscillation, angle, mode, left, right
  airpurifier (xiaomi):          on, off, mode, fan_level, favorite_level, buzzer, led, child_lock
  smartthings:                   on, off, level, open, close, pause
"""
from __future__ import annotations

from typing import Any

from devices.fan import get_fan, make_fan
from devices.airpurifier import make_air_purifier
from devices.smartthings import (
    SmartThingsNotConnected,
    find_window_shade_component,
    get_client,
)
from xiaomi_status_cache import invalidate_device


def _fan_for_device(d: dict):
    if d.get("provider") == "xiaomi":
        return make_fan(d.get("xiaomiIp", ""), d.get("xiaomiToken", ""))
    return get_fan()


def _airp_for_device(d: dict):
    return make_air_purifier(
        d.get("xiaomiIp", ""),
        d.get("xiaomiToken", ""),
        d.get("xiaomiModel", "zhimi.airpurifier.mb3"),
    )


def _ok(result: Any = None) -> dict:
    return {"ok": True, "result": None if result is None else str(result), "error": None, "status_code": 200}


def _ok_device(device: dict, result: Any = None) -> dict:
    if device.get("provider") == "xiaomi":
        invalidate_device(device)
    return _ok(result)


def _err(message: str, status_code: int = 400) -> dict:
    return {"ok": False, "result": None, "error": message, "status_code": status_code}


def _require(params: dict, key: str, type_=None):
    """Pull a required param. Returns (value, None) on success or (None, err_dict) on failure."""
    if key not in params or params[key] is None:
        return None, _err(f"Missing '{key}'")
    v = params[key]
    if type_ is not None:
        try:
            v = type_(v)
        except (TypeError, ValueError):
            return None, _err(f"Invalid '{key}': expected {type_.__name__}")
    return v, None


def execute_device_action(username: str, device: dict, action: str, params: dict | None = None) -> dict:
    """디바이스 1개에 대해 action 실행. params 는 추가 인자 (percent, level, enabled 등).
    HTTPException 던지지 않음 — caller 가 status_code 를 보고 매핑."""
    params = params or {}
    if not action:
        return _err("Missing 'action'")

    provider = device.get("provider")
    dev_type = device.get("type")

    # ── widgets: 제어 불가 ──
    if provider == "widgets":
        return _err("widget device cannot be controlled", 400)

    # ── Fan (builtin / xiaomi) ──
    if dev_type == "fan" and provider in ("builtin", "xiaomi"):
        try:
            fan = _fan_for_device(device)
            if action == "on":
                return _ok_device(device, fan.fan_on())
            if action == "off":
                return _ok_device(device, fan.fan_off())
            if action == "speed":
                v, e = _require(params, "percent", int)
                if e: return e
                return _ok_device(device, fan.set_speed(v))
            if action == "oscillation":
                v, e = _require(params, "enabled", bool)
                if e: return e
                return _ok_device(device, fan.set_oscillation(v))
            if action == "angle":
                v, e = _require(params, "angle", int)
                if e: return e
                return _ok_device(device, fan.set_angle(v))
            if action == "mode":
                v, e = _require(params, "mode", int)
                if e: return e
                return _ok_device(device, fan.set_mode(v))
            if action == "left":
                return _ok_device(device, fan.turn_left_once())
            if action == "right":
                return _ok_device(device, fan.turn_right_once())
            return _err(f"Unknown fan action: {action}")
        except Exception as e:
            return _err(f"Fan error: {e}", 502)

    # ── Air Purifier (xiaomi) ──
    if dev_type == "airpurifier" and provider == "xiaomi":
        try:
            airp = _airp_for_device(device)
            if action == "on":
                return _ok_device(device, airp.power_on())
            if action == "off":
                return _ok_device(device, airp.power_off())
            if action == "mode":
                v, e = _require(params, "mode", int)
                if e: return e
                return _ok_device(device, airp.set_mode(v))
            if action == "fan_level":
                v, e = _require(params, "level", int)
                if e: return e
                return _ok_device(device, airp.set_fan_level(v))
            if action == "favorite_level":
                v, e = _require(params, "level", int)
                if e: return e
                return _ok_device(device, airp.set_favorite_level(v))
            if action == "buzzer":
                v, e = _require(params, "enabled", bool)
                if e: return e
                return _ok_device(device, airp.set_buzzer(v))
            if action == "led":
                v, e = _require(params, "enabled", bool)
                if e: return e
                return _ok_device(device, airp.set_led(v))
            if action == "child_lock":
                v, e = _require(params, "enabled", bool)
                if e: return e
                return _ok_device(device, airp.set_child_lock(v))
            return _err(f"Unknown airpurifier action: {action}")
        except Exception as e:
            return _err(f"Air purifier error: {e}", 502)

    # ── SmartThings ──
    if provider == "smartthings":
        try:
            client = get_client(username, device.get("homeId"))
        except SmartThingsNotConnected:
            return _err("SmartThings not connected. Please connect first.", 401)
        try:
            st_id = device["stDeviceId"]
            is_blind = device.get("iconKey") == "blind" or dev_type == "blind"
            comp = device.get("blindComponent") or "blind"
            if action == "on":
                if is_blind:
                    return _ok(client.shade_open(st_id, comp))
                return _ok(client.switch_on(st_id))
            if action == "off":
                if is_blind:
                    return _ok(client.shade_close(st_id))
                return _ok(client.switch_off(st_id))
            if action == "level":
                v, e = _require(params, "level", int)
                if e: return e
                return _ok(client.set_level(st_id, v))
            if action in ("open", "close", "pause"):
                if not device.get("blindComponent"):
                    # 블라인드 component 미상이면 1회 탐색.
                    status = client.get_device_status(st_id)
                    comp = find_window_shade_component(status) or "blind"
                if action == "open":
                    return _ok(client.shade_open(st_id, comp))
                if action == "close":
                    return _ok(client.shade_close(st_id))
                return _ok(client.shade_pause(st_id, comp))
            return _err(f"Unknown SmartThings action: {action}")
        except Exception as e:
            return _err(f"SmartThings error: {e}", 502)

    return _err(f"Unknown device provider: {provider!r}", 400)
