from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from auth import require_auth
import scale_store


router = APIRouter()
ingest_router = APIRouter()


class ScaleDeviceCreate(BaseModel):
    name: str | None = None
    deviceId: str | None = None
    model: str | None = None


class ScaleProfileBody(BaseModel):
    displayName: str | None = None
    heightCm: float | None = None
    birthDate: str | None = None
    gender: str | None = None
    baselineWeightKg: float | None = None
    expectedWeightMin: float | None = None
    expectedWeightMax: float | None = None
    avgImpedanceOhm: float | None = None


class ScaleMemberBody(BaseModel):
    userId: str
    role: str | None = "member"


class ScaleIngestBody(BaseModel):
    device_id: str
    session_id: str | None = None
    scale_model: str | None = None
    scale_name: str | None = None
    weight_kg: float
    weight_kg_text: str | None = None
    progress_duration_ms: int | None = None
    impedance_ohm: int | None = None
    stable: bool = True
    has_impedance: bool = False
    flags: str | None = None
    scale_time: str | None = None
    scale_time_utc: str | None = None
    raw: str | None = None
    rssi: int | None = None
    measurement_key: str | None = None


class ScaleLiveBody(BaseModel):
    device_id: str
    session_id: str | None = None
    state: str | None = "measuring"
    progress: int | None = None
    progress_duration_ms: int | None = None
    scale_time: str | None = None
    weight_kg: float | None = None
    weight_kg_text: str | None = None
    impedance_ohm: int | None = None
    stable: bool | None = None
    has_impedance: bool | None = None
    message: str | None = None


def _handle_store_error(exc: Exception) -> None:
    if isinstance(exc, PermissionError):
        raise HTTPException(403, str(exc)) from exc
    if isinstance(exc, ValueError):
        detail = str(exc)
        if detail.endswith("_not_found"):
            raise HTTPException(404, detail) from exc
        raise HTTPException(400, detail) from exc
    raise exc


@router.get("/summary")
def scale_summary(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.summary(username, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.get("/history")
def scale_history(
    days: float = Query(default=90, ge=1, le=730),
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.history(username, days, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.get("/pending")
def scale_pending(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.pending(username, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.get("/live")
def scale_live(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.live_status(username, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.post("/live/clear")
def scale_clear_live(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.clear_live_status(username, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.post("/measurements/{measurement_id}/claim")
def scale_claim(
    measurement_id: str,
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.claim(username, measurement_id, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.get("/homes")
def scale_homes(username: str = Depends(require_auth)):
    return scale_store.list_homes(username)


@router.get("/members")
def scale_members(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.list_members(username, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.post("/members")
def scale_add_member(
    body: ScaleMemberBody,
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.add_member(username, body.userId, body.role or "member", home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.get("/devices")
def scale_devices(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.list_devices(username, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.post("/devices")
def scale_create_device(
    body: ScaleDeviceCreate | None = None,
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        payload = (body or ScaleDeviceCreate()).model_dump(exclude_none=True)
        return scale_store.create_device(username, payload, home_id)
    except Exception as exc:
        if exc.__class__.__name__ == "IntegrityError":
            raise HTTPException(409, "device_id_already_exists") from exc
        _handle_store_error(exc)


@router.delete("/devices/{scale_device_id}")
def scale_delete_device(
    scale_device_id: str,
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.revoke_device(username, scale_device_id, home_id)
    except Exception as exc:
        _handle_store_error(exc)


@router.get("/profile")
def scale_profile(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.get_profile(username, home_id) or {}
    except Exception as exc:
        _handle_store_error(exc)


@router.post("/profile")
def scale_save_profile(
    body: ScaleProfileBody,
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    try:
        return scale_store.save_profile(username, body.model_dump(exclude_none=True), home_id)
    except Exception as exc:
        _handle_store_error(exc)


@ingest_router.post("/ingest/scale")
def ingest_scale(
    body: ScaleIngestBody,
    x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
):
    if not x_device_token:
        raise HTTPException(401, "device_token_required")

    device = scale_store.verify_device(body.device_id, x_device_token)
    if not device:
        raise HTTPException(401, "invalid_device_token")

    try:
        payload: dict[str, Any] = body.model_dump(exclude_none=True)
        return scale_store.ingest_measurement(device, payload)
    except Exception as exc:
        _handle_store_error(exc)


@ingest_router.post("/ingest/scale/live")
def ingest_scale_live(
    body: ScaleLiveBody,
    x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
):
    if not x_device_token:
        raise HTTPException(401, "device_token_required")

    device = scale_store.verify_device(body.device_id, x_device_token)
    if not device:
        raise HTTPException(401, "invalid_device_token")

    try:
        payload: dict[str, Any] = body.model_dump(exclude_none=True)
        return scale_store.update_live_status(device, payload)
    except Exception as exc:
        _handle_store_error(exc)
