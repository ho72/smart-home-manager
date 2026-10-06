"""
Web Push 알림 — VAPID 서명 기반.

저장 구조 (state.json 사용자별):
  notificationPrefs: {
    weather: { enabled: bool, time: "HH:MM" }
  }
  pushSubscriptions: [
    { endpoint, keys: { p256dh, auth }, ua, createdAt }
  ]

VAPID 키:
  ./vapid_keys.json — 처음 호출 시 자동 생성. 서버 한 번만 만들고 재시작에도 유지.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePrivateKey, SECP256R1, generate_private_key
from cryptography.hazmat.primitives.serialization import (
    Encoding, NoEncryption, PrivateFormat, PublicFormat,
)
from pywebpush import webpush, WebPushException

from state import load_user_state, save_user_state

log = logging.getLogger("notifications")

VAPID_FILE = Path(__file__).parent / "vapid_keys.json"
_vapid_lock = threading.Lock()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _generate_vapid() -> dict:
    """ECDSA P-256 keypair. pywebpush 의 `vapid_private_key` 인자는 base64url-
    인코딩된 raw 32-byte 스칼라를 기대 (PEM 은 파일 경로일 때만 처리됨)."""
    pk = generate_private_key(SECP256R1())
    priv_raw = pk.private_numbers().private_value.to_bytes(32, "big")
    pub_raw = pk.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return {
        "privateB64": _b64url(priv_raw),  # pywebpush 에 직접 넘김
        "publicB64": _b64url(pub_raw),    # 브라우저가 applicationServerKey 로 사용
    }


def get_vapid() -> dict:
    """Load VAPID keys from disk, generating once on first run."""
    with _vapid_lock:
        if VAPID_FILE.exists():
            try:
                return json.loads(VAPID_FILE.read_text(encoding="utf-8"))
            except Exception:
                log.warning("vapid_keys.json corrupt — regenerating")
        keys = _generate_vapid()
        VAPID_FILE.write_text(json.dumps(keys, indent=2), encoding="utf-8")
        log.info("VAPID keys generated at %s", VAPID_FILE)
        return keys


def vapid_public_key() -> str:
    return get_vapid()["publicB64"]


# ── per-user store ───────────────────────────────────────────────────

def _claim_email() -> str:
    # Apple 의 web.push.apple.com 은 sub 클레임의 도메인 SLD 검증이 엄격해서
    # .local / .localhost 같은 Public Suffix List 등재 invalid TLD 면 403
    # BadJwtToken 으로 거부한다. gmail.com 같은 진짜 도메인 사용 필수.
    # 사용자별 운영 시엔 backend/.env 에 VAPID_CONTACT=mailto:you@yourdomain 으로 오버라이드.
    return os.environ.get("VAPID_CONTACT", "mailto:admin@example.test")


def list_subscriptions(username: str) -> list[dict]:
    return load_user_state(username).get("pushSubscriptions", [])


def add_subscription(username: str, sub: dict, ua: str = "") -> int:
    state = load_user_state(username)
    subs = state.get("pushSubscriptions", [])
    # endpoint 중복이면 최신 keys/ua 로 갱신만
    subs = [s for s in subs if s.get("endpoint") != sub.get("endpoint")]
    subs.append({**sub, "ua": ua, "createdAt": int(time.time())})
    state["pushSubscriptions"] = subs
    save_user_state(username, state)
    return len(subs)


def remove_subscription(username: str, endpoint: str) -> int:
    state = load_user_state(username)
    subs = [s for s in state.get("pushSubscriptions", []) if s.get("endpoint") != endpoint]
    state["pushSubscriptions"] = subs
    save_user_state(username, state)
    return len(subs)


def get_prefs(username: str) -> dict:
    prefs = load_user_state(username).get("notificationPrefs") or {}
    # 디폴트 값 보강 — 클라이언트가 항상 채워진 형태로 받도록.
    weather = prefs.get("weather") or {}
    return {
        "weather": {
            "enabled": bool(weather.get("enabled", False)),
            "time": weather.get("time", "08:00"),
            # lastFiredDay 는 내부 dedupe 용. UI 에는 노출 안 함.
        }
    }


def set_prefs(username: str, prefs: dict) -> dict:
    state = load_user_state(username)
    existing = state.get("notificationPrefs") or {}
    weather_in = (prefs.get("weather") or {})
    existing_weather = existing.get("weather") or {}
    new_weather = {
        "enabled": bool(weather_in.get("enabled", existing_weather.get("enabled", False))),
        "time": str(weather_in.get("time", existing_weather.get("time", "08:00"))),
    }
    # 시간/enabled 가 바뀌면 dedupe 마커 리셋해서 같은 날 다시 발송 가능하게.
    if (new_weather["enabled"] != existing_weather.get("enabled")
            or new_weather["time"] != existing_weather.get("time")):
        new_weather.pop("lastFiredDay", None)
    else:
        if "lastFiredDay" in existing_weather:
            new_weather["lastFiredDay"] = existing_weather["lastFiredDay"]
    state["notificationPrefs"] = {**existing, "weather": new_weather}
    save_user_state(username, state)
    return get_prefs(username)


# ── send ─────────────────────────────────────────────────────────────

def send_to_user(username: str, payload: dict) -> dict:
    """모든 구독자에게 발송. 410/404 응답이면 expired subscription 으로 간주하고 제거.
    반환: {sent: N, removed: M, errors: [...]}"""
    keys = get_vapid()
    subs = list_subscriptions(username)
    sent, removed, errors = 0, 0, []
    body = json.dumps(payload, ensure_ascii=False)
    expired_endpoints: list[str] = []
    for sub in subs:
        try:
            ep_host = sub["endpoint"].split("/")[2] if "/" in sub["endpoint"] else "?"
            log.info("push → host=%s endpoint=%s... keys.p256dh=%s... auth=%s...",
                     ep_host, sub["endpoint"][:60],
                     (sub.get("keys", {}).get("p256dh") or "")[:24],
                     (sub.get("keys", {}).get("auth") or "")[:8])
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": sub["keys"],
                },
                data=body,
                vapid_private_key=keys["privateB64"],
                vapid_claims={"sub": _claim_email()},
                ttl=60 * 60,
            )
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            body = getattr(getattr(e, "response", None), "text", "")
            log.warning("push failed: status=%s host=%s body=%s",
                        status, ep_host, (body or "")[:200])
            # 404/410 = endpoint gone, 403 = JWT 검증 실패 (보통 VAPID 키 mismatch).
            # 모두 클라이언트 재구독으로 self-heal 되므로 stale 로 간주하고 제거.
            if status in (404, 410, 403):
                expired_endpoints.append(sub["endpoint"])
                errors.append(f"{status}: {e}")
            else:
                errors.append(f"{status}: {e}")
        except Exception as e:
            errors.append(str(e))
            log.warning("push error (non-WebPushException): %s", e)
    for ep in expired_endpoints:
        remove_subscription(username, ep)
        removed += 1
    return {"sent": sent, "removed": removed, "errors": errors}
