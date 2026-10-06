import requests
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from auth import UNIPASS_BASE_URL, UNIPASS_TIMEOUT_SECONDS, require_unipass_user

router = APIRouter()


class RefreshRequest(BaseModel):
    refreshToken: str


class LogoutRequest(BaseModel):
    refreshToken: str


@router.post("/login")
def login_disabled():
    raise HTTPException(status_code=410, detail="nook 자체 이메일/비밀번호 로그인은 제거되었습니다. Unipass로 로그인해주세요.")


@router.post("/change-password")
def change_password_disabled():
    raise HTTPException(status_code=410, detail="비밀번호와 계정 정보는 Unipass에서 관리합니다.")


@router.post("/refresh")
def refresh(body: RefreshRequest):
    try:
        res = requests.post(
            f"{UNIPASS_BASE_URL}/auth/refresh",
            json={"refreshToken": body.refreshToken},
            timeout=UNIPASS_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Unipass 토큰 갱신에 실패했습니다: {exc}")

    try:
        payload = res.json()
    except ValueError:
        payload = {"error": res.text}

    if not res.ok:
        raise HTTPException(status_code=res.status_code, detail=payload.get("error") or payload.get("detail") or "Unipass 토큰 갱신에 실패했습니다.")
    return payload


@router.post("/logout")
def logout(body: LogoutRequest, authorization: str | None = Header(default=None)):
    headers = {"Authorization": authorization} if authorization else {}
    try:
        res = requests.post(
            f"{UNIPASS_BASE_URL}/auth/logout",
            json={"refreshToken": body.refreshToken},
            headers=headers,
            timeout=UNIPASS_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return {"ok": True}

    if res.status_code in (401, 403):
        return {"ok": True}
    if not res.ok:
        return {"ok": True}
    try:
        return res.json()
    except ValueError:
        return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(require_unipass_user)):
    return {
        "username": user["username"],
        "role": user["role"],
        "unipassId": user["id"],
        "handle": user.get("handle"),
        "email": user.get("email"),
        "displayName": user.get("displayName"),
        "avatarUrl": user.get("avatarUrl"),
        "phone": user.get("phone"),
        "phoneVerifiedAt": user.get("phoneVerifiedAt"),
    }


@router.get("/admin/users")
def admin_users_disabled():
    raise HTTPException(status_code=410, detail="사용자 추가/삭제는 Unipass에서 관리합니다.")


@router.post("/admin/users")
def admin_create_user_disabled():
    raise HTTPException(status_code=410, detail="사용자 추가/삭제는 Unipass에서 관리합니다.")


@router.delete("/admin/users/{username}")
def admin_delete_user_disabled(username: str):
    raise HTTPException(status_code=410, detail="사용자 추가/삭제는 Unipass에서 관리합니다.")


@router.post("/admin/users/{username}/password")
def admin_reset_password_disabled(username: str):
    raise HTTPException(status_code=410, detail="비밀번호는 Unipass에서 관리합니다.")
