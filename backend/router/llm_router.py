"""
LLM 챗 엔드포인트.

흐름 (구조화 JSON 출력 방식):
  1. 사용자 메시지 + 디바이스/자동화 카탈로그 → 시스템 프롬프트 구성
  2. OpenRouter chat completions 호출 (Qwen/Llama free tier)
  3. 응답을 JSON 으로 파싱: {reply, actions: [{tool, ...}]}
  4. llm_tools.dispatch_plan 으로 actions 실행
  5. {reply, executed: [...]} 반환

Tool calling (function calling) 은 free 20b 모델에서 안정성이 들쭉날쭉
해서 일단 JSON 출력 방식으로 시작. 모델이 OpenAI tool-use 를 안정적으로
지원하도록 바뀌면 _build_messages 만 갈아끼우면 됨.

dev guard: LLM_DEVICE_LABEL_PREFIX 로 시작하는 라벨의 디바이스만 LLM 이
보고/제어 가능. 빈 문자열이면 사용자 디바이스 전체.
"""
from __future__ import annotations

import datetime
import json
import logging
import os
import re
import time
from typing import Any

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import require_auth
import llm_tools

log = logging.getLogger("llm.router")

router = APIRouter()

KST = datetime.timezone(datetime.timedelta(hours=9))


# ──────────────────────────────────────────────────────────────
# Request / Response 스키마
# ──────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    # Optional 이전 대화 — 클라이언트가 들고 있다가 매번 보냄. 길이 제한.
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


class ChatResponse(BaseModel):
    reply: str
    executed: list[dict] = Field(default_factory=list)
    debug: dict = Field(default_factory=dict)  # 모델/원문 등 디버그용 — 프런트가 무시 가능


# ──────────────────────────────────────────────────────────────
# 시스템 프롬프트 빌드
# ──────────────────────────────────────────────────────────────

_OUTPUT_SCHEMA_HINT = """\
출력은 반드시 단일 JSON 오브젝트. 코드블록(```json) 없이 원시 JSON 만:

{
  "reply": "사용자에게 한국어 자연어로 친근하게 설명",
  "actions": [
    // 0개 이상. 빈 배열이면 단순 답변만.
    // 각 항목은 다음 4가지 중 하나:

    {"tool": "control_device", "deviceId": "<id>", "action": "<verb>", "params": {<key>: <val>}},

    {"tool": "create_automation",
     "name": "<짧은 이름>",
     "trigger": "time" | "sensor",
     // time 트리거는 다음 중 하나만:
     "triggerTime": "HH:MM",          // 절대 시각 (KST)
     "delayMinutes": <int>,           // 또는 N분 후
     // sensor 트리거의 경우:
     "triggerSensor": {"deviceId": "<id>", "field": "aqi"|"temperature"|"humidity"|"pm10",
                       "op": ">"|"<"|">="|"<=", "value": <num>},
     "actions": [{"deviceId": "<id>", "action": "<verb>", ...params}],
     "oneShot": <bool>,               // delayMinutes 사용 시 자동으로 true
     "enabled": <bool>                // default true
    },

    {"tool": "toggle_automation", "id": "<auto_id>", "enabled": <bool>},

    {"tool": "delete_automation", "id": "<auto_id>"}
  ]
}

규칙:
- deviceId, auto_id 는 반드시 카탈로그에 있는 값만 사용. 추측 금지.
- 사용자가 모호하게 말하면 actions 비우고 reply 에서 되묻기.
- 한 번에 너무 많은 action 금지 (8개 이하).
- 디바이스가 카탈로그에 없으면 "그 디바이스는 제어 가능 범위 밖이에요" 라고 알려주기.
"""


def _build_system_prompt(catalog: list[dict], automations: list[dict],
                         label_prefix: str | None) -> str:
    now_kst = datetime.datetime.now(KST).strftime("%Y-%m-%d %H:%M (%a)")
    scope_note = (
        f"⚠ 현재 dev 모드 — 라벨이 '{label_prefix}'로 시작하는 디바이스만 제어 가능."
        if label_prefix else ""
    )
    return f"""\
당신은 사용자의 IoT 디바이스를 자연어로 제어하는 비서입니다. 한국어로 답변.
현재 시각: {now_kst} (KST). 시간 관련 요청('1시간 뒤', '내일 7시' 등)은 이 기준으로 계산.

{scope_note}

[제어 가능 디바이스 카탈로그]
{json.dumps(catalog, ensure_ascii=False, indent=2)}

[현재 등록된 자동화]
{json.dumps(automations, ensure_ascii=False, indent=2)}

{_OUTPUT_SCHEMA_HINT}
"""


def _build_messages(system_prompt: str, history: list[ChatMessage], user_message: str) -> list[dict]:
    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    for m in history:
        if m.role in ("user", "assistant") and m.content:
            msgs.append({"role": m.role, "content": m.content})
    msgs.append({"role": "user", "content": user_message})
    return msgs


# ──────────────────────────────────────────────────────────────
# OpenRouter 호출
# ──────────────────────────────────────────────────────────────

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free"

# Free tier 는 upstream 이 자주 throttle 됨. OPENROUTER_MODEL 이 429 일 때
# 차례로 떨어지는 fallback 후보들. 사용자가 .env 에 OPENROUTER_FALLBACK_MODELS
# (콤마 구분) 로 오버라이드 가능. 한국어/JSON 안정성 순.
_BUILTIN_FALLBACKS = [
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "qwen/qwen3-coder:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
]


def _call_openrouter_one(messages: list[dict], model: str, api_key: str) -> tuple[dict | None, int, str]:
    """단일 모델 1회 호출. (message_dict, status_code, raw_text). 4xx/5xx 에선 message_dict=None."""
    try:
        resp = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                # OpenRouter 가 권장하는 식별 헤더 (없어도 되지만 free tier 추적에 도움).
                "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:5173"),
                "X-Title": "nook",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                # 일부 free 모델은 reasoning 으로 token 다 써버림. 충분히 줘서
                # JSON 본문이 잘림 없이 들어오게.
                "max_tokens": 1024,
                # JSON 만 받기 위해 mode 강제. 일부 모델은 무시함 — 그래도 시도.
                "response_format": {"type": "json_object"},
            },
            timeout=60,
        )
    except requests.RequestException as e:
        return None, -1, f"network: {e}"
    if resp.status_code >= 400:
        return None, resp.status_code, resp.text[:500]
    try:
        data = resp.json()
        return data["choices"][0]["message"], resp.status_code, ""
    except (KeyError, IndexError, TypeError, ValueError) as e:
        return None, resp.status_code, f"parse: {e} / {resp.text[:300]}"


def _call_openrouter(messages: list[dict], model: str, api_key: str) -> tuple[dict, str]:
    """주 모델 → fallback 모델들을 순차 시도. 마지막에 성공한 (message, model_used) 반환.
    모두 실패하면 RuntimeError. 429 는 다음 모델로 넘어감, 다른 4xx/5xx 는 즉시 중단."""
    fallback_env = (os.getenv("OPENROUTER_FALLBACK_MODELS") or "").strip()
    fallbacks = [m.strip() for m in fallback_env.split(",") if m.strip()] if fallback_env else _BUILTIN_FALLBACKS
    candidates: list[str] = []
    seen: set[str] = set()
    for m in [model, *fallbacks]:
        if m and m not in seen:
            candidates.append(m); seen.add(m)

    last_err = "no candidates"
    for i, m in enumerate(candidates):
        if i > 0:
            log.info("LLM fallback → %s (after %s)", m, last_err[:80])
        msg, status, err = _call_openrouter_one(messages, m, api_key)
        if msg is not None:
            return msg, m
        last_err = f"{m} HTTP {status}: {err}"
        # 429 (rate limit) 외의 에러는 폴백해도 같은 결과일 가능성 높음 → 중단.
        if status not in (429, 502, 503, 504, -1):
            break
        # 짧게 대기 — provider 측 throttle 풀릴 시간.
        time.sleep(0.6)
    raise RuntimeError(last_err)


# ──────────────────────────────────────────────────────────────
# JSON 추출 (모델이 코드펜스를 칠 때 대비)
# ──────────────────────────────────────────────────────────────

_JSON_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_FIRST_OBJ = re.compile(r"\{.*\}", re.DOTALL)


def _parse_plan_json(raw: str) -> tuple[dict | None, str | None]:
    """raw 안에서 JSON 오브젝트를 찾아 파싱. 실패 시 (None, error)."""
    if not raw:
        return None, "empty response"
    txt = raw.strip()
    # 1) 코드펜스 안
    m = _JSON_FENCE.search(txt)
    if m:
        candidate = m.group(1)
    else:
        # 2) 첫 { ... } greedy match
        m2 = _FIRST_OBJ.search(txt)
        candidate = m2.group(0) if m2 else txt
    try:
        return json.loads(candidate), None
    except json.JSONDecodeError as e:
        return None, f"JSON parse: {e}"


# ──────────────────────────────────────────────────────────────
# 엔드포인트
# ──────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, username: str = Depends(require_auth)):
    api_key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(503, "OPENROUTER_API_KEY 미설정")
    model = (os.getenv("OPENROUTER_MODEL") or DEFAULT_MODEL).strip()
    label_prefix = (os.getenv("LLM_DEVICE_LABEL_PREFIX") or "").strip() or None

    catalog = llm_tools.build_device_catalog(username, label_prefix)
    automations = llm_tools.build_automation_summary(username)
    allowed_device_ids = {d["id"] for d in catalog}

    if not catalog:
        return ChatResponse(
            reply=("제어 가능한 디바이스가 없어요. "
                   + (f"'{label_prefix}' prefix 디바이스를 추가해 주세요." if label_prefix
                      else "메인 화면에 디바이스를 먼저 추가해 주세요.")),
            executed=[],
            debug={"reason": "empty_catalog"},
        )

    system_prompt = _build_system_prompt(catalog, automations, label_prefix)
    messages = _build_messages(system_prompt, req.history, req.message)

    try:
        msg, model_used = _call_openrouter(messages, model, api_key)
    except RuntimeError as e:
        log.warning("LLM call failed (all fallbacks): %s", e)
        raise HTTPException(502, f"LLM 호출 실패: {e}")

    # reasoning 모델은 content 없이 reasoning 만 채우기도 함 — 그건 fallback 으로 못 잡으니
    # 응답 자체를 다시 파싱 가능한 형태로 끌어내려 노력. 일단 content 우선.
    raw_content = (msg or {}).get("content") or ""
    plan, parse_err = _parse_plan_json(raw_content)

    if not plan:
        log.warning("LLM JSON parse failed: %s / raw=%r", parse_err, raw_content[:200])
        return ChatResponse(
            reply="모델 응답을 이해하지 못했어요. 다시 말해 주세요.",
            executed=[],
            debug={"model": model_used, "parse_err": parse_err, "raw": raw_content[:500]},
        )

    reply_text = str(plan.get("reply") or "").strip()
    actions = plan.get("actions") or []
    if not isinstance(actions, list):
        actions = []

    executed = llm_tools.dispatch_plan(username, allowed_device_ids, actions)

    return ChatResponse(
        reply=reply_text or "(빈 응답)",
        executed=executed,
        debug={"model": model_used, "n_actions": len(actions)},
    )
