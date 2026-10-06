from __future__ import annotations

import json
import secrets
import time
from typing import Any

import scale_store
from state import load_user_devices, load_user_state, save_user_devices, save_user_state

WIDGET_PROVIDER = "widgets"


def _now() -> int:
    return int(time.time())


def _clean_device(device: dict[str, Any]) -> dict[str, Any]:
    clean = dict(device)
    clean.pop("scope", None)   # scope is derived, never persisted
    return clean


def _device_from_row(row: Any) -> dict[str, Any]:
    device = json.loads(row["device_json"])
    device["homeId"] = row["home_id"]
    device["scope"] = "home"
    return device


def _is_widget(device: dict[str, Any]) -> bool:
    return device.get("provider") == WIDGET_PROVIDER


def _init_home_devices(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS home_devices (
            home_id     TEXT NOT NULL,
            id          TEXT NOT NULL,
            provider    TEXT NOT NULL,
            source_id   TEXT,
            device_json TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL,
            PRIMARY KEY (home_id, id),
            UNIQUE (home_id, provider, source_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_home_devices_provider ON home_devices(home_id, provider)")


def create_home(username: str, name: str | None = None) -> dict[str, Any]:
    home_id = f"home-{secrets.token_hex(6)}"
    home_name = (name or "Home").strip() or "Home"
    now = _now()
    with scale_store._connect() as conn:
        conn.execute(
            "INSERT INTO homes (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)",
            (home_id, home_name, username, now),
        )
        conn.execute(
            "INSERT INTO home_members (home_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
            (home_id, username, now),
        )
        conn.commit()
    return {"id": home_id, "name": home_name, "owner_user_id": username, "created_at": now, "role": "owner"}


def get_home_for_user(username: str, home_id: str | None = None) -> dict[str, Any]:
    return scale_store.get_home_for_user(username, home_id)


def list_homes(username: str) -> list[dict[str, Any]]:
    current_id = get_home_for_user(username)["id"]
    return [{**h, "active": h.get("id") == current_id} for h in scale_store.list_homes(username)]


def set_active_home(username: str, home_id: str) -> dict[str, Any]:
    home = scale_store.get_home_for_user(username, home_id)
    user_state = load_user_state(username)
    settings = user_state.setdefault("settings", {})
    settings["activeHomeId"] = home["id"]
    save_user_state(username, user_state)
    return {**home, "active": True}


def list_members(username: str, home_id: str | None = None) -> list[dict[str, Any]]:
    return scale_store.list_members(username, home_id)


def add_member(username: str, member_user_id: str, role: str = "member", home_id: str | None = None) -> dict[str, Any]:
    return scale_store.add_member(username, member_user_id, role, home_id)


def ensure_default_home(username: str) -> dict[str, Any]:
    return scale_store.ensure_default_home(username)


def _require_owner(username: str, home: dict[str, Any]) -> None:
    if home.get("owner_user_id") != username:
        raise PermissionError("owner_required")


def user_widgets(username: str) -> list[dict[str, Any]]:
    return [
        {**d, "scope": "user"}
        for d in load_user_devices(username)
        if _is_widget(d)
    ]


def user_devices(username: str) -> list[dict[str, Any]]:
    """Return all devices from the user's personal state.json (all providers)."""
    return [
        {**d, "scope": "user"}
        for d in load_user_devices(username)
    ]


def user_devices_for_home(
    username: str,
    home_id: str | None = None,
    *,
    include_legacy: bool = False,
) -> list[dict[str, Any]]:
    """Return DB-backed user selections that belong to a single home.

    Widgets and user-selected integration devices are persisted in
    user_devices, while home_devices is kept for legacy physical rows. Callers
    that need "already added to this home" checks should use this helper
    instead of scanning all user devices.
    """
    home = get_home_for_user(username, home_id)
    out = []
    for device in user_devices(username):
        device_home_id = device.get("homeId")
        if device_home_id == home["id"] or (include_legacy and not device_home_id):
            out.append(device)
    return out


def migrate_user_physical_devices(username: str, home_id: str | None = None) -> None:
    """Copy old per-user physical device rows into the legacy current home once.

    The legacy records are left in state.json so rollback remains possible, but
    every reader below filters them out and uses home_devices instead.
    """
    if home_id:
        return
    legacy_devices = [
        d for d in load_user_devices(username)
        if not _is_widget(d) and not d.get("homeId")
    ]
    if not legacy_devices:
        return

    home = get_home_for_user(username)
    if home.get("owner_user_id") != username:
        return
    now = _now()
    with scale_store._connect() as conn:
        _init_home_devices(conn)
        for device in legacy_devices:
            provider = str(device.get("provider") or "")
            source_id = device.get("sourceId") or device.get("stDeviceId") or device.get("xiaomiDid") or device.get("id")
            if not provider or not device.get("id"):
                continue
            clean = _clean_device(device)
            conn.execute(
                """
                INSERT OR IGNORE INTO home_devices (
                    home_id, id, provider, source_id, device_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    home["id"], clean["id"], provider, source_id,
                    json.dumps(clean, ensure_ascii=False, separators=(",", ":")),
                    now, now,
                ),
            )
        conn.commit()


def list_home_devices(username: str, home_id: str | None = None) -> list[dict[str, Any]]:
    migrate_user_physical_devices(username, home_id)
    home = get_home_for_user(username, home_id)
    with scale_store._connect() as conn:
        _init_home_devices(conn)
        rows = conn.execute(
            "SELECT * FROM home_devices WHERE home_id=? ORDER BY created_at, id",
            (home["id"],),
        ).fetchall()
    return [_device_from_row(r) for r in rows]


def list_all_home_devices(username: str) -> list[dict[str, Any]]:
    migrate_user_physical_devices(username)
    with scale_store._connect() as conn:
        _init_home_devices(conn)
        rows = conn.execute(
            """
            SELECT hd.* FROM home_devices hd
            JOIN home_members m ON m.home_id=hd.home_id
            WHERE m.user_id=?
            ORDER BY hd.created_at, hd.id
            """,
            (username,),
        ).fetchall()
    return [_device_from_row(r) for r in rows]


def list_all_devices(username: str, home_id: str | None = None) -> list[dict[str, Any]]:
    home_devs = list_home_devices(username, home_id) if home_id else list_all_home_devices(username)
    home_ids = {d["id"] for d in home_devs}
    personal = [
        d for d in user_devices(username)
        if d["id"] not in home_ids and (not home_id or d.get("homeId") == home_id)
    ]
    return home_devs + personal


def list_main_devices(username: str) -> list[dict[str, Any]]:
    """Devices shown on a user's main page.

    Home integrations are shared at the credential/catalog layer, but main-page
    composition is per user. Existing owner home_devices are kept visible as a
    legacy compatibility path; members only see devices they personally add.
    """
    personal = user_devices(username)
    personal_ids = {d.get("id") for d in personal}
    owner_home_ids = {
        h.get("id")
        for h in list_homes(username)
        if h.get("owner_user_id") == username
    }
    legacy_owner_home_devices = [
        d for d in list_all_home_devices(username)
        if d.get("homeId") in owner_home_ids and d.get("id") not in personal_ids
    ]
    return legacy_owner_home_devices + personal


def find_device(username: str, device_id: str, home_id: str | None = None) -> dict[str, Any] | None:
    return next((d for d in list_all_devices(username, home_id) if d.get("id") == device_id), None)


def add_widget(username: str, device: dict[str, Any]) -> dict[str, Any]:
    devices = load_user_devices(username)
    if any(d.get("id") == device.get("id") for d in devices):
        raise ValueError("device_id_already_exists")
    devices.append(_clean_device(device))
    save_user_devices(username, devices)
    return {**device, "scope": "user"}


def add_home_device(username: str, device: dict[str, Any], home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    _require_owner(username, home)
    clean = _clean_device(device)
    provider = str(clean.get("provider") or "")
    source_id = clean.get("sourceId") or clean.get("stDeviceId") or clean.get("xiaomiDid") or clean.get("id")
    now = _now()
    with scale_store._connect() as conn:
        _init_home_devices(conn)
        exists = conn.execute(
            """
            SELECT 1 FROM home_devices
            WHERE home_id=? AND (id=? OR (provider=? AND source_id=?))
            """,
            (home["id"], clean.get("id"), provider, source_id),
        ).fetchone()
        if exists:
            raise ValueError("device_id_already_exists")
        conn.execute(
            """
            INSERT INTO home_devices (home_id, id, provider, source_id, device_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                home["id"], clean["id"], provider, source_id,
                json.dumps(clean, ensure_ascii=False, separators=(",", ":")),
                now, now,
            ),
        )
        conn.commit()
    return {**clean, "homeId": home["id"], "scope": "home"}


def add_device(username: str, device: dict[str, Any], home_id: str | None = None) -> dict[str, Any]:
    """Add a device to the user's personal selection (DB-backed).
    All providers — SmartThings, Xiaomi, scale, widgets — are user-scoped.
    Each device is tagged with the selected home_id for multi-home grouping.
    """
    devices = load_user_devices(username)
    if any(d.get("id") == device.get("id") for d in devices):
        raise ValueError("device_id_already_exists")
    clean = _clean_device(device)
    # Tag with the selected home so main-page layout can group by space.
    if "homeId" not in clean or not clean["homeId"]:
        try:
            home = get_home_for_user(username, home_id)
            clean["homeId"] = home["id"]
        except Exception:
            pass
    devices.append(clean)
    save_user_devices(username, devices)
    return {**clean, "scope": "user"}


def patch_user_device(username: str, device_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    devices = load_user_devices(username)
    target = next((d for d in devices if d.get("id") == device_id), None)
    if target is None:
        return None
    target.update({k: v for k, v in patch.items() if v is not None})
    save_user_devices(username, devices)
    return {**target, "scope": "user"}


def patch_widget(username: str, device_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    return patch_user_device(username, device_id, patch)


def patch_home_device(
    username: str,
    device_id: str,
    patch: dict[str, Any],
    home_id: str | None = None,
    *,
    owner_required: bool = True,
) -> dict[str, Any] | None:
    home = get_home_for_user(username, home_id)
    if owner_required:
        _require_owner(username, home)
    with scale_store._connect() as conn:
        _init_home_devices(conn)
        row = conn.execute(
            "SELECT * FROM home_devices WHERE home_id=? AND id=?",
            (home["id"], device_id),
        ).fetchone()
        if row is None:
            return None
        device = json.loads(row["device_json"])
        device.update({k: v for k, v in patch.items() if v is not None})
        provider = str(device.get("provider") or row["provider"])
        source_id = device.get("sourceId") or device.get("stDeviceId") or device.get("xiaomiDid") or device.get("id")
        conn.execute(
            """
            UPDATE home_devices
            SET provider=?, source_id=?, device_json=?, updated_at=?
            WHERE home_id=? AND id=?
            """,
            (
                provider, source_id,
                json.dumps(_clean_device(device), ensure_ascii=False, separators=(",", ":")),
                _now(), home["id"], device_id,
            ),
        )
        conn.commit()
    return {**device, "homeId": home["id"], "scope": "home"}


def patch_device(
    username: str,
    device_id: str,
    patch: dict[str, Any],
    home_id: str | None = None,
    *,
    owner_required: bool = True,
) -> dict[str, Any] | None:
    user_dev = patch_user_device(username, device_id, patch)
    if user_dev is not None:
        return user_dev
    return patch_home_device(username, device_id, patch, home_id, owner_required=owner_required)


def remove_user_device(username: str, device_id: str) -> bool:
    """Remove any device from the user's personal state.json."""
    devices = load_user_devices(username)
    next_devices = [d for d in devices if d.get("id") != device_id]
    if len(next_devices) == len(devices):
        return False
    save_user_devices(username, next_devices)
    return True


def remove_widget(username: str, device_id: str) -> bool:
    return remove_user_device(username, device_id)


def remove_home_device(username: str, device_id: str, home_id: str | None = None) -> bool:
    home = get_home_for_user(username, home_id)
    _require_owner(username, home)
    with scale_store._connect() as conn:
        _init_home_devices(conn)
        cur = conn.execute(
            "DELETE FROM home_devices WHERE home_id=? AND id=?",
            (home["id"], device_id),
        )
        conn.commit()
    return cur.rowcount > 0


def remove_device(username: str, device_id: str, home_id: str | None = None) -> bool:
    if remove_user_device(username, device_id):
        return True
    return remove_home_device(username, device_id, home_id)
