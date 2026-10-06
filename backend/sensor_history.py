"""
공기청정기 등 센서 보유 디바이스의 시계열 저장소 (sqlite).

스케줄러가 1분마다 status 폴링하여 record() 로 append, prune_older_than(24h)
로 ring 유지. 차트/자동화가 query() 로 읽음.

camelCase 키 (frontend airStatus 와 동일) 로 입출력 — caller 가 변환할 일 없음.
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

DB_FILE = Path(__file__).parent / "sensor_history.db"

# camelCase (frontend) ↔ snake_case (sqlite column).
_FIELDS: dict[str, str] = {
    "aqi":         "aqi",
    "averageAqi":  "average_aqi",
    "humidity":    "humidity",
    "temperature": "temperature",
    "pm10":        "pm10",
    "tvoc":        "tvoc",
    "motorSpeed":  "motor_speed",
}
_COLUMN_TO_KEY = {v: k for k, v in _FIELDS.items()}

_init_lock = threading.Lock()
_initialized = False


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sensor_history (
            device_id    TEXT    NOT NULL,
            ts           INTEGER NOT NULL,
            aqi          REAL,
            average_aqi  REAL,
            humidity     REAL,
            temperature  REAL,
            pm10         REAL,
            tvoc         REAL,
            motor_speed  REAL,
            PRIMARY KEY (device_id, ts)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_device_ts "
        "ON sensor_history(device_id, ts)"
    )
    conn.commit()


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    global _initialized
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
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


def record(device_id: str, ts: int, sample: dict[str, Any]) -> None:
    """sample 의 camelCase 키 중 _FIELDS 에 있는 것만 저장. 나머지는 무시.
    ts 는 unix epoch seconds. (device_id, ts) 충돌 시 INSERT OR REPLACE."""
    cols = ["device_id", "ts"]
    vals: list[Any] = [device_id, int(ts)]
    for key, col in _FIELDS.items():
        v = sample.get(key)
        if v is None:
            cols.append(col)
            vals.append(None)
        else:
            try:
                vals.append(float(v))
            except (TypeError, ValueError):
                vals.append(None)
            cols.append(col)
    placeholders = ",".join("?" * len(cols))
    sql = f"INSERT OR REPLACE INTO sensor_history ({','.join(cols)}) VALUES ({placeholders})"
    with _connect() as conn:
        conn.execute(sql, vals)
        conn.commit()


def query(device_id: str, since_ts: int) -> list[dict[str, Any]]:
    """ts >= since_ts 인 row 들을 ts 오름차순으로 반환. 키는 camelCase."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM sensor_history WHERE device_id=? AND ts >= ? ORDER BY ts ASC",
            (device_id, int(since_ts)),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        item: dict[str, Any] = {"ts": r["ts"]}
        for col, key in _COLUMN_TO_KEY.items():
            v = r[col]
            if v is not None:
                item[key] = v
        out.append(item)
    return out


def latest(device_id: str) -> dict[str, Any] | None:
    """가장 최근 sample (sensor trigger edge 비교용). 없으면 None."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM sensor_history WHERE device_id=? ORDER BY ts DESC LIMIT 1",
            (device_id,),
        ).fetchone()
    if row is None:
        return None
    item: dict[str, Any] = {"ts": row["ts"]}
    for col, key in _COLUMN_TO_KEY.items():
        v = row[col]
        if v is not None:
            item[key] = v
    return item


def prune_older_than(cutoff_ts: int) -> int:
    """ts < cutoff_ts row 삭제. 삭제 row 수 반환."""
    with _connect() as conn:
        cur = conn.execute("DELETE FROM sensor_history WHERE ts < ?", (int(cutoff_ts),))
        conn.commit()
        return cur.rowcount or 0
