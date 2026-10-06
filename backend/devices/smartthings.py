from __future__ import annotations

import os
import time
from typing import Any

import requests

SMARTTHINGS_API_BASE = "https://api.smartthings.com/v1"

# Cap parallel fan-out and add tiny inter-request gap to stay under the per-token rate limit.
_RATE_LIMIT_RETRIES = 2
_RATE_LIMIT_BASE_BACKOFF = 0.6  # seconds

# Capability 조합 → iconKey 매핑 (우선순위 높은 순)
_CAPABILITY_RULES: list[tuple[set[str], str, str | None]] = [
    ({"thermostat"},                                        "ac",     None),
    ({"thermostatMode"},                                    "ac",     None),
    ({"fanSpeed"},                                          "fan",    "fan"),
    ({"fanOscillationMode"},                                "fan",    "fan"),
    ({"relativeHumidityMeasurement", "switch"},             "humid",  None),
    ({"motionSensor"},                                      "sensor", None),
    ({"contactSensor"},                                     "sensor", None),
    ({"temperatureMeasurement"},                            "thermo", None),
    ({"switchLevel", "switch"},                             "bulb",   "light"),
    ({"colorControl", "switch"},                            "bulb",   "light"),
    ({"switch"},                                            "bolt",   "light"),  # 단순 스위치도 light 디테일(ON/OFF) 사용
]


def capabilities_to_icon(caps: list[str]) -> tuple[str, str | None]:
    cap_set = set(caps)
    for required, icon_key, screen in _CAPABILITY_RULES:
        if required.issubset(cap_set):
            return icon_key, screen
    return "bolt", None


def find_window_shade_component(device_or_status: dict) -> str | None:
    """Search components in either a /devices entry or /status response for one
    that exposes the windowShade capability. Returns the component id (e.g. "blind")."""
    components = device_or_status.get("components")
    if isinstance(components, list):  # /devices shape
        for comp in components:
            cap_ids = {c.get("id") for c in comp.get("capabilities", [])}
            if "windowShade" in cap_ids:
                return comp.get("id")
    elif isinstance(components, dict):  # /status shape
        for comp_id, comp in components.items():
            if isinstance(comp, dict) and "windowShade" in comp:
                return comp_id
    return None


class SmartThingsClient:
    def __init__(self, pat_token: str) -> None:
        if not pat_token:
            raise ValueError("PAT 토큰이 비어있습니다")
        self.headers = {
            "Authorization": f"Bearer {pat_token}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Issue request with retry on 429 and transient 5xx, honoring Retry-After."""
        kwargs.setdefault("headers", self.headers)
        kwargs.setdefault("timeout", 10)
        last_resp: requests.Response | None = None
        for attempt in range(_RATE_LIMIT_RETRIES + 1):
            r = requests.request(method, url, **kwargs)
            last_resp = r
            should_retry = r.status_code == 429 or (500 <= r.status_code < 600)
            if not should_retry or attempt == _RATE_LIMIT_RETRIES:
                break
            backoff = _RATE_LIMIT_BASE_BACKOFF * (2 ** attempt)
            if r.status_code == 429:
                ra = r.headers.get("Retry-After")
                if ra:
                    try:
                        backoff = max(backoff, float(ra))
                    except ValueError:
                        pass
            time.sleep(min(backoff, 3.0))
        assert last_resp is not None
        last_resp.raise_for_status()
        return last_resp

    def get_devices(self) -> list[dict[str, Any]]:
        r = self._request("GET", f"{SMARTTHINGS_API_BASE}/devices")
        items = r.json().get("items", [])
        if not isinstance(items, list):
            raise ValueError("응답 형식 오류: items가 리스트가 아닙니다")
        return items

    def get_device_status(self, device_id: str) -> dict[str, Any]:
        r = self._request("GET", f"{SMARTTHINGS_API_BASE}/devices/{device_id}/status")
        return r.json()

    def try_refresh(self, device_id: str) -> bool:
        """Best-effort: ask the device to push its current state to the cloud.
        Many platform-bridged devices don't expose the 'refresh' capability
        (returns 422). Return True iff accepted, so callers can decide whether
        to add a small delay before re-reading status."""
        try:
            self.send_command(device_id, "refresh", "refresh")
            return True
        except Exception:
            return False

    def send_command(self, device_id: str, capability: str, command: str,
                     component: str = "main", arguments: list | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "commands": [{"component": component, "capability": capability, "command": command}]
        }
        if arguments:
            payload["commands"][0]["arguments"] = arguments
        r = self._request("POST", f"{SMARTTHINGS_API_BASE}/devices/{device_id}/commands", json=payload)
        return r.json()

    def switch_on(self, device_id: str) -> dict[str, Any]:
        return self.send_command(device_id, "switch", "on")

    def switch_off(self, device_id: str) -> dict[str, Any]:
        return self.send_command(device_id, "switch", "off")

    def set_level(self, device_id: str, level: int) -> dict[str, Any]:
        return self.send_command(device_id, "switchLevel", "setLevel", arguments=[max(0, min(100, level))])

    # ── Window shade (blinds) ──
    def shade_open(self, device_id: str, component: str = "blind") -> dict[str, Any]:
        return self.send_command(device_id, "windowShade", "open", component=component)

    def shade_close(self, device_id: str) -> dict[str, Any]:
        # 'close' is often not in supportedWindowShadeCommands for Inoshade-style drivers,
        # so route through switchLevel which is universally honored.
        return self.send_command(device_id, "switchLevel", "setLevel", component="main", arguments=[0])

    def shade_pause(self, device_id: str, component: str = "blind") -> dict[str, Any]:
        return self.send_command(device_id, "windowShade", "pause", component=component)

    def get_shade_state(self, status: dict, component: str = "blind") -> str | None:
        try:
            return status["components"][component]["windowShade"]["windowShade"]["value"]
        except (KeyError, TypeError):
            return None

    def get_switch_state(self, status: dict) -> bool:
        try:
            val = status["components"]["main"]["switch"]["switch"]["value"]
            return val == "on"
        except (KeyError, TypeError):
            return False

    def get_level(self, status: dict) -> int | None:
        try:
            return int(status["components"]["main"]["switchLevel"]["level"]["value"])
        except (KeyError, TypeError):
            return None

    def build_catalog_entry(self, device: dict) -> dict:
        caps: list[str] = []
        for comp in device.get("components", []):
            if comp.get("id") == "main":
                caps = [c["id"] for c in comp.get("capabilities", [])]

        shade_component = find_window_shade_component(device)
        if shade_component:
            icon_key, screen = "blind", "blind"
        else:
            icon_key, screen = capabilities_to_icon(caps)

        label = device.get("label") or device.get("name") or "Unknown"
        cap_preview = ", ".join(caps[:3])
        entry = {
            "deviceId": device["deviceId"],
            "name": device.get("name", ""),
            "label": label,
            "iconKey": icon_key,
            "screen": screen,
            "sub": f"SmartThings · {cap_preview}" if cap_preview else "SmartThings",
            "capabilities": caps,
        }
        if shade_component:
            entry["blindComponent"] = shade_component
        return entry


class SmartThingsNotConnected(Exception):
    """사용자가 SmartThings OAuth 연결을 안 했거나 토큰 갱신이 실패한 상태."""


def get_client(username: str | None = None, home_id: str | None = None) -> SmartThingsClient:
    """
    SmartThings 클라이언트 발급.

    새 구조에서는 대상 home_id에 저장된 토큰을 우선 사용한다. 기존 배포에서
    admin username으로 저장된 토큰은 fallback으로 유지해서 즉시 끊기지 않게 한다.
    """
    # 순환 import 방지: 함수 내부에서 import
    from smartthings_oauth import get_valid_access_token
    from auth import find_first_admin
    token = None
    home = None
    if username:
        try:
            import home_store
            home = home_store.get_home_for_user(username, home_id)
            token = get_valid_access_token(home["id"])
        except Exception:
            home = None
            token = None
    if token:
        return SmartThingsClient(token)

    admin = find_first_admin()
    if not admin:
        raise SmartThingsNotConnected("No admin user configured")
    token = None
    try:
        import scale_store
        if username and home and home.get("id") == scale_store._default_home_id(admin):
            token = get_valid_access_token(admin)
    except Exception:
        token = None
    if not token:
        raise SmartThingsNotConnected(
            "SmartThings not connected (admin must connect first)"
        )
    return SmartThingsClient(token)
