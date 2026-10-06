from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import require_auth
import home_store

router = APIRouter()


class HomeCreateBody(BaseModel):
    name: str | None = None


class HomeMemberBody(BaseModel):
    userId: str
    role: str | None = "member"


class ActiveHomeBody(BaseModel):
    homeId: str


def _handle_home_error(exc: Exception) -> None:
    if isinstance(exc, PermissionError):
        raise HTTPException(403, str(exc)) from exc
    if isinstance(exc, ValueError):
        detail = str(exc)
        if detail.endswith("_not_found"):
            raise HTTPException(404, detail) from exc
        raise HTTPException(400, detail) from exc
    raise exc


@router.get("")
def homes(username: str = Depends(require_auth)):
    return {
        "current": home_store.get_home_for_user(username),
        "homes": home_store.list_homes(username),
    }


@router.post("")
def create_home(body: HomeCreateBody | None = None, username: str = Depends(require_auth)):
    try:
        return home_store.create_home(username, (body or HomeCreateBody()).name)
    except Exception as exc:
        _handle_home_error(exc)


@router.get("/current")
def current_home(username: str = Depends(require_auth)):
    return home_store.get_home_for_user(username)


@router.put("/current")
def set_current_home(body: ActiveHomeBody, username: str = Depends(require_auth)):
    try:
        return home_store.set_active_home(username, body.homeId)
    except Exception as exc:
        _handle_home_error(exc)


@router.get("/members")
def members(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return home_store.list_members(username, home_id)
    except Exception as exc:
        _handle_home_error(exc)


@router.post("/members")
def add_member(
    body: HomeMemberBody,
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return home_store.add_member(username, body.userId, body.role or "member", home_id)
    except Exception as exc:
        _handle_home_error(exc)
