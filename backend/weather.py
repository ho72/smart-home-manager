"""
기상청 APIHub (apihub.kma.go.kr) 클라이언트.
- 초단기실황 (UltraSrtNcst): 현재 관측값 (온도/습도/풍속/강수)
- 초단기예보 (UltraSrtFcst): 6시간 시간별 예보 (SKY/PTY/온도)
- 단기예보   (VilageFcst):   최대 5일 일별 예보 (TMX/TMN/POP)
- 중기예보   (MidFcst):      단기예보로 부족한 날짜 보강

좌표 변환: 위경도 → KMA 격자 좌표 (LCC DFS).
캐시: 동일 격자에 대해 10분 (사용자 PTR 또는 폴링 시 매번 호출 방지).
"""
from __future__ import annotations

import datetime
import math
import os
import threading
import time

import requests

BASE_URL = "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0"
MID_URL = "https://apihub.kma.go.kr/api/typ02/openApi/MidFcstInfoService"
_CACHE_TTL = 600  # 10분
_REQUEST_TIMEOUT = float(os.getenv("KMA_REQUEST_TIMEOUT_SECONDS", "4"))
_MID_REQUEST_TIMEOUT = float(os.getenv("KMA_MID_REQUEST_TIMEOUT_SECONDS", "2"))
_INFLIGHT_WAIT_TIMEOUT = float(os.getenv("KMA_INFLIGHT_WAIT_SECONDS", "6"))
KST = datetime.timezone(datetime.timedelta(hours=9))

_cache: dict[str, tuple[float, dict]] = {}
_inflight: dict[str, threading.Event] = {}
_cache_lock = threading.Lock()


# ── env ────────────────────────────────────────────────────────────

def _api_key() -> str:
    key = os.environ.get("KMA_API_KEY", "").strip()
    if not key:
        raise RuntimeError("KMA_API_KEY not set in .env")
    return key


def _location() -> tuple[float, float]:
    lat = float(os.getenv("WEATHER_LAT", "37.5665"))   # 기본: 서울시청
    lon = float(os.getenv("WEATHER_LON", "126.9780"))
    return lat, lon


def _location_name() -> str:
    return os.getenv("WEATHER_LOCATION_NAME", "현재 위치").strip() or "현재 위치"


def _mid_land_reg_id() -> str:
    return os.getenv("KMA_MID_LAND_REG_ID", "11B00000").strip()  # 서울/인천/경기


def _mid_temp_reg_id() -> str:
    return os.getenv("KMA_MID_TEMP_REG_ID", "11B10101").strip()  # 서울


# ── 위경도 → 격자 좌표 (KMA LCC DFS) ─────────────────────────────

def latlon_to_grid(lat: float, lon: float) -> tuple[int, int]:
    RE = 6371.00877
    GRID = 5.0
    SLAT1 = 30.0
    SLAT2 = 60.0
    OLON = 126.0
    OLAT = 38.0
    XO = 43
    YO = 136

    DEGRAD = math.pi / 180.0
    re = RE / GRID
    slat1 = SLAT1 * DEGRAD
    slat2 = SLAT2 * DEGRAD
    olon = OLON * DEGRAD
    olat = OLAT * DEGRAD

    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = (sf ** sn) * math.cos(slat1) / sn
    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / (ro ** sn)

    ra = math.tan(math.pi * 0.25 + lat * DEGRAD * 0.5)
    ra = re * sf / (ra ** sn)
    theta = lon * DEGRAD - olon
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    nx = int(ra * math.sin(theta) + XO + 0.5)
    ny = int(ro - ra * math.cos(theta) + YO + 0.5)
    return nx, ny


# ── 발표 시각 계산 ───────────────────────────────────────────────

def _now_kst() -> datetime.datetime:
    return datetime.datetime.now(KST)


def _ultra_srt_ncst_base() -> tuple[str, str]:
    """초단기실황: 매시 40분 이후 해당 시간대 데이터 사용 가능."""
    now = _now_kst()
    if now.minute < 40:
        now -= datetime.timedelta(hours=1)
    return now.strftime("%Y%m%d"), now.strftime("%H00")


def _ultra_srt_fcst_base() -> tuple[str, str]:
    """초단기예보: 매시 30분 발표, 45분 이후 사용 가능."""
    now = _now_kst()
    if now.minute < 45:
        now -= datetime.timedelta(hours=1)
    return now.strftime("%Y%m%d"), now.strftime("%H30")


def _vilage_fcst_base() -> tuple[str, str]:
    """단기예보: 02/05/08/11/14/17/20/23시 + 10분 이후."""
    now = _now_kst()
    base_hours = [2, 5, 8, 11, 14, 17, 20, 23]
    candidates = [bh for bh in base_hours if bh < now.hour or (bh == now.hour and now.minute >= 10)]
    if candidates:
        base_h = max(candidates)
        return now.strftime("%Y%m%d"), f"{base_h:02d}00"
    # 자정 ~ 02:09 → 전날 23시
    yesterday = now - datetime.timedelta(days=1)
    return yesterday.strftime("%Y%m%d"), "2300"


def _mid_fcst_base_candidates() -> list[str]:
    """중기예보: 06/18시 발표. 최신 시각이 비어 있으면 이전 발표로 재시도."""
    now = _now_kst()
    candidates = []
    if now.hour > 18 or (now.hour == 18 and now.minute >= 30):
        candidates.append(now.replace(hour=18, minute=0, second=0, microsecond=0))
    if now.hour > 6 or (now.hour == 6 and now.minute >= 30):
        candidates.append(now.replace(hour=6, minute=0, second=0, microsecond=0))

    yesterday = now - datetime.timedelta(days=1)
    candidates.append(yesterday.replace(hour=18, minute=0, second=0, microsecond=0))
    candidates.append(yesterday.replace(hour=6, minute=0, second=0, microsecond=0))

    seen = set()
    result = []
    for candidate in candidates:
        key = candidate.strftime("%Y%m%d%H%M")
        if key not in seen:
            seen.add(key)
            result.append(key)
    return result


# ── HTTP ─────────────────────────────────────────────────────────

def _timeout_tuple(seconds: float) -> tuple[float, float]:
    connect = min(1.5, max(0.5, seconds / 2))
    read = max(1.0, seconds)
    return connect, read


def _request(endpoint: str, params: dict, base_url: str = BASE_URL, timeout: float | None = None) -> list[dict]:
    full_params = {**params, "authKey": _api_key(), "dataType": "JSON"}
    r = requests.get(
        f"{base_url}/{endpoint}",
        params=full_params,
        timeout=_timeout_tuple(timeout if timeout is not None else _REQUEST_TIMEOUT),
    )
    r.raise_for_status()
    j = r.json()
    body = j.get("response", {}).get("body", {})
    items = body.get("items", {}).get("item", [])
    if not isinstance(items, list):
        return []
    return items


# ── 매핑 ─────────────────────────────────────────────────────────

_SKY_KOR = {"1": "맑음", "3": "구름많음", "4": "흐림"}
_PTY_KOR = {
    "0": "없음", "1": "비", "2": "비/눈", "3": "눈",
    "4": "소나기", "5": "빗방울", "6": "빗방울/눈날림", "7": "눈날림",
}


def _icon_key(sky, pty) -> str:
    sky = str(sky)
    pty = str(pty)
    if pty != "0":
        if pty in ("3", "7"):
            return "snow"
        return "rain"
    if sky == "1":
        return "sun"
    if sky == "3":
        return "partly"
    return "cloud"


def _sky_pty_from_text(text) -> tuple[str, str]:
    text = str(text or "")
    if "눈" in text:
        return "4", "3"
    if "비" in text or "소나기" in text:
        return "4", "1"
    if "흐림" in text:
        return "4", "0"
    if "구름" in text:
        return "3", "0"
    return "1", "0"


def _safe_float(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ── 캐시 wrapper ─────────────────────────────────────────────────

def _cached(key: str, fetch):
    owner = False
    with _cache_lock:
        now = time.time()
        cached = _cache.get(key)
        if cached:
            ts, data = cached
            if now - ts < _CACHE_TTL:
                return data
            stale = data
        else:
            stale = None

        wait_for = _inflight.get(key)
        if wait_for is None:
            wait_for = threading.Event()
            _inflight[key] = wait_for
            owner = True

    if not owner:
        wait_for.wait(_INFLIGHT_WAIT_TIMEOUT)
        with _cache_lock:
            cached = _cache.get(key)
            if cached:
                return cached[1]
        if stale is not None:
            return stale
        raise RuntimeError("weather request is still pending")

    try:
        data = fetch()
        with _cache_lock:
            _cache[key] = (time.time(), data)
        return data
    except Exception:
        if stale is not None:
            return stale
        raise
    finally:
        with _cache_lock:
            _inflight.pop(key, None)
            wait_for.set()


# ── 공개 API ──────────────────────────────────────────────────────

def get_current() -> dict:
    """현재 날씨 (실황값 + 현재 시각의 SKY/PTY는 초단기예보에서 보강)."""
    nx, ny = latlon_to_grid(*_location())

    def fetch():
        date, ftime = _ultra_srt_ncst_base()
        ncst_items = _request("getUltraSrtNcst", {
            "pageNo": 1, "numOfRows": 100,
            "base_date": date, "base_time": ftime, "nx": nx, "ny": ny,
        })
        ncst = {it["category"]: it.get("obsrValue") for it in ncst_items}

        # SKY/PTY 는 실황엔 없음 → 초단기예보 첫 fcstTime 값 사용
        fdate, ftime2 = _ultra_srt_fcst_base()
        fcst_items = _request("getUltraSrtFcst", {
            "pageNo": 1, "numOfRows": 60,
            "base_date": fdate, "base_time": ftime2, "nx": nx, "ny": ny,
        })
        first_t = fcst_items[0]["fcstTime"] if fcst_items else None
        first = {it["category"]: it.get("fcstValue")
                 for it in fcst_items if it["fcstTime"] == first_t}
        sky = first.get("SKY", "1")
        pty = first.get("PTY", "0")

        return {
            "temp": _safe_float(ncst.get("T1H")),
            "humidity": int(_safe_float(ncst.get("REH"))),
            "windSpeed": _safe_float(ncst.get("WSD")),
            "rain1h": _safe_float(ncst.get("RN1")),
            "sky": int(_safe_float(sky, 1)),
            "skyText": _SKY_KOR.get(str(sky), "?"),
            "pty": int(_safe_float(pty, 0)),
            "ptyText": _PTY_KOR.get(str(pty), "?"),
            "icon": _icon_key(sky, pty),
            "locationName": _location_name(),
            "updatedAt": int(time.time()),
        }

    return _cached(f"current:{nx},{ny}", fetch)


def get_forecast() -> dict:
    """시간별(다음 6시간) + 일별(오늘부터 최대 7일)."""
    nx, ny = latlon_to_grid(*_location())

    def fetch():
        # 1) 시간별 — 초단기예보
        sdate, stime = _ultra_srt_fcst_base()
        h_items = _request("getUltraSrtFcst", {
            "pageNo": 1, "numOfRows": 200,
            "base_date": sdate, "base_time": stime, "nx": nx, "ny": ny,
        })
        by_time: dict[str, dict] = {}
        for it in h_items:
            t = f"{it['fcstDate']}{it['fcstTime']}"
            by_time.setdefault(t, {})[it["category"]] = it.get("fcstValue")
        hourly = []
        for t in sorted(by_time.keys())[:6]:
            d = by_time[t]
            sky = d.get("SKY", "1"); pty = d.get("PTY", "0")
            hourly.append({
                "time": t,
                "hour": int(t[8:10]),
                "temp": _safe_float(d.get("T1H")),
                "sky": int(_safe_float(sky, 1)),
                "pty": int(_safe_float(pty, 0)),
                "icon": _icon_key(sky, pty),
            })

        # 2) 일별 — 단기예보
        vdate, vtime = _vilage_fcst_base()
        v_items = _request("getVilageFcst", {
            "pageNo": 1, "numOfRows": 1000,
            "base_date": vdate, "base_time": vtime, "nx": nx, "ny": ny,
        })
        by_date: dict[str, dict] = {}
        for it in v_items:
            day = it["fcstDate"]
            cat = it["category"]
            val = it.get("fcstValue")
            by_date.setdefault(day, {})
            if cat in ("TMX", "TMN"):
                # 한 번만 (보통 오전에 1개만 발표됨)
                by_date[day].setdefault(cat, val)
            elif cat == "POP":
                # 강수확률 최댓값 채택 (대표값)
                cur = by_date[day].get("POP")
                if cur is None or _safe_float(val) > _safe_float(cur):
                    by_date[day]["POP"] = val
            elif cat in ("SKY", "PTY") and it["fcstTime"] == "1200":
                # 정오 대표값
                by_date[day][cat] = val

        today = _now_kst().date()
        target_dates = [
            (today + datetime.timedelta(days=offset)).strftime("%Y%m%d")
            for offset in range(7)
        ]

        mid_by_date = _fetch_mid_daily(today)

        daily = []
        for day in target_dates:
            if day not in by_date and day not in mid_by_date:
                continue
            d = {**mid_by_date.get(day, {}), **by_date.get(day, {})}
            daily.append(_daily_item(day, d))

        return {"hourly": hourly, "daily": daily, "updatedAt": int(time.time())}

    return _cached(f"forecast:{nx},{ny}", fetch)


def _daily_item(day: str, d: dict) -> dict:
    sky = d.get("SKY", "1"); pty = d.get("PTY", "0")
    return {
        "date": day,
        "tmin": _safe_float(d["TMN"]) if "TMN" in d else None,
        "tmax": _safe_float(d["TMX"]) if "TMX" in d else None,
        "pop": int(_safe_float(d.get("POP"), 0)),
        "sky": int(_safe_float(sky, 1)),
        "pty": int(_safe_float(pty, 0)),
        "icon": _icon_key(sky, pty),
    }


def _fetch_mid_daily(today: datetime.date) -> dict[str, dict]:
    """단기예보에 없는 뒤쪽 날짜를 중기예보로 보강한다.

    KMA APIHub는 중기예보를 별도 활용신청으로 제한할 수 있으므로 실패해도
    전체 날씨 API를 깨뜨리지 않고 단기예보만 반환한다.
    """
    land_items = []
    temp_items = []
    for tm_fc in _mid_fcst_base_candidates():
        try:
            land_items = _request("getMidLandFcst", {
                "pageNo": 1, "numOfRows": 10,
                "regId": _mid_land_reg_id(), "tmFc": tm_fc,
            }, base_url=MID_URL, timeout=_MID_REQUEST_TIMEOUT)
            temp_items = _request("getMidTa", {
                "pageNo": 1, "numOfRows": 10,
                "regId": _mid_temp_reg_id(), "tmFc": tm_fc,
            }, base_url=MID_URL, timeout=_MID_REQUEST_TIMEOUT)
        except requests.RequestException:
            return {}

        if land_items or temp_items:
            break

    land = land_items[0] if land_items else {}
    temp = temp_items[0] if temp_items else {}
    by_date: dict[str, dict] = {}

    for offset in range(3, 8):
        day = (today + datetime.timedelta(days=offset)).strftime("%Y%m%d")
        d: dict = {}

        if offset <= 7:
            wf = land.get(f"wf{offset}Pm") or land.get(f"wf{offset}Am")
            pop_values = [land.get(f"rnSt{offset}Am"), land.get(f"rnSt{offset}Pm")]
        else:
            wf = land.get(f"wf{offset}")
            pop_values = [land.get(f"rnSt{offset}")]

        pop_values = [v for v in pop_values if v is not None]
        if pop_values:
            d["POP"] = max(pop_values, key=_safe_float)

        if wf:
            sky, pty = _sky_pty_from_text(wf)
            d["SKY"] = sky
            d["PTY"] = pty

        if temp.get(f"taMin{offset}") is not None:
            d["TMN"] = temp.get(f"taMin{offset}")
        if temp.get(f"taMax{offset}") is not None:
            d["TMX"] = temp.get(f"taMax{offset}")

        if d:
            by_date[day] = d

    return by_date
