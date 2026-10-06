from typing import Any
from fastapi import APIRouter, Body, Depends, HTTPException
from auth import require_auth
from automation_engine import run_automation
from state import ensure_default_scenes, load_user_state, save_user_state

router = APIRouter()


@router.get("")
def get_automations(username: str = Depends(require_auth)):
    state = load_user_state(username)
    if ensure_default_scenes(state):
        save_user_state(username, state)
    return state.get("automations", [])


@router.post("")
def save_automations(automations: list[Any] = Body(...), username: str = Depends(require_auth)):
    state = load_user_state(username)
    state["automations"] = automations
    save_user_state(username, state)
    return {"ok": True, "count": len(automations)}


@router.post("/{automation_id}/run")
def run_one(automation_id: str, username: str = Depends(require_auth)):
    """수동 실행 — button trigger 클릭, 테스트용."""
    state = load_user_state(username)
    automation = next((a for a in state.get("automations", []) if a.get("id") == automation_id), None)
    if automation is None:
        raise HTTPException(404, "Automation not found")
    return run_automation(username, automation)
