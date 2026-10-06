from __future__ import annotations

import os

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from auth import find_first_admin, require_auth
import home_store
import scale_store
from smartthings_oauth import (
    build_authorize_url,
    consume_state,
    delete_user_tokens,
    exchange_code_for_token,
    load_user_tokens,
    save_user_tokens,
)

router = APIRouter()

# 콜백 후 사용자를 어디로 돌려보낼지. 환경변수로 override 가능.
FRONTEND_BASE = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")


@router.post("/start")
def start(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    """프론트엔드가 호출. authorize_url 을 받아 window.location 으로 이동시킴."""
    home = home_store.get_home_for_user(username, home_id)
    if home.get("owner_user_id") != username:
        raise HTTPException(403, "owner_required")
    return {"authorize_url": build_authorize_url(home["id"])}


@router.get("/callback")
def callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
):
    """SmartThings 가 사용자를 redirect 시키는 엔드포인트. 인증 헤더 없이 호출됨."""
    if error:
        return _result_page(
            ok=False,
            title="SmartThings 연결 실패",
            message=f"{error}: {error_description or ''}",
        )
    if not code or not state:
        raise HTTPException(400, "Missing code or state")

    token_key = consume_state(state)
    if token_key is None:
        return _result_page(ok=False, title="유효하지 않은 요청", message="state 가 만료되었거나 위조되었습니다.")

    try:
        token_response = exchange_code_for_token(code)
    except requests.HTTPError as e:
        body = ""
        try:
            body = e.response.text[:300] if e.response is not None else ""
        except Exception:
            pass
        return _result_page(
            ok=False,
            title="토큰 교환 실패",
            message=f"SmartThings 응답: {e} {body}",
        )

    save_user_tokens(token_key, token_response)

    # 성공 시 프론트로 돌려보내며 쿼리 플래그
    return RedirectResponse(url=f"{FRONTEND_BASE}/?st=connected")


@router.get("/status")
def status(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    """대상 home의 SmartThings 연결 상태."""
    home = home_store.get_home_for_user(username, home_id)
    token_key = home["id"]
    legacy_key = find_first_admin()
    record = load_user_tokens(token_key)
    token_scope = "home"
    if not record and legacy_key and home.get("id") == scale_store._default_home_id(legacy_key):
        record = load_user_tokens(legacy_key)
        token_scope = "legacy_admin"
    if not record:
        return {"connected": False, "home": home, "canManage": home.get("owner_user_id") == username}
    return {
        "connected": True,
        "expires_at": record["expires_at"],
        "scope": record.get("scope", ""),
        "tokenScope": token_scope,
        "home": home,
        "canManage": home.get("owner_user_id") == username,
    }


@router.post("/disconnect")
def disconnect(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    home = home_store.get_home_for_user(username, home_id)
    if home.get("owner_user_id") != username:
        raise HTTPException(403, "owner_required")
    removed = delete_user_tokens(home["id"])
    legacy_key = find_first_admin()
    if legacy_key == username and home.get("id") == scale_store._default_home_id(legacy_key):
        removed = delete_user_tokens(legacy_key) or removed
    return {"removed": removed}


def _result_page(*, ok: bool, title: str, message: str) -> HTMLResponse:
    color = "#16a34a" if ok else "#dc2626"
    html = f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>{title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:system-ui,-apple-system;text-align:center;padding:80px 20px;background:#f5f5f5;color:#222}}
h1{{color:{color}}} a{{color:#2563eb}}</style></head>
<body><h1>{title}</h1><p style="color:#666;max-width:600px;margin:20px auto">{message}</p>
<p><a href="{FRONTEND_BASE}/">홈으로</a></p></body></html>"""
    return HTMLResponse(html, status_code=200 if ok else 400)
