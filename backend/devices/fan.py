from __future__ import annotations

import os
from typing import Any


class XiaomiFan1X:
    def __init__(self, ip: str, token: str):
        self.dev = self._create_device(ip, token)

    def _create_device(self, ip: str, token: str):
        try:
            from miio import MiotDevice
            return MiotDevice(ip, token, mapping={})
        except ImportError:
            from miio import DeviceFactory
            return DeviceFactory.create(ip, token)

    def _extract_value(self, response: Any) -> Any:
        if isinstance(response, list) and response:
            first = response[0]
            if isinstance(first, dict) and "value" in first:
                return first["value"]
        return response

    def _get_property(self, siid: int, piid: int) -> Any:
        sender = getattr(self.dev, "send", None)
        if callable(sender):
            response = sender(
                "get_properties",
                [{"did": f"{siid}-{piid}", "siid": siid, "piid": piid}],
            )
            return self._extract_value(response)
        raise RuntimeError("Cannot read MIoT properties")

    def _get_properties_batch(self, props: list[tuple[int, int]]) -> dict[tuple[int, int], Any]:
        """Read multiple MIoT properties in a single round trip. Returns
        {(siid, piid): value} for entries that responded with code 0."""
        sender = getattr(self.dev, "send", None)
        if not callable(sender):
            raise RuntimeError("Cannot read MIoT properties")
        payload = [{"did": f"{siid}-{piid}", "siid": siid, "piid": piid} for siid, piid in props]
        response = sender("get_properties", payload)
        out: dict[tuple[int, int], Any] = {}
        if isinstance(response, list):
            for item in response:
                if not isinstance(item, dict):
                    continue
                siid = item.get("siid")
                piid = item.get("piid")
                if siid is None or piid is None:
                    continue
                if item.get("code", 0) == 0 and "value" in item:
                    out[(siid, piid)] = item["value"]
        return out

    def _set_property(self, siid: int, piid: int, value: Any):
        return self.dev.send(
            "set_properties",
            [{"did": f"set-{siid}-{piid}", "siid": siid, "piid": piid, "value": value}],
        )

    def _call_action(self, siid: int, aiid: int, params: list | None = None):
        return self.dev.send(
            "action",
            {"did": f"call-{siid}-{aiid}", "siid": siid, "aiid": aiid, "in": params or []},
        )

    def fan_on(self):
        return self._set_property(2, 1, True)

    def fan_off(self):
        return self._set_property(2, 1, False)

    def set_speed(self, percent: int):
        return self._set_property(8, 1, max(1, min(100, int(percent))))

    def set_oscillation(self, enabled: bool):
        return self._set_property(2, 4, enabled)

    def set_angle(self, angle: int):
        return self._set_property(2, 5, int(angle))

    def set_mode(self, mode: int):
        # 바람 모드. dmaker.fan.p5c 기준: 0=직풍(Normal/Straight), 1=자연풍(Natural).
        # 일부 펌웨어는 매핑이 반대일 수 있음 — 라벨이 뒤집혀 보이면 프런트에서
        # 0/1 만 바꾸면 됨.
        return self._set_property(2, 3, int(mode))

    def turn_left_once(self):
        return self._call_action(2, 2)

    def turn_right_once(self):
        return self._call_action(2, 3)

    def get_status(self) -> dict:
        # Single batched MIoT call. Network failures (timeout, unreachable IP)
        # propagate so the caller can mark the device offline — silently
        # returning an all-None dict here would let the UI show stale "online"
        # values for an unreachable fan.
        props = [(2, 1), (8, 1), (2, 4), (2, 5), (2, 3)]  # power, speed, osc, angle, mode
        values = self._get_properties_batch(props)
        return {
            "power":       values.get((2, 1)),
            "speed":       values.get((8, 1)),
            "oscillation": values.get((2, 4)),
            "angle":       values.get((2, 5)),
            "mode":        values.get((2, 3)),
        }


def get_fan() -> XiaomiFan1X:
    ip = os.getenv("MIIO_FAN_IP", "")
    token = os.getenv("MIIO_FAN_TOKEN", "")
    return XiaomiFan1X(ip, token)


def make_fan(ip: str, token: str) -> XiaomiFan1X:
    """Build a fan client for an arbitrary IP/token (e.g. a device discovered
    via Xiaomi cloud and added to the home, where each fan has its own
    credentials rather than the env-configured singleton)."""
    if not ip or not token:
        raise ValueError("Fan IP and token are required")
    return XiaomiFan1X(ip, token)
