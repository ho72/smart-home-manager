from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import secrets
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

DB_FILE = Path(__file__).parent / "scale.db"

_init_lock = threading.Lock()
_initialized = False
_live_lock = threading.Lock()
_live_status: dict[str, dict[str, Any]] = {}
_live_sequence = 0
_LIVE_TTL_SECONDS = 120
_LIVE_MIN_BODY_WEIGHT_KG = 10.0
_SCALE_PROGRESS_DURATION_MS = 2400
_BODY_COMPOSITION_VERSION = "research_deurenberg_ffm_janssen_smm_v1"
_BODY_COMPOSITION_FALLBACK_VERSION = "fallback_deurenberg_bmi_bodyfat_v1"
_BODY_BALANCE_VERSION = "body_balance_score_inbody_like_v1"
logger = logging.getLogger("scale")


def _now() -> int:
    return int(time.time())


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _default_home_id(username: str) -> str:
    digest = hashlib.sha256(username.encode("utf-8")).hexdigest()[:12]
    return f"home-{digest}"


def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def _weight_text(value: Any) -> str | None:
    try:
        return f"{float(value):.2f}"
    except Exception:
        return None


def _finite_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except Exception:
        return None
    return parsed if math.isfinite(parsed) else None


def _round_float(value: Any, digits: int = 2) -> float | None:
    parsed = _finite_float(value)
    return round(parsed, digits) if parsed is not None else None


def _parse_measured_at(row: sqlite3.Row | dict[str, Any]) -> datetime:
    item = dict(row)
    scale_time = str(item.get("scale_time") or "").strip()
    if scale_time:
        try:
            return datetime.fromisoformat(scale_time.replace("Z", "+00:00"))
        except Exception:
            pass
    try:
        return datetime.fromtimestamp(int(item.get("received_at") or _now()), tz=timezone.utc)
    except Exception:
        return datetime.fromtimestamp(_now(), tz=timezone.utc)


def _age_at(birth_date: Any, measured_at: datetime) -> int | None:
    text = str(birth_date or "").strip()
    if not text:
        return None
    try:
        birth = datetime.strptime(text[:10], "%Y-%m-%d").date()
    except Exception:
        return None
    measured = measured_at.date()
    age = measured.year - birth.year
    if (measured.month, measured.day) < (birth.month, birth.day):
        age -= 1
    return age if 0 <= age <= 120 else None


def _bmi_category_korea(bmi: float) -> str:
    if bmi < 18.5:
        return "저체중"
    if bmi < 23:
        return "정상"
    if bmi < 25:
        return "과체중"
    if bmi < 30:
        return "1단계 비만"
    if bmi < 35:
        return "2단계 비만"
    return "3단계 비만"


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS homes (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            owner_user_id   TEXT NOT NULL,
            created_at      INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS home_members (
            home_id     TEXT NOT NULL,
            user_id     TEXT NOT NULL,
            role        TEXT NOT NULL DEFAULT 'member',
            created_at  INTEGER NOT NULL,
            PRIMARY KEY (home_id, user_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scale_devices (
            id          TEXT PRIMARY KEY,
            home_id     TEXT NOT NULL,
            device_id   TEXT NOT NULL UNIQUE,
            token_hash  TEXT NOT NULL,
            name        TEXT NOT NULL,
            model       TEXT NOT NULL DEFAULT 'XMTZC05HM',
            enabled     INTEGER NOT NULL DEFAULT 1,
            created_at  INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scale_profiles (
            home_id                 TEXT NOT NULL,
            user_id                 TEXT NOT NULL,
            display_name            TEXT,
            height_cm               REAL,
            birth_date              TEXT,
            gender                  TEXT,
            baseline_weight_kg      REAL,
            expected_weight_min     REAL,
            expected_weight_max     REAL,
            avg_impedance_ohm       REAL,
            created_at              INTEGER NOT NULL,
            updated_at              INTEGER NOT NULL,
            PRIMARY KEY (home_id, user_id)
        )
    """)
    scale_profile_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(scale_profiles)")
    }
    if "birth_date" not in scale_profile_columns:
        conn.execute("ALTER TABLE scale_profiles ADD COLUMN birth_date TEXT")
    if "gender" not in scale_profile_columns:
        conn.execute("ALTER TABLE scale_profiles ADD COLUMN gender TEXT")
    if "baseline_weight_kg" not in scale_profile_columns:
        conn.execute("ALTER TABLE scale_profiles ADD COLUMN baseline_weight_kg REAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scale_measurements (
            id                  TEXT PRIMARY KEY,
            home_id             TEXT NOT NULL,
            scale_device_id     TEXT NOT NULL,
            assigned_user_id    TEXT,
            status              TEXT NOT NULL,
            confidence          REAL NOT NULL DEFAULT 0,
            assignment_method   TEXT NOT NULL DEFAULT 'pending',
            weight_kg           REAL NOT NULL,
            weight_kg_text      TEXT,
            impedance_ohm       INTEGER,
            stable              INTEGER NOT NULL DEFAULT 0,
            has_impedance       INTEGER NOT NULL DEFAULT 0,
            flags               TEXT,
            scale_time          TEXT,
            received_at         INTEGER NOT NULL,
            raw                 TEXT,
            rssi                INTEGER,
            measurement_key     TEXT NOT NULL,
            UNIQUE (scale_device_id, measurement_key)
        )
    """)
    scale_measurement_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(scale_measurements)")
    }
    if "weight_kg_text" not in scale_measurement_columns:
        conn.execute("ALTER TABLE scale_measurements ADD COLUMN weight_kg_text TEXT")
    conn.execute(
        """
        UPDATE scale_measurements
        SET weight_kg_text=printf('%.2f', weight_kg)
        WHERE weight_kg_text IS NULL OR weight_kg_text=''
        """
    )
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scale_measurement_analysis (
            measurement_id              TEXT PRIMARY KEY,
            home_id                     TEXT NOT NULL,
            assigned_user_id            TEXT,
            algorithm_version           TEXT NOT NULL,
            age                         INTEGER,
            bmi                         REAL,
            bmi_category                TEXT,
            standard_weight_kg          REAL,
            weight_diff_kg              REAL,
            obesity_degree_percent      REAL,
            bmr_kcal                    REAL,
            resistance_index            REAL,
            fat_free_mass_kg            REAL,
            fat_free_mass_percent       REAL,
            fat_mass_kg                 REAL,
            body_fat_percent            REAL,
            total_body_water_kg         REAL,
            body_water_percent          REAL,
            skeletal_muscle_mass_kg     REAL,
            ffmi                        REAL,
            fmi                         REAL,
            body_balance_score          INTEGER,
            body_balance_grade          TEXT,
            body_balance_algorithm_version TEXT,
            body_balance_message        TEXT,
            body_balance_standard_weight_kg REAL,
            body_balance_standard_fat_mass_kg REAL,
            body_balance_standard_lean_mass_kg REAL,
            body_balance_weight_diff_kg REAL,
            body_balance_fat_diff_kg    REAL,
            body_balance_lean_diff_kg   REAL,
            confidence_grade            TEXT NOT NULL,
            warnings_json               TEXT NOT NULL DEFAULT '[]',
            created_at                  INTEGER NOT NULL
        )
    """)
    scale_analysis_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(scale_measurement_analysis)")
    }
    scale_analysis_column_defs = {
        "body_balance_score": "INTEGER",
        "body_balance_grade": "TEXT",
        "body_balance_algorithm_version": "TEXT",
        "body_balance_message": "TEXT",
        "body_balance_standard_weight_kg": "REAL",
        "body_balance_standard_fat_mass_kg": "REAL",
        "body_balance_standard_lean_mass_kg": "REAL",
        "body_balance_weight_diff_kg": "REAL",
        "body_balance_fat_diff_kg": "REAL",
        "body_balance_lean_diff_kg": "REAL",
    }
    for column, definition in scale_analysis_column_defs.items():
        if column not in scale_analysis_columns:
            conn.execute(f"ALTER TABLE scale_measurement_analysis ADD COLUMN {column} {definition}")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_scale_analysis_user ON scale_measurement_analysis(home_id, assigned_user_id)"
    )
    _backfill_missing_analysis(conn)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scale_measurements_user_time ON scale_measurements(assigned_user_id, received_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scale_measurements_home_time ON scale_measurements(home_id, received_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scale_members_user ON home_members(user_id)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scale_live_status (
            home_id       TEXT PRIMARY KEY,
            payload_json  TEXT NOT NULL,
            updated_at    INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL,
            sequence      INTEGER NOT NULL
        )
    """)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_devices (
            username      TEXT NOT NULL,
            id            TEXT NOT NULL,
            home_id       TEXT,
            provider      TEXT NOT NULL DEFAULT '',
            display_order INTEGER NOT NULL DEFAULT 0,
            device_json   TEXT NOT NULL,
            created_at    INTEGER NOT NULL,
            updated_at    INTEGER NOT NULL,
            PRIMARY KEY (username, id)
        )
    ''')
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_devices_home ON user_devices(username, home_id)"
    )
    conn.commit()


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    global _initialized
    conn = sqlite3.connect(DB_FILE, timeout=8.0)
    conn.row_factory = sqlite3.Row
    try:
        if not _initialized:
            with _init_lock:
                if not _initialized:
                    _init_db(conn)
                    _initialized = True
        yield conn
    finally:
        conn.close()


def ensure_default_home(username: str) -> dict[str, Any]:
    home_id = _default_home_id(username)
    now = _now()
    with _connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO homes (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)",
            (home_id, "Home", username, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO home_members (home_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
            (home_id, username, now),
        )
        conn.commit()
        home = conn.execute("SELECT * FROM homes WHERE id=?", (home_id,)).fetchone()
    return _row(home) or {"id": home_id, "name": "Home", "owner_user_id": username, "created_at": now}


def get_home_for_user(username: str, home_id: str | None = None) -> dict[str, Any]:
    ensure_default_home(username)
    active_home_id = None
    if not home_id:
        try:
            from state import load_user_state
            active_home_id = (load_user_state(username).get("settings") or {}).get("activeHomeId")
        except Exception:
            active_home_id = None
    with _connect() as conn:
        row = None
        if home_id:
            row = conn.execute(
                """
                SELECT h.* FROM homes h
                JOIN home_members m ON m.home_id=h.id
                WHERE h.id=? AND m.user_id=?
                """,
                (home_id, username),
            ).fetchone()
        else:
            if active_home_id:
                row = conn.execute(
                    """
                    SELECT h.* FROM homes h
                    JOIN home_members m ON m.home_id=h.id
                    WHERE h.id=? AND m.user_id=?
                    """,
                    (active_home_id, username),
                ).fetchone()
            if row is None:
                row = conn.execute(
                    """
                    SELECT h.* FROM homes h
                    JOIN home_members m ON m.home_id=h.id
                    WHERE m.user_id=?
                    ORDER BY
                        CASE WHEN EXISTS (
                            SELECT 1 FROM scale_devices sd WHERE sd.home_id=h.id AND sd.enabled=1
                        ) THEN 0 ELSE 1 END,
                        CASE WHEN h.owner_user_id=? THEN 0 ELSE 1 END,
                        h.created_at
                    LIMIT 1
                    """,
                    (username, username),
                ).fetchone()
    if row is None:
        raise ValueError("home_not_found")
    return dict(row)


def list_homes(username: str) -> list[dict[str, Any]]:
    ensure_default_home(username)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT h.*, m.role FROM homes h
            JOIN home_members m ON m.home_id=h.id
            WHERE m.user_id=?
            ORDER BY h.created_at
            """,
            (username,),
        ).fetchall()
    return [dict(r) for r in rows]


def list_members(username: str, home_id: str | None = None) -> list[dict[str, Any]]:
    home = get_home_for_user(username, home_id)
    with _connect() as conn:
        rows = conn.execute(
            "SELECT user_id, role, created_at FROM home_members WHERE home_id=? ORDER BY created_at",
            (home["id"],),
        ).fetchall()
    return [dict(r) for r in rows]


def add_member(username: str, member_user_id: str, role: str = "member", home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    if home["owner_user_id"] != username:
        raise PermissionError("owner_required")
    member_user_id = member_user_id.strip()
    if not member_user_id:
        raise ValueError("member_user_id_required")
    role = role if role in ("owner", "member") else "member"
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO home_members (home_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
            (home["id"], member_user_id, role, _now()),
        )
        conn.commit()
    return {"ok": True, "homeId": home["id"], "userId": member_user_id, "role": role}


def save_profile(username: str, profile: dict[str, Any], home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    now = _now()
    values = {
        "display_name": profile.get("displayName") or profile.get("display_name"),
        "height_cm": profile.get("heightCm") or profile.get("height_cm"),
        "birth_date": profile.get("birthDate") or profile.get("birth_date"),
        "gender": profile.get("gender"),
        "baseline_weight_kg": profile.get("baselineWeightKg") or profile.get("baseline_weight_kg"),
        "expected_weight_min": profile.get("expectedWeightMin") or profile.get("expected_weight_min"),
        "expected_weight_max": profile.get("expectedWeightMax") or profile.get("expected_weight_max"),
        "avg_impedance_ohm": profile.get("avgImpedanceOhm") or profile.get("avg_impedance_ohm"),
    }
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO scale_profiles (
                home_id, user_id, display_name, height_cm, birth_date, gender, baseline_weight_kg,
                expected_weight_min, expected_weight_max, avg_impedance_ohm,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(home_id, user_id) DO UPDATE SET
                display_name=excluded.display_name,
                height_cm=excluded.height_cm,
                birth_date=excluded.birth_date,
                gender=excluded.gender,
                baseline_weight_kg=excluded.baseline_weight_kg,
                expected_weight_min=excluded.expected_weight_min,
                expected_weight_max=excluded.expected_weight_max,
                avg_impedance_ohm=excluded.avg_impedance_ohm,
                updated_at=excluded.updated_at
            """,
            (
                home["id"], username, values["display_name"], values["height_cm"],
                values["birth_date"], values["gender"], values["baseline_weight_kg"],
                values["expected_weight_min"], values["expected_weight_max"],
                values["avg_impedance_ohm"], now, now,
            ),
        )
        _recalculate_analysis_for_user(conn, home["id"], username)
        conn.commit()
    return get_profile(username, home["id"])


def get_profile(username: str, home_id: str | None = None) -> dict[str, Any] | None:
    home = get_home_for_user(username, home_id)
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM scale_profiles WHERE home_id=? AND user_id=?",
            (home["id"], username),
        ).fetchone()
    return _row(row)


def create_device(username: str, body: dict[str, Any], home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    if home["owner_user_id"] != username:
        raise PermissionError("owner_required")
    token = secrets.token_urlsafe(32)
    suffix = secrets.token_hex(3)
    device_id = (body.get("deviceId") or body.get("device_id") or f"scale-{suffix}").strip()
    name = (body.get("name") or "Mi Scale").strip()
    model = (body.get("model") or "XMTZC05HM").strip()
    row_id = str(uuid.uuid4())
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO scale_devices (id, home_id, device_id, token_hash, name, model, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (row_id, home["id"], device_id, _hash_token(token), name, model, _now()),
        )
        conn.commit()
    return {
        "id": row_id,
        "homeId": home["id"],
        "deviceId": device_id,
        "deviceToken": token,
        "name": name,
        "model": model,
        "serverUrl": os.getenv("SCALE_SERVER_URL", "http://localhost:8080/ingest/scale"),
        "liveServerUrl": os.getenv("SCALE_LIVE_SERVER_URL", "http://localhost:8080/ingest/scale/live"),
    }


def list_devices(username: str, home_id: str | None = None) -> list[dict[str, Any]]:
    home = get_home_for_user(username, home_id)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, home_id AS homeId, device_id AS deviceId, name, model, enabled, created_at AS createdAt
            FROM scale_devices WHERE home_id=? AND enabled=1 ORDER BY created_at
            """,
            (home["id"],),
        ).fetchall()
    return [dict(r) for r in rows]


def revoke_device(username: str, scale_device_id: str, home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    if home["owner_user_id"] != username:
        raise PermissionError("owner_required")

    with _connect() as conn:
        cur = conn.execute(
            """
            UPDATE scale_devices
            SET enabled=0
            WHERE home_id=? AND enabled=1 AND (id=? OR device_id=?)
            """,
            (home["id"], scale_device_id, scale_device_id),
        )
        conn.commit()

    if cur.rowcount == 0:
        raise ValueError("device_not_found")

    return {"ok": True, "homeId": home["id"], "deviceId": scale_device_id, "revoked": True}


def _latest_for_user(conn: sqlite3.Connection, home_id: str, user_id: str) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT * FROM scale_measurements
        WHERE home_id=? AND assigned_user_id=?
        ORDER BY received_at DESC LIMIT 1
        """,
        (home_id, user_id),
    ).fetchone()


def _score_candidate(conn: sqlite3.Connection, home_id: str, user_id: str, weight_kg: float, impedance_ohm: int | None) -> float:
    profile = conn.execute(
        "SELECT * FROM scale_profiles WHERE home_id=? AND user_id=?",
        (home_id, user_id),
    ).fetchone()
    latest = _latest_for_user(conn, home_id, user_id)
    score = 0.0

    if profile:
        baseline_weight = profile["baseline_weight_kg"]
        if baseline_weight is not None:
            diff = abs(weight_kg - float(baseline_weight))
            if diff <= 0.7:
                score += 0.80
            elif diff <= 1.5:
                score += 0.75
            elif diff <= 3.0:
                score += 0.42
            elif diff <= 5.0:
                score += 0.20

        lo = profile["expected_weight_min"]
        hi = profile["expected_weight_max"]
        if lo is not None and hi is not None:
            if float(lo) <= weight_kg <= float(hi):
                score += 0.55
            else:
                distance = min(abs(weight_kg - float(lo)), abs(weight_kg - float(hi)))
                score += max(0.0, 0.35 - distance * 0.15)
        if impedance_ohm and profile["avg_impedance_ohm"]:
            diff = abs(float(impedance_ohm) - float(profile["avg_impedance_ohm"]))
            if diff <= 40:
                score += 0.12
            elif diff <= 80:
                score += 0.06

    if latest:
        diff = abs(weight_kg - float(latest["weight_kg"]))
        if diff <= 0.8:
            score += 0.40
        elif diff <= 2.0:
            score += 0.28
        elif diff <= 4.0:
            score += 0.12

    return min(score, 0.99)


def _auto_assign(conn: sqlite3.Connection, home_id: str, weight_kg: float, impedance_ohm: int | None) -> tuple[str | None, str, float, str]:
    members = conn.execute("SELECT user_id FROM home_members WHERE home_id=?", (home_id,)).fetchall()
    if not members:
        return None, "pending", 0.0, "pending"

    scored = [
        (m["user_id"], _score_candidate(conn, home_id, m["user_id"], weight_kg, impedance_ohm))
        for m in members
    ]
    scored.sort(key=lambda item: item[1], reverse=True)
    best_user, best_score = scored[0]
    second_score = scored[1][1] if len(scored) > 1 else 0.0

    if len(scored) == 1:
        return best_user, "auto_assigned", max(best_score, 0.50), "single_member"
    if best_score >= 0.65 and best_score - second_score >= 0.20:
        return best_user, "auto_assigned", best_score, "profile_score"
    return None, "pending", best_score, "pending"


def _body_balance_empty() -> dict[str, Any]:
    return {
        "body_balance_score": None,
        "body_balance_grade": None,
        "body_balance_algorithm_version": None,
        "body_balance_message": None,
        "body_balance_standard_weight_kg": None,
        "body_balance_standard_fat_mass_kg": None,
        "body_balance_standard_lean_mass_kg": None,
        "body_balance_weight_diff_kg": None,
        "body_balance_fat_diff_kg": None,
        "body_balance_lean_diff_kg": None,
    }


def _body_balance_grade(score: int) -> str:
    if score >= 90:
        return "매우 균형적"
    if score >= 80:
        return "양호"
    if score >= 70:
        return "보통"
    if score >= 60:
        return "관리 필요"
    return "개선 필요"


def _calculate_body_balance(
    gender: str,
    height_cm: float,
    weight_kg: float,
    fat_mass_kg: float | None,
    fat_free_mass_kg: float | None,
) -> dict[str, Any]:
    if fat_mass_kg is None or fat_free_mass_kg is None:
        return _body_balance_empty()

    height_m = height_cm / 100
    standard_bmi = 22.0 if gender == "male" else 21.5
    standard_weight_kg = standard_bmi * (height_m ** 2)
    ideal_body_fat_percent = 0.15 if gender == "male" else 0.23
    standard_fat_mass_kg = standard_weight_kg * ideal_body_fat_percent
    standard_lean_mass_kg = standard_weight_kg - standard_fat_mass_kg

    weight_diff_kg = weight_kg - standard_weight_kg
    fat_diff_kg = fat_mass_kg - standard_fat_mass_kg
    lean_diff_kg = fat_free_mass_kg - standard_lean_mass_kg

    raw_score = (
        80
        - max(0, fat_diff_kg) * 1.5
        + max(0, lean_diff_kg) * 1.0
        - abs(weight_diff_kg) * 0.3
    )
    score = max(0, min(100, int(math.floor(raw_score + 0.5))))
    grade = _body_balance_grade(score)

    if fat_diff_kg > 2 and lean_diff_kg < -1:
        message = "표준 대비 체지방량은 높고 제지방량은 낮아 체지방 감량과 근육량 보완이 필요합니다."
    elif fat_diff_kg > 2:
        message = "표준 대비 체지방량이 높아 체지방 관리가 우선입니다."
    elif lean_diff_kg < -1:
        message = "표준 대비 제지방량이 낮아 근육량 보완이 필요합니다."
    else:
        message = "표준 체성분 기준에 비교적 가까운 균형적인 상태입니다."

    return {
        "body_balance_score": score,
        "body_balance_grade": grade,
        "body_balance_algorithm_version": _BODY_BALANCE_VERSION,
        "body_balance_message": message,
        "body_balance_standard_weight_kg": _round_float(standard_weight_kg),
        "body_balance_standard_fat_mass_kg": _round_float(standard_fat_mass_kg),
        "body_balance_standard_lean_mass_kg": _round_float(standard_lean_mass_kg),
        "body_balance_weight_diff_kg": _round_float(weight_diff_kg),
        "body_balance_fat_diff_kg": _round_float(fat_diff_kg),
        "body_balance_lean_diff_kg": _round_float(lean_diff_kg),
    }


def _calculate_body_composition(
    profile: sqlite3.Row | dict[str, Any],
    measurement: sqlite3.Row | dict[str, Any],
) -> dict[str, Any] | None:
    profile_item = dict(profile)
    item = dict(measurement)
    height_cm = _finite_float(profile_item.get("height_cm"))
    weight_kg = _finite_float(item.get("weight_kg"))
    gender = str(profile_item.get("gender") or "").strip()
    if not height_cm or height_cm <= 0 or not weight_kg or weight_kg <= 0 or gender not in ("male", "female"):
        return None

    measured_at = _parse_measured_at(item)
    age = _age_at(profile_item.get("birth_date"), measured_at)
    if age is None:
        return None

    h = height_cm / 100
    sex = 1 if gender == "male" else 0
    bmi = weight_kg / (h ** 2)
    bmi_category = _bmi_category_korea(bmi)
    standard_weight_kg = 22 * (h ** 2)
    weight_diff_kg = weight_kg - standard_weight_kg
    obesity_degree_percent = (weight_kg / standard_weight_kg) * 100 if standard_weight_kg else None
    bmr_kcal = 10 * weight_kg + 6.25 * height_cm - 5 * age + (5 if sex == 1 else -161)

    warnings: list[str] = []
    if age < 18:
        warnings.append("성인 기준 공식이라 만 18세 미만은 정확도가 낮습니다.")
    if not bool(item.get("stable")):
        warnings.append("안정 측정 플래그가 없어 추정 정확도가 낮을 수 있습니다.")

    impedance_ohm = _finite_float(item.get("impedance_ohm"))
    base = {
        "measurement_id": item.get("id"),
        "home_id": item.get("home_id"),
        "assigned_user_id": item.get("assigned_user_id"),
        "age": age,
        "bmi": _round_float(bmi),
        "bmi_category": bmi_category,
        "standard_weight_kg": _round_float(standard_weight_kg),
        "weight_diff_kg": _round_float(weight_diff_kg),
        "obesity_degree_percent": _round_float(obesity_degree_percent),
        "bmr_kcal": _round_float(bmr_kcal, 0),
        "created_at": _now(),
    }

    if not impedance_ohm or impedance_ohm <= 0:
        fallback_body_fat_percent = 1.20 * bmi + 0.23 * age - 10.8 * sex - 5.4
        return {
            **base,
            "algorithm_version": _BODY_COMPOSITION_FALLBACK_VERSION,
            "resistance_index": None,
            "fat_free_mass_kg": None,
            "fat_free_mass_percent": None,
            "fat_mass_kg": None,
            "body_fat_percent": _round_float(fallback_body_fat_percent),
            "total_body_water_kg": None,
            "body_water_percent": None,
            "skeletal_muscle_mass_kg": None,
            "ffmi": None,
            "fmi": None,
            **_body_balance_empty(),
            "confidence_grade": "D",
            "warnings_json": json.dumps(
                warnings + ["임피던스가 없어 BMI 기반 체지방률만 계산했습니다."],
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        }

    resistance_index = height_cm ** 2 / impedance_ohm
    fat_free_mass_kg = (
        -12.44
        + 0.34 * resistance_index
        + 0.1534 * height_cm
        + 0.273 * weight_kg
        - 0.127 * age
        + 4.56 * sex
    )
    fat_mass_kg = weight_kg - fat_free_mass_kg
    body_fat_percent = (fat_mass_kg / weight_kg) * 100
    fat_free_mass_percent = (fat_free_mass_kg / weight_kg) * 100
    total_body_water_kg = fat_free_mass_kg * 0.73
    body_water_percent = (total_body_water_kg / weight_kg) * 100
    skeletal_muscle_mass_kg = 0.401 * resistance_index + 3.825 * sex - 0.071 * age + 5.102
    ffmi = fat_free_mass_kg / (h ** 2)
    fmi = fat_mass_kg / (h ** 2)

    if fat_mass_kg < 0 or fat_mass_kg > weight_kg:
        warnings.append("체지방량 계산값이 비정상 범위입니다.")
    if body_fat_percent < 3 or body_fat_percent > 60:
        warnings.append("체지방률 계산값이 일반적인 표시 범위를 벗어났습니다.")

    body_balance = _calculate_body_balance(
        gender,
        height_cm,
        weight_kg,
        fat_mass_kg,
        fat_free_mass_kg,
    )

    return {
        **base,
        "algorithm_version": _BODY_COMPOSITION_VERSION,
        "resistance_index": _round_float(resistance_index),
        "fat_free_mass_kg": _round_float(fat_free_mass_kg),
        "fat_free_mass_percent": _round_float(fat_free_mass_percent),
        "fat_mass_kg": _round_float(fat_mass_kg),
        "body_fat_percent": _round_float(body_fat_percent),
        "total_body_water_kg": _round_float(total_body_water_kg),
        "body_water_percent": _round_float(body_water_percent),
        "skeletal_muscle_mass_kg": _round_float(skeletal_muscle_mass_kg),
        "ffmi": _round_float(ffmi),
        "fmi": _round_float(fmi),
        **body_balance,
        "confidence_grade": "C" if warnings else "B",
        "warnings_json": json.dumps(warnings, ensure_ascii=False, separators=(",", ":")),
    }


def _upsert_analysis_for_measurement(conn: sqlite3.Connection, measurement: sqlite3.Row | None) -> None:
    if measurement is None:
        return
    assigned_user_id = measurement["assigned_user_id"]
    measurement_id = measurement["id"]
    if not assigned_user_id:
        conn.execute("DELETE FROM scale_measurement_analysis WHERE measurement_id=?", (measurement_id,))
        return

    profile = conn.execute(
        "SELECT * FROM scale_profiles WHERE home_id=? AND user_id=?",
        (measurement["home_id"], assigned_user_id),
    ).fetchone()
    analysis = _calculate_body_composition(profile, measurement) if profile else None
    if not analysis:
        conn.execute("DELETE FROM scale_measurement_analysis WHERE measurement_id=?", (measurement_id,))
        return

    conn.execute(
        """
        INSERT INTO scale_measurement_analysis (
            measurement_id, home_id, assigned_user_id, algorithm_version, age, bmi, bmi_category,
            standard_weight_kg, weight_diff_kg, obesity_degree_percent, bmr_kcal, resistance_index,
            fat_free_mass_kg, fat_free_mass_percent, fat_mass_kg, body_fat_percent,
            total_body_water_kg, body_water_percent, skeletal_muscle_mass_kg, ffmi, fmi,
            body_balance_score, body_balance_grade, body_balance_algorithm_version,
            body_balance_message, body_balance_standard_weight_kg,
            body_balance_standard_fat_mass_kg, body_balance_standard_lean_mass_kg,
            body_balance_weight_diff_kg, body_balance_fat_diff_kg, body_balance_lean_diff_kg,
            confidence_grade, warnings_json, created_at
        ) VALUES (
            :measurement_id, :home_id, :assigned_user_id, :algorithm_version, :age, :bmi, :bmi_category,
            :standard_weight_kg, :weight_diff_kg, :obesity_degree_percent, :bmr_kcal, :resistance_index,
            :fat_free_mass_kg, :fat_free_mass_percent, :fat_mass_kg, :body_fat_percent,
            :total_body_water_kg, :body_water_percent, :skeletal_muscle_mass_kg, :ffmi, :fmi,
            :body_balance_score, :body_balance_grade, :body_balance_algorithm_version,
            :body_balance_message, :body_balance_standard_weight_kg,
            :body_balance_standard_fat_mass_kg, :body_balance_standard_lean_mass_kg,
            :body_balance_weight_diff_kg, :body_balance_fat_diff_kg, :body_balance_lean_diff_kg,
            :confidence_grade, :warnings_json, :created_at
        )
        ON CONFLICT(measurement_id) DO UPDATE SET
            home_id=excluded.home_id,
            assigned_user_id=excluded.assigned_user_id,
            algorithm_version=excluded.algorithm_version,
            age=excluded.age,
            bmi=excluded.bmi,
            bmi_category=excluded.bmi_category,
            standard_weight_kg=excluded.standard_weight_kg,
            weight_diff_kg=excluded.weight_diff_kg,
            obesity_degree_percent=excluded.obesity_degree_percent,
            bmr_kcal=excluded.bmr_kcal,
            resistance_index=excluded.resistance_index,
            fat_free_mass_kg=excluded.fat_free_mass_kg,
            fat_free_mass_percent=excluded.fat_free_mass_percent,
            fat_mass_kg=excluded.fat_mass_kg,
            body_fat_percent=excluded.body_fat_percent,
            total_body_water_kg=excluded.total_body_water_kg,
            body_water_percent=excluded.body_water_percent,
            skeletal_muscle_mass_kg=excluded.skeletal_muscle_mass_kg,
            ffmi=excluded.ffmi,
            fmi=excluded.fmi,
            body_balance_score=excluded.body_balance_score,
            body_balance_grade=excluded.body_balance_grade,
            body_balance_algorithm_version=excluded.body_balance_algorithm_version,
            body_balance_message=excluded.body_balance_message,
            body_balance_standard_weight_kg=excluded.body_balance_standard_weight_kg,
            body_balance_standard_fat_mass_kg=excluded.body_balance_standard_fat_mass_kg,
            body_balance_standard_lean_mass_kg=excluded.body_balance_standard_lean_mass_kg,
            body_balance_weight_diff_kg=excluded.body_balance_weight_diff_kg,
            body_balance_fat_diff_kg=excluded.body_balance_fat_diff_kg,
            body_balance_lean_diff_kg=excluded.body_balance_lean_diff_kg,
            confidence_grade=excluded.confidence_grade,
            warnings_json=excluded.warnings_json,
            created_at=excluded.created_at
        """,
        analysis,
    )


def _upsert_analysis_for_measurement_id(conn: sqlite3.Connection, measurement_id: str) -> None:
    row = conn.execute("SELECT * FROM scale_measurements WHERE id=?", (measurement_id,)).fetchone()
    _upsert_analysis_for_measurement(conn, row)


def _recalculate_analysis_for_user(conn: sqlite3.Connection, home_id: str, user_id: str) -> None:
    rows = conn.execute(
        "SELECT * FROM scale_measurements WHERE home_id=? AND assigned_user_id=?",
        (home_id, user_id),
    ).fetchall()
    for row in rows:
        _upsert_analysis_for_measurement(conn, row)


def _backfill_missing_analysis(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        DELETE FROM scale_measurement_analysis
        WHERE measurement_id NOT IN (SELECT id FROM scale_measurements)
        """
    )
    rows = conn.execute(
        """
        SELECT m.* FROM scale_measurements m
        LEFT JOIN scale_measurement_analysis a ON a.measurement_id=m.id
        WHERE m.assigned_user_id IS NOT NULL
          AND (
              a.measurement_id IS NULL
              OR (
                  a.body_balance_score IS NULL
                  AND a.fat_mass_kg IS NOT NULL
                  AND a.fat_free_mass_kg IS NOT NULL
              )
          )
        ORDER BY m.received_at DESC
        """
    ).fetchall()
    for row in rows:
        _upsert_analysis_for_measurement(conn, row)


def verify_device(device_id: str, token: str) -> dict[str, Any] | None:
    token_hash = _hash_token(token)
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM scale_devices WHERE device_id=? AND token_hash=? AND enabled=1",
            (device_id, token_hash),
        ).fetchone()
        if row is None:
            row = conn.execute(
                "SELECT * FROM scale_devices WHERE token_hash=? AND enabled=1 ORDER BY created_at DESC LIMIT 1",
                (token_hash,),
            ).fetchone()
    return _row(row)


def _live_progress_for_state(state: str, progress: Any = None) -> int:
    try:
        if progress is not None:
            return max(0, min(100, int(progress)))
    except Exception:
        pass
    return {
        "detected": 18,
        "measuring": 0,
        "stabilizing": 0,
        "waiting_impedance": 0,
        "uploading": 100,
        "done": 100,
        "error": 100,
    }.get(state, 0)


def _impedance_value(payload: dict[str, Any]) -> int | None:
    value = payload.get("impedance_ohm")
    if value is None:
        return None
    try:
        parsed = int(value)
    except Exception:
        return None
    return parsed if parsed > 0 else None


def _has_complete_impedance(payload: dict[str, Any]) -> bool:
    return _impedance_value(payload) is not None


def _coerce_live_payload(payload: dict[str, Any]) -> dict[str, Any]:
    next_payload = dict(payload)
    state = str(next_payload.get("state") or "").strip()
    stable = bool(next_payload.get("stable"))
    complete = _has_complete_impedance(next_payload)

    if stable and not complete and state in ("", "done", "measuring", "stabilizing"):
        state = "waiting_impedance"
    elif not state:
        state = "waiting_impedance" if stable and not complete else ("done" if complete else "measuring")

    if state == "waiting_impedance":
        next_payload["state"] = state
        next_payload.setdefault("progress", 0)
        next_payload.setdefault("message", "몸무게 안정화 완료 · 임피던스 측정 대기 중")
    else:
        next_payload["state"] = state

    if complete:
        next_payload["has_impedance"] = True
    return next_payload


def _payload_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _inactive_live(home_id: str) -> dict[str, Any]:
    return {
        "active": False,
        "homeId": home_id,
        "state": "idle",
        "progress": 0,
        "progressDurationMs": _SCALE_PROGRESS_DURATION_MS,
        "updatedAt": _now(),
    }


def _clear_live_status(home_id: str) -> None:
    with _live_lock:
        _live_status.pop(home_id, None)
    with _connect() as conn:
        conn.execute("DELETE FROM scale_live_status WHERE home_id=?", (home_id,))
        conn.commit()


def update_live_status(device: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    global _live_sequence
    payload = _coerce_live_payload(payload)
    state = str(payload.get("state") or "measuring").strip() or "measuring"
    weight_kg = _payload_float(payload.get("weight_kg") if payload.get("weight_kg") is not None else payload.get("weightKg"))
    if weight_kg is not None and weight_kg < _LIVE_MIN_BODY_WEIGHT_KG:
        _clear_live_status(device["home_id"])
        logger.info(
            "scale live ignored low_weight home=%s device=%s session=%s state=%s weight=%s scale_time=%s",
            device["home_id"],
            device["device_id"],
            payload.get("session_id") or payload.get("sessionId") or "",
            state,
            weight_kg,
            payload.get("scale_time") or payload.get("scaleTime") or "",
        )
        return {
            "ok": True,
            "ignored": True,
            "reason": "low_weight",
            "minWeightKg": _LIVE_MIN_BODY_WEIGHT_KG,
            "live": _inactive_live(device["home_id"]),
        }
    now = _now()
    now_ms = int(time.time() * 1000)
    with _live_lock:
        _live_sequence += 1
        live = {
            "active": True,
            "homeId": device["home_id"],
            "scaleDeviceId": device["id"],
            "deviceId": device["device_id"],
            "sessionId": payload.get("session_id") or payload.get("sessionId"),
            "state": state,
            "progress": _live_progress_for_state(state, payload.get("progress")),
            "progressDurationMs": payload.get("progress_duration_ms") or payload.get("progressDurationMs") or _SCALE_PROGRESS_DURATION_MS,
            "weightKg": payload.get("weight_kg"),
            "weightKgText": payload.get("weight_kg_text") or payload.get("weightKgText") or _weight_text(payload.get("weight_kg")),
            "impedanceOhm": payload.get("impedance_ohm"),
            "scaleTime": payload.get("scale_time") or payload.get("scaleTime"),
            "stable": payload.get("stable"),
            "hasImpedance": bool(payload.get("has_impedance")) if payload.get("has_impedance") is not None else False,
            "message": payload.get("message") or "",
            "measurementId": payload.get("measurement_id") or payload.get("measurementId"),
            "status": payload.get("status"),
            "assignedUserId": payload.get("assigned_user_id") or payload.get("assignedUserId"),
            "confidence": payload.get("confidence"),
            "updatedAt": now,
            "updatedAtMs": now_ms,
            "sequence": _live_sequence,
        }
        _live_status[device["home_id"]] = live
        logger.info(
            "scale live home=%s device=%s session=%s state=%s progress=%s duration_ms=%s weight=%s stable=%s impedance=%s scale_time=%s",
            device["home_id"],
            device["device_id"],
            live.get("sessionId") or "",
            live.get("state"),
            live.get("progress"),
            live.get("progressDurationMs"),
            live.get("weightKg"),
            live.get("stable"),
            live.get("impedanceOhm"),
            live.get("scaleTime"),
        )
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO scale_live_status (home_id, payload_json, updated_at, updated_at_ms, sequence)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(home_id) DO UPDATE SET
                payload_json=excluded.payload_json,
                updated_at=excluded.updated_at,
                updated_at_ms=excluded.updated_at_ms,
                sequence=excluded.sequence
            """,
            (
                device["home_id"],
                json.dumps(live, ensure_ascii=False, separators=(",", ":")),
                now,
                now_ms,
                live["sequence"],
            ),
        )
        conn.commit()
    return {"ok": True, "live": live}


def live_status(username: str, home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    with _connect() as conn:
        row = conn.execute(
            "SELECT payload_json, updated_at FROM scale_live_status WHERE home_id=?",
            (home["id"],),
        ).fetchone()
        if row:
            if _now() - int(row["updated_at"] or 0) <= _LIVE_TTL_SECONDS:
                try:
                    live = json.loads(row["payload_json"])
                    if isinstance(live, dict):
                        return live
                except Exception:
                    pass
            conn.execute("DELETE FROM scale_live_status WHERE home_id=?", (home["id"],))
            conn.commit()

    with _live_lock:
        live = dict(_live_status.get(home["id"]) or {})
        if live and _now() - int(live.get("updatedAt") or 0) <= _LIVE_TTL_SECONDS:
            return live
        if live:
            _live_status.pop(home["id"], None)
    return {
        **_inactive_live(home["id"]),
    }


def clear_live_status(username: str, home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    _clear_live_status(home["id"])
    return {
        "ok": True,
        "live": _inactive_live(home["id"]),
    }


def _publish_final_live_status(
    device: dict[str, Any],
    payload: dict[str, Any],
    result: dict[str, Any],
) -> None:
    live_payload = {
        **payload,
        "state": "done",
        "progress": 100,
        "stable": payload.get("stable", True),
        "measurement_id": result.get("measurementId"),
        "status": result.get("status"),
        "assigned_user_id": result.get("assignedUserId"),
        "confidence": result.get("confidence"),
    }
    update_live_status(device, live_payload)


def ingest_measurement(device: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    weight_kg = round(float(payload["weight_kg"]), 2)
    weight_kg_text = _weight_text(weight_kg) or f"{weight_kg:.2f}"
    payload = {**payload, "weight_kg": weight_kg, "weight_kg_text": weight_kg_text}
    impedance = payload.get("impedance_ohm")
    impedance_ohm = int(impedance) if impedance is not None else None
    if not _has_complete_impedance(payload):
        update_live_status(device, {
            **payload,
            "state": "waiting_impedance",
            "progress": 0,
            "progress_duration_ms": _SCALE_PROGRESS_DURATION_MS,
            "stable": True,
            "message": "몸무게는 안정화됐고 임피던스 값을 기다리는 중입니다.",
        })
        return {
            "ok": True,
            "complete": False,
            "status": "waiting_impedance",
            "message": "impedance_required",
        }

    scale_time = payload.get("scale_time") or payload.get("scale_time_utc") or ""
    measurement_key = payload.get("measurement_key") or f"{scale_time}|{weight_kg:.2f}|{impedance_ohm or 0}"
    now = _now()

    with _connect() as conn:
        existing = conn.execute(
            "SELECT id, status, assigned_user_id, confidence FROM scale_measurements WHERE scale_device_id=? AND measurement_key=?",
            (device["id"], measurement_key),
        ).fetchone()
        if existing:
            _upsert_analysis_for_measurement_id(conn, existing["id"])
            conn.commit()
            result = {
                "ok": True,
                "duplicate": True,
                "measurementId": existing["id"],
                "status": existing["status"],
                "assignedUserId": existing["assigned_user_id"],
                "confidence": existing["confidence"],
            }
            _publish_final_live_status(device, payload, result)
            return result

        if impedance_ohm is None:
            near_duplicate = conn.execute(
                """
                SELECT id, status, assigned_user_id, confidence FROM scale_measurements
                WHERE scale_device_id=? AND received_at >= ? AND impedance_ohm IS NULL
                  AND ABS(weight_kg - ?) <= 0.05
                ORDER BY received_at DESC LIMIT 1
                """,
                (device["id"], now - 90, weight_kg),
            ).fetchone()
        else:
            near_duplicate = conn.execute(
                """
                SELECT id, status, assigned_user_id, confidence FROM scale_measurements
                WHERE scale_device_id=? AND received_at >= ?
                  AND impedance_ohm BETWEEN ? AND ?
                  AND ABS(weight_kg - ?) <= 0.05
                ORDER BY received_at DESC LIMIT 1
                """,
                (device["id"], now - 90, impedance_ohm - 2, impedance_ohm + 2, weight_kg),
            ).fetchone()
        if near_duplicate:
            _upsert_analysis_for_measurement_id(conn, near_duplicate["id"])
            conn.commit()
            result = {
                "ok": True,
                "duplicate": True,
                "duplicateReason": "near_duplicate",
                "measurementId": near_duplicate["id"],
                "status": near_duplicate["status"],
                "assignedUserId": near_duplicate["assigned_user_id"],
                "confidence": near_duplicate["confidence"],
            }
            _publish_final_live_status(device, payload, result)
            return result

        assigned_user, status, confidence, method = _auto_assign(conn, device["home_id"], weight_kg, impedance_ohm)
        measurement_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO scale_measurements (
                id, home_id, scale_device_id, assigned_user_id, status, confidence, assignment_method,
                weight_kg, weight_kg_text, impedance_ohm, stable, has_impedance, flags, scale_time, received_at,
                raw, rssi, measurement_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                measurement_id, device["home_id"], device["id"], assigned_user, status, confidence, method,
                weight_kg, weight_kg_text, impedance_ohm,
                1 if payload.get("stable") else 0,
                1 if payload.get("has_impedance") else 0,
                str(payload.get("flags") or ""),
                str(scale_time),
                now,
                str(payload.get("raw") or ""),
                payload.get("rssi"),
                measurement_key,
            ),
        )
        inserted = conn.execute("SELECT * FROM scale_measurements WHERE id=?", (measurement_id,)).fetchone()
        _upsert_analysis_for_measurement(conn, inserted)
        conn.commit()

    result = {
        "ok": True,
        "duplicate": False,
        "measurementId": measurement_id,
        "status": status,
        "assignedUserId": assigned_user,
        "confidence": confidence,
    }
    _publish_final_live_status(device, payload, result)
    return result


def _analysis_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    item = dict(row)
    try:
        warnings = json.loads(item.pop("warnings_json") or "[]")
        if not isinstance(warnings, list):
            warnings = []
    except Exception:
        warnings = []
    body_balance = None
    if item.get("body_balance_score") is not None:
        body_balance = {
            "bodyBalanceScore": item["body_balance_score"],
            "bodyBalanceGrade": item["body_balance_grade"],
            "standardWeightKg": item["body_balance_standard_weight_kg"],
            "standardFatMassKg": item["body_balance_standard_fat_mass_kg"],
            "standardLeanMassKg": item["body_balance_standard_lean_mass_kg"],
            "weightDiffKg": item["body_balance_weight_diff_kg"],
            "fatDiffKg": item["body_balance_fat_diff_kg"],
            "leanDiffKg": item["body_balance_lean_diff_kg"],
            "algorithmVersion": item["body_balance_algorithm_version"],
            "message": item["body_balance_message"],
        }
    return {
        "measurementId": item["measurement_id"],
        "algorithmVersion": item["algorithm_version"],
        "age": item["age"],
        "bmi": item["bmi"],
        "bmiCategory": item["bmi_category"],
        "standardWeightKg": item["standard_weight_kg"],
        "weightDiffKg": item["weight_diff_kg"],
        "obesityDegreePercent": item["obesity_degree_percent"],
        "bmrKcal": item["bmr_kcal"],
        "resistanceIndex": item["resistance_index"],
        "fatFreeMassKg": item["fat_free_mass_kg"],
        "fatFreeMassPercent": item["fat_free_mass_percent"],
        "fatMassKg": item["fat_mass_kg"],
        "bodyFatPercent": item["body_fat_percent"],
        "totalBodyWaterKg": item["total_body_water_kg"],
        "bodyWaterPercent": item["body_water_percent"],
        "skeletalMuscleMassKg": item["skeletal_muscle_mass_kg"],
        "ffmi": item["ffmi"],
        "fmi": item["fmi"],
        "bodyBalance": body_balance,
        "bodyBalanceScore": item["body_balance_score"],
        "bodyBalanceGrade": item["body_balance_grade"],
        "bodyBalanceAlgorithmVersion": item["body_balance_algorithm_version"],
        "bodyBalanceMessage": item["body_balance_message"],
        "bodyBalanceStandardWeightKg": item["body_balance_standard_weight_kg"],
        "bodyBalanceStandardFatMassKg": item["body_balance_standard_fat_mass_kg"],
        "bodyBalanceStandardLeanMassKg": item["body_balance_standard_lean_mass_kg"],
        "bodyBalanceWeightDiffKg": item["body_balance_weight_diff_kg"],
        "bodyBalanceFatDiffKg": item["body_balance_fat_diff_kg"],
        "bodyBalanceLeanDiffKg": item["body_balance_lean_diff_kg"],
        "confidenceGrade": item["confidence_grade"],
        "warnings": warnings,
        "createdAt": item["created_at"],
    }


def _analysis_for_measurement(conn: sqlite3.Connection, measurement_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM scale_measurement_analysis WHERE measurement_id=?",
        (measurement_id,),
    ).fetchone()
    return _analysis_dict(row)


def _analysis_map(conn: sqlite3.Connection, measurement_ids: list[str]) -> dict[str, dict[str, Any]]:
    ids = [measurement_id for measurement_id in measurement_ids if measurement_id]
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT * FROM scale_measurement_analysis WHERE measurement_id IN ({placeholders})",
        ids,
    ).fetchall()
    return {
        row["measurement_id"]: analysis
        for row in rows
        if (analysis := _analysis_dict(row)) is not None
    }


def _attach_analysis(conn: sqlite3.Connection, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    analyses = _analysis_map(conn, [item.get("id") for item in items])
    for item in items:
        item["analysis"] = analyses.get(item.get("id"))
    return items


def _measurement_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    item = dict(row)
    weight_kg = round(float(item.pop("weight_kg")), 2)
    item["weightKg"] = weight_kg
    item["weightKgText"] = item.pop("weight_kg_text", None) or _weight_text(weight_kg)
    item["impedanceOhm"] = item.pop("impedance_ohm")
    item["assignedUserId"] = item.pop("assigned_user_id")
    item["scaleTime"] = item.pop("scale_time")
    item["receivedAt"] = item.pop("received_at")
    item["measurementKey"] = item.pop("measurement_key")
    item["hasImpedance"] = bool(item.pop("has_impedance"))
    item["stable"] = bool(item["stable"])
    return item


def summary(username: str, home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    with _connect() as conn:
        latest = _latest_for_user(conn, home["id"], username)
        latest_item = _measurement_dict(latest)
        if latest_item:
            latest_item["analysis"] = _analysis_for_measurement(conn, latest_item["id"])
        pending_count = conn.execute(
            "SELECT count(*) FROM scale_measurements WHERE home_id=? AND status='pending'",
            (home["id"],),
        ).fetchone()[0]
    return {
        "home": home,
        "profile": get_profile(username, home["id"]),
        "devices": list_devices(username, home["id"]),
        "latest": latest_item,
        "pendingCount": pending_count,
    }


def history(username: str, days: float = 90, home_id: str | None = None) -> list[dict[str, Any]]:
    home = get_home_for_user(username, home_id)
    since = _now() - int(days * 86400)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM scale_measurements
            WHERE home_id=? AND assigned_user_id=? AND received_at >= ?
            ORDER BY received_at DESC LIMIT 500
            """,
            (home["id"], username, since),
        ).fetchall()
        items = [_measurement_dict(r) for r in rows if r is not None]
        return _attach_analysis(conn, [item for item in items if item is not None])


def pending(username: str, home_id: str | None = None) -> list[dict[str, Any]]:
    home = get_home_for_user(username, home_id)
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM scale_measurements
            WHERE home_id=? AND status='pending'
            ORDER BY received_at DESC LIMIT 50
            """,
            (home["id"],),
        ).fetchall()
        items = [_measurement_dict(r) for r in rows if r is not None]
        return _attach_analysis(conn, [item for item in items if item is not None])


def claim(username: str, measurement_id: str, home_id: str | None = None) -> dict[str, Any]:
    home = get_home_for_user(username, home_id)
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM scale_measurements WHERE id=? AND home_id=?",
            (measurement_id, home["id"]),
        ).fetchone()
        if row is None:
            raise ValueError("measurement_not_found")
        conn.execute(
            """
            UPDATE scale_measurements
            SET assigned_user_id=?, status='manually_claimed', confidence=1.0, assignment_method='manual_claim'
            WHERE id=? AND home_id=?
            """,
            (username, measurement_id, home["id"]),
        )
        updated = conn.execute("SELECT * FROM scale_measurements WHERE id=?", (measurement_id,)).fetchone()
        _upsert_analysis_for_measurement(conn, updated)
        conn.commit()
        item = _measurement_dict(updated) or {}
        if item:
            item["analysis"] = _analysis_for_measurement(conn, measurement_id)
    return item
