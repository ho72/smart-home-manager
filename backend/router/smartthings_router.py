from fastapi import APIRouter, Depends, HTTPException, Query
from auth import require_auth
from devices.smartthings import get_client, SmartThingsNotConnected
import home_store

router = APIRouter()


@router.get("/catalog")
def catalog(
    home_id: str | None = Query(default=None, alias="homeId"),
    username: str = Depends(require_auth),
):
    """모든 home 멤버가 SmartThings 카탈로그를 볼 수 있음. 단,
    'alreadyAdded' 는 대상 home의 등록 디바이스 기준으로 표시."""
    try:
        client = get_client(username, home_id)
        raw_devices = client.get_devices()
    except SmartThingsNotConnected:
        raise HTTPException(401, "SmartThings not connected. Please connect first.")
    except Exception as e:
        raise HTTPException(502, f"SmartThings API error: {e}")

    user_devs = home_store.user_devices_for_home(username, home_id, include_legacy=home_id is None)
    added_ids = {
        d.get("stDeviceId")
        for d in user_devs
        if d.get("provider") == "smartthings"
    }

    result = []
    for device in raw_devices:
        entry = client.build_catalog_entry(device)
        entry["alreadyAdded"] = device["deviceId"] in added_ids
        result.append(entry)

    return result
