from __future__ import annotations

import copy
import os
import threading
import time
from typing import Any


DEFAULT_TTL_SECONDS = float(os.getenv("NOOK_XIAOMI_STATUS_CACHE_SECONDS", "5"))

_lock = threading.Lock()
_cache: dict[tuple[str, str, str], tuple[float, dict[str, Any]]] = {}


def _device_key(device: dict[str, Any] | str) -> tuple[str, str, str]:
    if isinstance(device, str):
        return (device, "", "")
    return (
        str(device.get("id") or device.get("xiaomiDid") or ""),
        str(device.get("type") or ""),
        str(device.get("xiaomiIp") or ""),
    )


def is_cacheable_xiaomi(device: dict[str, Any]) -> bool:
    return (
        device.get("provider") == "xiaomi"
        and device.get("type") in ("fan", "airpurifier")
        and DEFAULT_TTL_SECONDS > 0
    )


def get_cached_status(device: dict[str, Any]) -> dict[str, Any] | None:
    if not is_cacheable_xiaomi(device):
        return None

    now = time.monotonic()
    key = _device_key(device)
    with _lock:
        hit = _cache.get(key)
        if not hit:
            return None
        expires_at, status = hit
        if expires_at <= now:
            _cache.pop(key, None)
            return None
        return copy.deepcopy(status)


def set_cached_status(device: dict[str, Any], status: dict[str, Any]) -> None:
    if not is_cacheable_xiaomi(device):
        return

    with _lock:
        _cache[_device_key(device)] = (
            time.monotonic() + DEFAULT_TTL_SECONDS,
            copy.deepcopy(status),
        )


def invalidate_device(device: dict[str, Any] | str) -> None:
    key = _device_key(device)
    with _lock:
        if isinstance(device, str):
            device_id = key[0]
            for cached_key in list(_cache.keys()):
                if cached_key[0] == device_id:
                    _cache.pop(cached_key, None)
            return
        _cache.pop(key, None)


def clear() -> None:
    with _lock:
        _cache.clear()
