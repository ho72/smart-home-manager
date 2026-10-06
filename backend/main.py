from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from automation_engine import automation_scheduler
from notification_scheduler import notification_scheduler
from router import (
    auth_router, automations_router, devices_router, llm_router, notifications_router,
    homes_router, scale_router, settings_router, smartthings_router, smartthings_oauth_router, weather_router, xiaomi_router,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 자동화 스케줄러 + 알림 스케줄러 두 개 백그라운드 task.
    tasks = [
        asyncio.create_task(automation_scheduler()),
        asyncio.create_task(notification_scheduler()),
    ]
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass


app = FastAPI(title="nook API", version="1.0.0", lifespan=lifespan)

cors_origins = [
    origin.strip()
    for origin in os.getenv("NOOK_CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router,        prefix="/auth",         tags=["auth"])
app.include_router(homes_router.router,       prefix="/homes",        tags=["homes"])
app.include_router(devices_router.router,     prefix="/devices",      tags=["devices"])
app.include_router(smartthings_router.router, prefix="/smartthings",  tags=["smartthings"])
app.include_router(smartthings_oauth_router.router, prefix="/auth/smartthings", tags=["smartthings-oauth"])
app.include_router(xiaomi_router.router,      prefix="/xiaomi",       tags=["xiaomi"])
app.include_router(weather_router.router,     prefix="/weather",      tags=["weather"])
app.include_router(automations_router.router, prefix="/automations",  tags=["automations"])
app.include_router(settings_router.router,    prefix="/settings",     tags=["settings"])
app.include_router(notifications_router.router, prefix="/notifications", tags=["notifications"])
app.include_router(llm_router.router,         prefix="/llm",          tags=["llm"])
app.include_router(scale_router.router,       prefix="/scale",        tags=["scale"])
app.include_router(scale_router.ingest_router,                       tags=["scale-ingest"])


@app.get("/health")
def health():
    return {"ok": True}


# 빌드된 프론트엔드 서빙 (dist/ 폴더가 있을 때만)
_dist = Path(__file__).parent.parent / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="spa")
