"""
알림 백그라운드 스케줄러.

매 분 정시에 깨어 모든 사용자의 notificationPrefs.weather 를 검사:
  - enabled=True 이고
  - time(HH:MM, KST) 이 현재와 일치하고
  - 같은 날 아직 발송 안 됐으면
  → /weather/current 를 가져와 푸시 알림 발송, 마지막 발송 일자(YYYY-MM-DD) 기록
"""
from __future__ import annotations

import asyncio
import datetime
import logging

from notifications import send_to_user
from state import iter_all_users, load_user_state, save_user_state
from weather import get_current

log = logging.getLogger("notification_scheduler")
KST = datetime.timezone(datetime.timedelta(hours=9))


def _build_weather_payload(weather: dict) -> dict:
    temp = round(weather.get("temp", 0))
    sky = weather.get("skyText", "")
    humid = weather.get("humidity", 0)
    rain = weather.get("rain1h", 0) or 0
    suffix = f" · 강수 {rain}mm" if rain else ""
    return {
        "title": "오늘 날씨 브리핑",
        "body": f"{temp}° · {sky} · 습도 {humid}%{suffix}",
        "url": "/?goto=weather",
        "icon": "/icon.png",
        "tag": "weather-briefing",
    }


def _check_weather_briefings(now: datetime.datetime) -> int:
    hhmm = now.strftime("%H:%M")
    today = now.strftime("%Y-%m-%d")
    fired = 0
    weather_cache: dict | None = None  # 같은 분 안에선 한 번만 fetch

    for username, _user_state_snapshot in iter_all_users():
        # 최신 prefs 로 다시 로드 (snapshot 은 stale 가능)
        state = load_user_state(username)
        prefs = (state.get("notificationPrefs") or {}).get("weather") or {}
        if not prefs.get("enabled"):
            continue
        if prefs.get("time") != hhmm:
            continue
        if prefs.get("lastFiredDay") == today:
            continue

        try:
            if weather_cache is None:
                weather_cache = get_current()
            payload = _build_weather_payload(weather_cache)
            result = send_to_user(username, payload)
            log.info("weather briefing → %s: sent=%d removed=%d errors=%s",
                     username, result["sent"], result["removed"], result["errors"])
            # dedupe 마커 — 같은 날 같은 시각 재시작/재시도 방지
            fresh = load_user_state(username)
            np = fresh.get("notificationPrefs") or {}
            wpref = (np.get("weather") or {}).copy()
            wpref["lastFiredDay"] = today
            np["weather"] = wpref
            fresh["notificationPrefs"] = np
            save_user_state(username, fresh)
            fired += 1
        except Exception as e:
            log.exception("weather briefing failed for %s: %s", username, e)
    return fired


async def notification_scheduler():
    log.info("notification scheduler started")
    while True:
        now = datetime.datetime.now()
        sleep_secs = 60 - now.second + (1 - now.microsecond / 1_000_000)
        try:
            await asyncio.sleep(max(1, sleep_secs))
        except asyncio.CancelledError:
            log.info("notification scheduler cancelled")
            raise
        try:
            fired = _check_weather_briefings(datetime.datetime.now(KST))
            if fired:
                log.info("notification scheduler fired %d briefing(s)", fired)
        except Exception as e:
            log.exception("notification scheduler error: %s", e)
