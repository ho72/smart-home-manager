from fastapi import APIRouter, Depends, HTTPException

from auth import require_auth
from weather import get_current, get_forecast

router = APIRouter()


@router.get("/current")
def current(_: str = Depends(require_auth)):
    try:
        return get_current()
    except Exception as e:
        raise HTTPException(502, f"Weather API error: {e}")


@router.get("/forecast")
def forecast(_: str = Depends(require_auth)):
    try:
        return get_forecast()
    except Exception as e:
        raise HTTPException(502, f"Weather API error: {e}")
