from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

log = logging.getLogger("auth")

UNIPASS_BASE_URL = os.getenv("UNIPASS_BASE_URL", "http://localhost:4000").rstrip("/")
UNIPASS_ME_URL = f"{UNIPASS_BASE_URL}/auth/me"
UNIPASS_TIMEOUT_SECONDS = float(os.getenv("UNIPASS_TIMEOUT_SECONDS", "8"))
TOKEN_CACHE_SECONDS = int(os.getenv("UNIPASS_TOKEN_CACHE_SECONDS", "30"))

ROLES_FILE = Path(__file__).parent / "nook_roles.json"

_bearer = HTTPBearer()
_cache_lock = threading.Lock()
_role_lock = threading.Lock()
_token_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _csv_env(name: str) -> set[str]:
    return {
        part.strip().lower()
        for part in os.getenv(name, "").split(",")
        if part.strip()
    }


def _configured_admin_ids() -> set[str]:
    return _csv_env("NOOK_ADMIN_USER_IDS") | _csv_env("NOOK_ADMIN_SUBJECTS")


def _configured_admin_handles() -> set[str]:
    return _csv_env("NOOK_ADMIN_HANDLES")


def _configured_admin_emails() -> set[str]:
    return _csv_env("NOOK_ADMIN_EMAILS")


def _load_roles_unlocked() -> dict[str, Any]:
    if ROLES_FILE.exists():
        try:
            data = json.loads(ROLES_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("users", {})
                return data
        except Exception:
            log.warning("nook_roles.json is invalid; recreating role store")
    return {"users": {}}


def _save_roles_unlocked(data: dict[str, Any]) -> None:
    tmp = ROLES_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, ROLES_FILE)


def _normalize_profile(profile: dict[str, Any]) -> dict[str, Any]:
    user_id = str(profile.get("id") or profile.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unipass user id is missing")

    handle = str(profile.get("handle") or "").strip()
    email = str(profile.get("email") or "").strip()
    display_name = str(profile.get("displayName") or "").strip()

    # Existing nook state was keyed by local usernames. Prefer the Unipass handle
    # so a matching handle can keep service-specific device/settings state.
    username = handle or user_id

    return {
        **profile,
        "id": user_id,
        "username": username,
        "handle": handle or None,
        "email": email or None,
        "displayName": display_name or None,
    }


def _is_configured_admin(user: dict[str, Any]) -> bool:
    user_id = str(user.get("id") or "").lower()
    handle = str(user.get("handle") or "").lower()
    email = str(user.get("email") or "").lower()
    return (
        user_id in _configured_admin_ids()
        or handle in _configured_admin_handles()
        or email in _configured_admin_emails()
    )


def _role_for_user(user: dict[str, Any]) -> str:
    key = user["username"]
    now = int(time.time())

    with _role_lock:
        data = _load_roles_unlocked()
        users = data.setdefault("users", {})
        stored = users.get(key)
        configured_admin = _is_configured_admin(user)

        if isinstance(stored, dict) and stored.get("role") in ("admin", "member"):
            role = "admin" if configured_admin else stored["role"]
        else:
            has_admin = any(
                isinstance(entry, dict) and entry.get("role") == "admin"
                for entry in users.values()
            )
            role = "admin" if configured_admin or not has_admin else "member"

        users[key] = {
            "role": role,
            "unipassId": user.get("id"),
            "handle": user.get("handle"),
            "email": user.get("email"),
            "displayName": user.get("displayName"),
            "lastSeenAt": now,
        }
        _save_roles_unlocked(data)
        return role


def _fetch_unipass_user(access_token: str) -> dict[str, Any]:
    try:
        res = requests.get(
            UNIPASS_ME_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=UNIPASS_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        log.warning("Unipass token verification failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unipass 인증 서버에 연결할 수 없습니다.")

    if res.status_code in (401, 403):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired Unipass token")
    if not res.ok:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unipass 계정 정보를 확인하지 못했습니다.")

    try:
        profile = res.json()
    except ValueError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unipass 응답 형식이 올바르지 않습니다.")

    user = _normalize_profile(profile)
    user["role"] = _role_for_user(user)
    return user


def require_unipass_user(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict[str, Any]:
    token = credentials.credentials
    now = time.time()

    with _cache_lock:
        cached = _token_cache.get(token)
        if cached and cached[0] > now:
            return cached[1]

    user = _fetch_unipass_user(token)

    with _cache_lock:
        _token_cache[token] = (now + TOKEN_CACHE_SECONDS, user)
    return user


def require_auth(user: dict[str, Any] = Depends(require_unipass_user)) -> str:
    return user["username"]


def require_admin(user: dict[str, Any] = Depends(require_unipass_user)) -> str:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user["username"]


def get_role(username: str) -> str | None:
    with _role_lock:
        entry = _load_roles_unlocked().get("users", {}).get(username)
    return entry.get("role") if isinstance(entry, dict) else None


def list_users() -> list[dict[str, Any]]:
    with _role_lock:
        users = _load_roles_unlocked().get("users", {})
    out = []
    for username, entry in users.items():
        if isinstance(entry, dict):
            out.append({
                "username": username,
                "role": entry.get("role", "member"),
                "handle": entry.get("handle"),
                "email": entry.get("email"),
                "displayName": entry.get("displayName"),
            })
    return out


def find_first_admin() -> str | None:
    for user in list_users():
        if user.get("role") == "admin":
            return user["username"]
    return None


__all__ = [
    "require_unipass_user",
    "require_auth",
    "require_admin",
    "list_users",
    "get_role",
    "find_first_admin",
]
