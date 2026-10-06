from __future__ import annotations

import copy
import json
import logging
import threading
import time
from pathlib import Path

import scale_store

log = logging.getLogger("state")

_lock = threading.Lock()
STATE_FILE = Path(__file__).parent / "state.json"

DEFAULT_BUTTON_SCENES: list[dict] = [
    {"id": "scene-home",  "name": "홈",   "enabled": True, "trigger": "button", "iconKey": "home",  "actions": []},
    {"id": "scene-sleep", "name": "취침", "enabled": True, "trigger": "button", "iconKey": "moon",  "actions": []},
    {"id": "scene-away",  "name": "외출", "enabled": True, "trigger": "button", "iconKey": "leaf",  "actions": []},
    {"id": "scene-movie", "name": "영화", "enabled": True, "trigger": "button", "iconKey": "film",  "actions": []},
]

DEFAULT_USER_STATE: dict = {
    "automations": [{**s} for s in DEFAULT_BUTTON_SCENES],
    "settings": {
        "accent": "#e8a23c",
        "radius": 14,
        "loading": "spinner",
    },
    "_seededDefaults": True,
}

DEFAULT_USER_DEVICES: list[dict] = []


def ensure_default_scenes(user_state: dict) -> bool:
    if user_state.get("_seededDefaults"):
        return False
    automations = user_state.get("automations", [])
    have_ids = {a.get("id") for a in automations}
    additions = [{**s} for s in DEFAULT_BUTTON_SCENES if s["id"] not in have_ids]
    user_state["automations"] = automations + additions
    user_state["_seededDefaults"] = True
    return True


# ── JSON helpers (automations, settings, notifications) ──────────────────────

def _load_raw() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"users": {}}


def _save_raw(data: dict) -> None:
    STATE_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _maybe_migrate_global_devices(data: dict) -> bool:
    if "devices" not in data:
        return False
    try:
        from auth import find_first_admin
        admin = find_first_admin()
    except Exception as e:
        log.warning("device migration deferred — could not resolve admin: %s", e)
        return False
    if not admin:
        return False
    users = data.setdefault("users", {})
    user = users.setdefault(admin, {})
    if "devices" not in user:
        user["devices"] = data["devices"]
        log.info("migrated %d global device(s) to admin %r", len(data["devices"]), admin)
    del data["devices"]
    return True


def _maybe_migrate_xiaomi_device_types(data: dict) -> bool:
    changed = False
    for user in data.get("users", {}).values():
        for dev in user.get("devices", []) or []:
            if (dev.get("provider") == "xiaomi"
                    and dev.get("iconKey") == "wind"
                    and dev.get("type") != "airpurifier"):
                dev["type"] = "airpurifier"
                changed = True
    return changed


def _load_with_migrations() -> dict:
    data = _load_raw()
    mutated = False
    if _maybe_migrate_global_devices(data):
        mutated = True
    if _maybe_migrate_xiaomi_device_types(data):
        mutated = True
    if mutated:
        _save_raw(data)
    return data


def load_user_state(username: str) -> dict:
    with _lock:
        data = _load_with_migrations()
        user = data.get("users", {}).get(username)
        if user is None:
            return copy.deepcopy(DEFAULT_USER_STATE)
        return user


def save_user_state(username: str, user_state: dict) -> None:
    with _lock:
        data = _load_with_migrations()
        data.setdefault("users", {})[username] = user_state
        _save_raw(data)


def iter_all_users():
    with _lock:
        data = _load_with_migrations()
        return list(data.get("users", {}).items())


# ── DB-backed user devices ────────────────────────────────────────────────────

def _migrate_json_devices_to_db(username: str, conn) -> None:
    """One-time: move devices from state.json into user_devices table, then
    remove the 'devices' key from JSON so this never runs again."""
    with _lock:
        data = _load_raw()
        user = data.get("users", {}).get(username, {})
        if "devices" not in user:
            return
        now = int(time.time())
        for i, device in enumerate(user.get("devices", [])):
            dev_id = device.get("id")
            if not dev_id:
                continue
            clean = {k: v for k, v in device.items() if k not in ("scope",)}
            conn.execute(
                """INSERT OR IGNORE INTO user_devices
                   (username, id, home_id, provider, display_order, device_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    username, dev_id,
                    clean.get("homeId"),
                    clean.get("provider", ""),
                    i,
                    json.dumps(clean, ensure_ascii=False, separators=(",", ":")),
                    now, now,
                ),
            )
        conn.commit()
        log.info("migrated %d device(s) to DB for user %r", len(user.get("devices", [])), username)
        # Remove any user_devices rows that duplicate home_devices (migration artifact cleanup)
        try:
            home_rows = conn.execute(
                """SELECT hd.id FROM home_devices hd
                   JOIN homes h ON h.id=hd.home_id
                   WHERE h.owner_user_id=?""",
                (username,),
            ).fetchall()
            for r in home_rows:
                conn.execute(
                    "DELETE FROM user_devices WHERE username=? AND id=?",
                    (username, r["id"]),
                )
            conn.commit()
        except Exception:
            pass
        del user["devices"]
        if not user:
            data.get("users", {}).pop(username, None)
        else:
            data["users"][username] = user
        _save_raw(data)


def load_user_devices(username: str) -> list[dict]:
    with scale_store._connect() as conn:
        _migrate_json_devices_to_db(username, conn)
        rows = conn.execute(
            "SELECT device_json FROM user_devices WHERE username=? ORDER BY display_order, created_at",
            (username,),
        ).fetchall()
    return [json.loads(r["device_json"]) for r in rows]


def save_user_devices(username: str, devices: list[dict]) -> None:
    now = int(time.time())
    with scale_store._connect() as conn:
        _migrate_json_devices_to_db(username, conn)
        existing_ts = {
            r["id"]: r["created_at"]
            for r in conn.execute(
                "SELECT id, created_at FROM user_devices WHERE username=?", (username,)
            ).fetchall()
        }
        conn.execute("DELETE FROM user_devices WHERE username=?", (username,))
        for i, device in enumerate(devices):
            dev_id = device.get("id")
            if not dev_id:
                continue
            clean = {k: v for k, v in device.items() if k not in ("scope",)}
            conn.execute(
                """INSERT INTO user_devices
                   (username, id, home_id, provider, display_order, device_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    username, dev_id,
                    clean.get("homeId"),
                    clean.get("provider", ""),
                    i,
                    json.dumps(clean, ensure_ascii=False, separators=(",", ":")),
                    existing_ts.get(dev_id, now),
                    now,
                ),
            )
        conn.commit()


# ── Xiaomi catalog (stays in JSON — per-home cache with legacy fallback) ─────

def load_xiaomi_catalog(home_id: str | None = None) -> tuple[list[dict], str]:
    with _lock:
        data = _load_raw()
        if home_id:
            scoped = (data.get("xiaomiCatalogs") or {}).get(home_id)
            if isinstance(scoped, dict):
                return scoped.get("catalog", []), scoped.get("fetchedAt", "")
            return [], ""
        return data.get("xiaomiCatalog", []), data.get("xiaomiCatalogFetchedAt", "")


def save_xiaomi_catalog(catalog: list[dict], fetched_at: str, home_id: str | None = None) -> None:
    with _lock:
        data = _load_raw()
        if home_id:
            catalogs = data.setdefault("xiaomiCatalogs", {})
            catalogs[home_id] = {"catalog": catalog, "fetchedAt": fetched_at}
        else:
            data["xiaomiCatalog"] = catalog
            data["xiaomiCatalogFetchedAt"] = fetched_at
        _save_raw(data)
