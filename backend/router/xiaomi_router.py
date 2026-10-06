from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import require_admin, require_auth
from devices.xiaomi_cloud import (
    XiaomiCloudSession,
    clear_session,
    create_session,
    get_session,
    map_to_catalog_entry,
)
import home_store
from state import load_xiaomi_catalog, save_xiaomi_catalog

router = APIRouter()


class LoginBody(BaseModel):
    username: str
    password: str


class CodeBody(BaseModel):
    code: str


def _session_key(username: str, home_id: str) -> str:
    return f"{username}:{home_id}"


def _target_home(username: str, home_id: str | None) -> dict:
    return home_store.get_home_for_user(username, home_id)


def _require_home_owner(username: str, home: dict) -> None:
    if home.get("owner_user_id") != username:
        raise HTTPException(403, "owner_required")


def _save_catalog(raw: list[dict], home_id: str) -> list[dict]:
    """Persist the latest cloud-fetched device list for one Nook home."""
    catalog = [map_to_catalog_entry(d) for d in raw]
    save_xiaomi_catalog(catalog, datetime.now(timezone.utc).isoformat(), home_id=home_id)
    return catalog


def _annotate_added(catalog: list[dict], username: str, home_id: str | None) -> list[dict]:
    """Mark catalog rows already added to the caller's personal main page."""
    added_dids = {
        d.get("xiaomiDid")
        for d in home_store.user_devices_for_home(username, home_id, include_legacy=home_id is None)
        if d.get("provider") == "xiaomi" and d.get("xiaomiDid")
    }
    out = []
    for entry in catalog:
        copy = dict(entry)
        copy["alreadyAdded"] = entry.get("did") in added_dids
        out.append(copy)
    return out


def _finish_if_ready(admin_username: str, sess: XiaomiCloudSession, snap: dict, home_id: str) -> dict:
    """If the session reached READY, fetch + persist the catalog and include it
    in the response so the UI can transition straight to the device list without
    a second round trip."""
    if snap.get("state") != XiaomiCloudSession.STATE_READY:
        return snap
    try:
        raw = sess.fetch_devices()
    except Exception as e:
        snap = {**snap, "state": XiaomiCloudSession.STATE_FAILED, "error": f"기기 목록 불러오기 실패: {e}"}
        clear_session(_session_key(admin_username, home_id))
        return snap
    catalog = _save_catalog(raw, home_id)
    snap = dict(snap)
    snap["catalog"] = _annotate_added(catalog, admin_username, home_id)
    return snap


@router.post("/login")
def login(
    body: LoginBody,
    home_id: str | None = Query(default=None, alias="homeId"),
    admin_username: str = Depends(require_admin),
) -> dict:
    home = _target_home(admin_username, home_id)
    _require_home_owner(admin_username, home)
    sess = create_session(_session_key(admin_username, home["id"]))
    snap = sess.start(body.username, body.password)
    return _finish_if_ready(admin_username, sess, snap, home["id"])


@router.post("/captcha")
def submit_captcha(
    body: CodeBody,
    home_id: str | None = Query(default=None, alias="homeId"),
    admin_username: str = Depends(require_admin),
) -> dict:
    home = _target_home(admin_username, home_id)
    _require_home_owner(admin_username, home)
    sess = get_session(_session_key(admin_username, home["id"]))
    if sess is None:
        raise HTTPException(409, "활성 로그인 세션이 없습니다. 다시 로그인하세요.")
    snap = sess.submit_captcha(body.code)
    return _finish_if_ready(admin_username, sess, snap, home["id"])


@router.post("/2fa")
def submit_2fa(
    body: CodeBody,
    home_id: str | None = Query(default=None, alias="homeId"),
    admin_username: str = Depends(require_admin),
) -> dict:
    home = _target_home(admin_username, home_id)
    _require_home_owner(admin_username, home)
    sess = get_session(_session_key(admin_username, home["id"]))
    if sess is None:
        raise HTTPException(409, "활성 로그인 세션이 없습니다. 다시 로그인하세요.")
    snap = sess.submit_2fa(body.code)
    return _finish_if_ready(admin_username, sess, snap, home["id"])


@router.post("/logout")
def logout(
    home_id: str | None = Query(default=None, alias="homeId"),
    admin_username: str = Depends(require_admin),
) -> dict:
    home = _target_home(admin_username, home_id)
    _require_home_owner(admin_username, home)
    clear_session(_session_key(admin_username, home["id"]))
    return {"ok": True}


@router.get("/catalog")
def catalog(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
) -> dict[str, Any]:
    """Return the saved catalog (last fetched device list). Empty list if no
    successful fetch has happened yet. 모든 home 멤버가 대상 home 카탈로그
    조회 가능. 단, 카탈로그 새로고침/로그인은 admin+owner 만 (아래 /refresh, /login)."""
    home = _target_home(username, home_id)
    cat, fetched_at = load_xiaomi_catalog(home["id"])
    return {
        "catalog": _annotate_added(cat, username, home["id"]),
        "fetchedAt": fetched_at or None,
        "home": home,
    }


@router.post("/refresh")
def refresh(
    home_id: str | None = Query(default=None, alias="homeId"),
    admin_username: str = Depends(require_admin),
) -> dict[str, Any]:
    """Re-fetch the device list using the active session. If no session (or
    not yet ready), respond with the session state so the UI can prompt for
    login/captcha/2fa."""
    home = _target_home(admin_username, home_id)
    _require_home_owner(admin_username, home)
    key = _session_key(admin_username, home["id"])
    sess = get_session(key)
    if sess is None or sess.state != XiaomiCloudSession.STATE_READY:
        if sess is None:
            return {"state": "needs_login"}
        return sess.snapshot()
    try:
        raw = sess.fetch_devices()
    except Exception as e:
        # Session probably expired — drop it so the UI re-prompts for login.
        clear_session(key)
        raise HTTPException(502, f"기기 목록 불러오기 실패: {e}")
    catalog = _save_catalog(raw, home["id"])
    _, fetched_at = load_xiaomi_catalog(home["id"])
    return {
        "state": "ready",
        "catalog": _annotate_added(catalog, admin_username, home["id"]),
        "fetchedAt": fetched_at or None,
        "home": home,
    }
