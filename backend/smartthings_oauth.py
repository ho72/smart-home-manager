from __future__ import annotations

import json
import os
import secrets
import threading
import time
from pathlib import Path
from typing import Optional

import requests

AUTHORIZE_URL = "https://api.smartthings.com/oauth/authorize"
TOKEN_URL = "https://api.smartthings.com/oauth/token"
SCOPES = ["r:devices:*", "x:devices:*", "r:locations:*"]
STATE_TTL_SECONDS = 10 * 60  # OAuth state 유효시간

TOKENS_FILE = Path(__file__).parent / "smartthings_tokens.json"
_tokens_lock = threading.Lock()

# state → (token_key, created_at). token_key는 새 구조에서 home_id.
# 단일 프로세스 메모리 저장. multi-worker 시 별도 저장 필요.
_state_store: dict[str, tuple[str, float]] = {}
_state_lock = threading.Lock()


def _client_id() -> str:
    return os.environ["SMARTTHINGS_CLIENT_ID"]


def _client_secret() -> str:
    return os.environ["SMARTTHINGS_CLIENT_SECRET"]


def _redirect_uri() -> str:
    return os.environ["SMARTTHINGS_REDIRECT_URI"]


def build_authorize_url(token_key: str) -> str:
    """현재 active home token_key 에 대해 state 발급 후 SmartThings authorize URL 생성."""
    state = secrets.token_urlsafe(32)
    now = time.time()
    with _state_lock:
        # 만료된 state 청소
        expired = [s for s, (_, t) in _state_store.items() if now - t > STATE_TTL_SECONDS]
        for s in expired:
            _state_store.pop(s, None)
        _state_store[state] = (token_key, now)

    from urllib.parse import urlencode
    params = {
        "client_id": _client_id(),
        "response_type": "code",
        "redirect_uri": _redirect_uri(),
        "scope": " ".join(SCOPES),
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def consume_state(state: str) -> Optional[str]:
    """state 를 1회용으로 소비. 유효하면 token_key 반환, 아니면 None."""
    with _state_lock:
        entry = _state_store.pop(state, None)
    if entry is None:
        return None
    token_key, created_at = entry
    if time.time() - created_at > STATE_TTL_SECONDS:
        return None
    return token_key


def exchange_code_for_token(code: str) -> dict:
    """Authorization code 를 access/refresh token 으로 교환."""
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _redirect_uri(),
        },
        auth=(_client_id(), _client_secret()),  # SmartThings 는 Basic auth 권장
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict:
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        auth=(_client_id(), _client_secret()),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


# ── token_key별 토큰 저장 ───────────────────────────────────────────

def _load_all_tokens() -> dict:
    if TOKENS_FILE.exists():
        try:
            return json.loads(TOKENS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_all_tokens(data: dict) -> None:
    TOKENS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    # 토큰 파일은 600 으로 (다른 사용자 read 차단)
    try:
        os.chmod(TOKENS_FILE, 0o600)
    except OSError:
        pass


def save_user_tokens(token_key: str, token_response: dict) -> None:
    """SmartThings 토큰 응답을 token_key(home_id)에 저장. expires_at 은 epoch 초로 환산."""
    expires_at = int(time.time()) + int(token_response.get("expires_in", 0))
    record = {
        "access_token": token_response["access_token"],
        "refresh_token": token_response.get("refresh_token"),
        "expires_at": expires_at,
        "scope": token_response.get("scope", ""),
        "installed_app_id": token_response.get("installed_app_id"),
        "updated_at": int(time.time()),
    }
    with _tokens_lock:
        data = _load_all_tokens()
        data[token_key] = record
        _save_all_tokens(data)


def load_user_tokens(token_key: str) -> Optional[dict]:
    with _tokens_lock:
        return _load_all_tokens().get(token_key)


def delete_user_tokens(token_key: str) -> bool:
    with _tokens_lock:
        data = _load_all_tokens()
        if token_key in data:
            del data[token_key]
            _save_all_tokens(data)
            return True
    return False


def get_valid_access_token(token_key: str) -> Optional[str]:
    """저장된 access_token 이 유효하면 반환, 만료 임박이면 refresh 시도."""
    record = load_user_tokens(token_key)
    if not record:
        return None
    # 만료 60초 이내면 refresh
    if record["expires_at"] - time.time() > 60:
        return record["access_token"]
    refresh = record.get("refresh_token")
    if not refresh:
        return None
    try:
        new_token = refresh_access_token(refresh)
    except requests.HTTPError:
        return None
    save_user_tokens(token_key, new_token)
    return new_token["access_token"]
