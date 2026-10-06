from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from auth import require_auth
from notifications import (
    add_subscription, get_prefs, remove_subscription, send_to_user,
    set_prefs, vapid_public_key,
)

router = APIRouter()


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class SubscriptionBody(BaseModel):
    endpoint: str
    keys: PushKeys


class UnsubscribeBody(BaseModel):
    endpoint: str


class WeatherPrefs(BaseModel):
    enabled: bool | None = None
    time: str | None = None


class PrefsBody(BaseModel):
    weather: WeatherPrefs | None = None


@router.get("/vapid-public-key")
def get_vapid_public_key():
    """Public — 클라이언트는 인증 없이도 키를 받아 SW 등록에 사용 가능 (값 자체는 비밀이 아님)."""
    return {"publicKey": vapid_public_key()}


@router.post("/subscribe")
def subscribe(
    body: SubscriptionBody,
    user_agent: str | None = Header(default=None),
    username: str = Depends(require_auth),
):
    count = add_subscription(username, body.model_dump(), ua=user_agent or "")
    return {"ok": True, "count": count}


@router.post("/unsubscribe")
def unsubscribe(body: UnsubscribeBody, username: str = Depends(require_auth)):
    count = remove_subscription(username, body.endpoint)
    return {"ok": True, "count": count}


@router.get("/prefs")
def read_prefs(username: str = Depends(require_auth)):
    return get_prefs(username)


@router.post("/prefs")
def write_prefs(body: PrefsBody, username: str = Depends(require_auth)):
    return set_prefs(username, body.model_dump(exclude_none=True))


@router.post("/test")
def send_test(username: str = Depends(require_auth)):
    """수동 테스트용 — 구독 후 알림이 정상적으로 오는지 확인."""
    result = send_to_user(username, {
        "title": "nook 알림 테스트",
        "body": "구독이 정상적으로 작동합니다.",
        "url": "/",
    })
    return result
