"""
Xiaomi 공기청정기 제어 (MIoT 프로토콜).

매핑은 python-miio 의 integrations/airpurifier/zhimi/airpurifier_miot.py 와 동일.
모델별로 siid/piid 가 다르고 일부 속성(humidity, temperature, fan_level, led)은
모델에 없을 수도 있음. get_status 는 매핑에 있는 속성만 읽고 없는 키는 None
으로 둠 — 프런트가 '—' 로 표시.
"""
from __future__ import annotations

from typing import Any

# (siid, piid). MB3 / MA4 / VA1 / VB2 — Mi Air Purifier 3 / 3H / Pro H 시리즈.
_MAPPING_MB3 = {
    "power":                 (2, 2),
    "fan_level":             (2, 4),  # 1-3 (mode==Fan 일 때만 의미)
    "mode":                  (2, 5),  # 0=Auto, 1=Silent, 2=Favorite, 3=Fan
    "humidity":              (3, 7),
    "temperature":           (3, 8),
    "aqi":                   (3, 6),
    "filter_life_remaining": (4, 3),
    "filter_hours_used":     (4, 5),
    "buzzer":                (5, 1),
    "led_brightness":        (6, 1),
    "led":                   (6, 6),
    "child_lock":            (7, 1),
    "favorite_level":        (10, 10),
    "motor_speed":           (10, 8),
    "average_aqi":           (13, 2),
}

# MB4 / MB4A — Mi Air Purifier 3C. fan_level / humidity / temperature / led 없음.
_MAPPING_MB4 = {
    "power":                 (2, 1),
    "mode":                  (2, 4),
    "aqi":                   (3, 4),
    "filter_life_remaining": (4, 1),
    "filter_hours_used":     (4, 3),
    "buzzer":                (6, 1),
    "led_brightness":        (7, 2),
    "child_lock":            (8, 1),
    "motor_speed":           (9, 1),
}

# VA2 / MB5 — Mi Air Purifier 4 / 4 Pro.
_MAPPING_VA2 = {
    "power":                 (2, 1),
    "mode":                  (2, 4),
    "fan_level":             (2, 5),
    "humidity":              (3, 1),
    "aqi":                   (3, 4),
    "temperature":           (3, 7),
    "filter_life_remaining": (4, 1),
    "filter_hours_used":     (4, 3),
    "buzzer":                (6, 1),
    "child_lock":            (8, 1),
    "motor_speed":           (9, 1),
    "favorite_level":        (9, 5),
    "average_aqi":           (11, 2),
    "led_brightness":        (13, 2),
}

# VB4 — Mi Air Purifier 4 Pro 변종. VA2 와 거의 같지만 PM10 추가.
_MAPPING_VB4 = {
    **_MAPPING_VA2,
    "pm10_density":          (3, 8),
}

# RMA1 / RMB1 — Mi Air Purifier 4 Lite.
_MAPPING_RMA1 = {
    "power":                 (2, 1),
    "mode":                  (2, 4),
    "humidity":              (3, 1),
    "aqi":                   (3, 4),
    "temperature":           (3, 7),
    "filter_life_remaining": (4, 1),
    "filter_hours_used":     (4, 3),
    "buzzer":                (6, 1),
    "child_lock":            (8, 1),
    "motor_speed":           (9, 1),
    "favorite_level":        (9, 2),
    "led_brightness":        (13, 2),
}
_MAPPING_RMB1 = {
    **_MAPPING_RMA1,
    "favorite_level":        (9, 5),
}

# ZA1 — Smartmi Air Purifier. MB3 와 비슷하지만 motor_speed 위치가 다르고 TVOC.
_MAPPING_ZA1 = {
    "power":                 (2, 1),
    "fan_level":             (2, 4),
    "mode":                  (2, 5),
    "humidity":              (3, 7),
    "temperature":           (3, 8),
    "aqi":                   (3, 6),
    "tvoc":                  (3, 1),
    "filter_life_remaining": (4, 3),
    "filter_hours_used":     (4, 5),
    "buzzer":                (5, 1),
    "led_brightness":        (6, 1),
    "child_lock":            (7, 1),
    "favorite_level":        (10, 10),
    "motor_speed":           (10, 11),
    "average_aqi":           (13, 2),
}

_MODEL_TO_MAPPING: dict[str, dict[str, tuple[int, int]]] = {
    # Mi Air Purifier 3 / 3H / Pro H
    "zhimi.airpurifier.ma4":  _MAPPING_MB3,
    "zhimi.airpurifier.mb3":  _MAPPING_MB3,
    "zhimi.airpurifier.mb3a": _MAPPING_MB3,
    "zhimi.airpurifier.va1":  _MAPPING_MB3,
    "zhimi.airpurifier.vb2":  _MAPPING_MB3,
    # Mi Air Purifier 3C
    "zhimi.airpurifier.mb4":  _MAPPING_MB4,
    "zhimi.airp.mb4a":        _MAPPING_MB4,
    # Mi Air Purifier 4 / 4 Pro
    "zhimi.airp.mb5":         _MAPPING_VA2,
    "zhimi.airp.va2":         _MAPPING_VA2,
    "zhimi.airp.vb4":         _MAPPING_VB4,
    # Mi Air Purifier 4 Lite
    "zhimi.airpurifier.rma1": _MAPPING_RMA1,
    "zhimi.airp.rmb1":        _MAPPING_RMB1,
    # Smartmi
    "zhimi.airpurifier.za1":  _MAPPING_ZA1,
}

MODE_AUTO     = 0
MODE_SILENT   = 1
MODE_FAVORITE = 2
MODE_FAN      = 3


def is_supported_model(model: str) -> bool:
    return model in _MODEL_TO_MAPPING


class XiaomiAirPurifier:
    """LAN 직접 통신 (miio MiotDevice). status fetch 는 단일 batch get_properties."""

    def __init__(self, ip: str, token: str, model: str = "zhimi.airpurifier.mb3"):
        if not ip or not token:
            raise ValueError("Air purifier IP and token are required")
        self.model = model
        self.mapping = _MODEL_TO_MAPPING.get(model)
        if self.mapping is None:
            raise ValueError(f"Unsupported air purifier model: {model}")
        self.dev = self._create_device(ip, token)

    @staticmethod
    def _create_device(ip: str, token: str):
        try:
            from miio import MiotDevice
            return MiotDevice(ip, token, mapping={})
        except ImportError:
            from miio import DeviceFactory
            return DeviceFactory.create(ip, token)

    @staticmethod
    def _extract_value(response: Any) -> Any:
        if isinstance(response, list) and response:
            first = response[0]
            if isinstance(first, dict) and "value" in first:
                return first["value"]
        return response

    def _set_property(self, key: str, value: Any):
        if key not in self.mapping:
            raise ValueError(f"Unknown property {key!r} for {self.model}")
        siid, piid = self.mapping[key]
        return self.dev.send(
            "set_properties",
            [{"did": f"set-{siid}-{piid}", "siid": siid, "piid": piid, "value": value}],
        )

    def _get_properties_batch(self) -> dict[str, Any]:
        sender = getattr(self.dev, "send", None)
        if not callable(sender):
            raise RuntimeError("Cannot read MIoT properties")
        payload = [
            {"did": k, "siid": s, "piid": p}
            for k, (s, p) in self.mapping.items()
        ]
        response = sender("get_properties", payload)
        out: dict[str, Any] = {}
        if isinstance(response, list):
            for item in response:
                if not isinstance(item, dict):
                    continue
                did = item.get("did")
                if not did:
                    continue
                if item.get("code", 0) == 0 and "value" in item:
                    out[did] = item["value"]
        return out

    # ── commands ──
    def power_on(self):  return self._set_property("power", True)
    def power_off(self): return self._set_property("power", False)

    def set_mode(self, mode: int):
        if mode not in (MODE_AUTO, MODE_SILENT, MODE_FAVORITE, MODE_FAN):
            raise ValueError(f"Invalid mode {mode!r}")
        return self._set_property("mode", int(mode))

    def set_fan_level(self, level: int):
        # 1-3 — mode==Fan 일 때 의미 있음. 그 외에선 무시될 수 있음.
        return self._set_property("fan_level", max(1, min(3, int(level))))

    def set_favorite_level(self, level: int):
        # 0-14 — mode==Favorite 일 때 미세 단수.
        return self._set_property("favorite_level", max(0, min(14, int(level))))

    def set_buzzer(self, enabled: bool):
        return self._set_property("buzzer", bool(enabled))

    def set_led(self, enabled: bool):
        return self._set_property("led", bool(enabled))

    def set_led_brightness(self, level: int):
        # 0=Bright, 1=Dim, 2=Off
        return self._set_property("led_brightness", max(0, min(2, int(level))))

    def set_child_lock(self, enabled: bool):
        return self._set_property("child_lock", bool(enabled))

    def get_status(self) -> dict:
        """Status fetch. 매핑에 있는 키만 응답에 포함 — 모델별로 속성이 다른데
        ('display 없음', 'humidity 없음' 등) 프런트가 'undefined' 로 미지원 속성
        을 감지해 UI 를 숨길 수 있어야 함. 실패는 caller 에게 전파 (Offline 처리)."""
        values = self._get_properties_batch()
        # 내부 키 → 프런트 키 (camelCase). 매핑 dict 에 키가 있을 때만 노출.
        key_map = {
            "power": "power",
            "mode": "mode",
            "fan_level": "fanLevel",
            "favorite_level": "favoriteLevel",
            "aqi": "aqi",
            "average_aqi": "averageAqi",
            "humidity": "humidity",
            "temperature": "temperature",
            "tvoc": "tvoc",
            "pm10_density": "pm10",
            "filter_life_remaining": "filterLifeRemaining",
            "filter_hours_used": "filterHoursUsed",
            "buzzer": "buzzer",
            "led": "led",
            "led_brightness": "ledBrightness",
            "child_lock": "childLock",
            "motor_speed": "motorSpeed",
        }
        out: dict[str, Any] = {}
        for internal, frontend in key_map.items():
            if internal in self.mapping:
                out[frontend] = values.get(internal)
        return out


def make_air_purifier(ip: str, token: str, model: str = "zhimi.airpurifier.mb3") -> XiaomiAirPurifier:
    return XiaomiAirPurifier(ip, token, model)
