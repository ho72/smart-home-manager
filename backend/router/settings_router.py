from typing import Any
from fastapi import APIRouter, Body, Depends
from auth import require_auth
from state import load_user_state, save_user_state

router = APIRouter()


@router.get("")
def get_settings(username: str = Depends(require_auth)):
    return load_user_state(username).get("settings", {})


@router.post("")
def save_settings(settings: dict[str, Any] = Body(...), username: str = Depends(require_auth)):
    state = load_user_state(username)
    state["settings"] = {**state.get("settings", {}), **settings}
    save_user_state(username, state)
    return {"ok": True, "settings": state["settings"]}
