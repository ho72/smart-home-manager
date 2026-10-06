"""
Xiaomi Cloud token + device list extractor, refactored from
Piotr-Machowski/Xiaomi-cloud-tokens-extractor into a stateful, multi-step
backend session.

The interactive CLI flow (login → captcha prompt → email 2FA prompt → fetch
devices) is split here into discrete entry points that can be driven by HTTP
requests, with the requests.Session and intermediate auth state held in memory
between steps.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import random
import re
import threading
import time
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests


# RC4 implementation, with the same fallback chain as the upstream extractor and
# a final fallback to `cryptography` so we don't force a pycryptodome install.
try:
    from Crypto.Cipher import ARC4 as _ARC4  # pycryptodome
    def _rc4_engine(key: bytes):
        return _ARC4.new(key)
except ModuleNotFoundError:
    try:
        from Cryptodome.Cipher import ARC4 as _ARC4  # pycryptodomex
        def _rc4_engine(key: bytes):
            return _ARC4.new(key)
    except ModuleNotFoundError:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms

        class _CryptographyRC4:
            def __init__(self, key: bytes):
                self._enc = Cipher(algorithms.ARC4(key), mode=None).encryptor()

            def encrypt(self, data: bytes) -> bytes:
                return self._enc.update(data)

        def _rc4_engine(key: bytes):
            return _CryptographyRC4(key)


SERVERS = ["cn", "de", "us", "ru", "tw", "sg", "in", "i2"]


class XiaomiCloudSession:
    """Stateful Xiaomi cloud login + device-fetch session.

    Lifecycle:
      start(username, password) →
        STATE_NEED_CAPTCHA  → submit_captcha(code) →
        STATE_NEED_2FA      → submit_2fa(code)     →
        STATE_READY         → fetch_devices() returns the catalog
        STATE_FAILED        → error attribute set
    """

    STATE_INIT = "init"
    STATE_NEED_CAPTCHA = "need_captcha"
    STATE_NEED_2FA = "need_2fa"
    STATE_READY = "ready"
    STATE_FAILED = "failed"

    def __init__(self) -> None:
        self._agent = self._gen_agent()
        self._device_id = self._gen_device_id()
        self._session = requests.session()
        self._session.cookies.set("sdkVersion", "accountsdk-18.8.15", domain="mi.com")
        self._session.cookies.set("sdkVersion", "accountsdk-18.8.15", domain="xiaomi.com")
        self._session.cookies.set("deviceId", self._device_id, domain="mi.com")
        self._session.cookies.set("deviceId", self._device_id, domain="xiaomi.com")

        self._username: str | None = None
        self._password: str | None = None
        self._sign: str | None = None
        self._ssecurity: str | None = None
        self._userId: str | None = None
        self._serviceToken: str | None = None
        self._location: str | None = None

        self._auth2_fields: dict | None = None
        self._captcha_image_b64: str | None = None
        self._notification_url: str | None = None
        self._twofa_context: str | None = None

        self.state = self.STATE_INIT
        self.error: str | None = None
        self.created_at = time.time()

    # ---- public API ----------------------------------------------------

    def start(self, username: str, password: str) -> dict:
        self._username = username
        self._password = password
        if not self._login_step_1():
            return self._fail("아이디 확인에 실패했습니다.")
        return self._login_step_2_initial()

    def submit_captcha(self, code: str) -> dict:
        if self.state != self.STATE_NEED_CAPTCHA:
            return self._fail("캡챠 단계가 아닙니다.")
        if not self._auth2_fields:
            return self._fail("세션 상태가 누락되었습니다.")
        fields = dict(self._auth2_fields)
        fields["captCode"] = (code or "").strip()
        return self._login_step_2_post(fields)

    def submit_2fa(self, code: str) -> dict:
        if self.state != self.STATE_NEED_2FA:
            return self._fail("2단계 인증 단계가 아닙니다.")
        return self._do_2fa_verify((code or "").strip())

    def fetch_devices(self) -> list[dict]:
        if self.state != self.STATE_READY:
            raise RuntimeError("로그인이 완료되지 않았습니다.")

        results: list[dict] = []
        for server in SERVERS:
            try:
                homes_resp = self._get_homes(server) or {}
                home_list = (homes_resp.get("result") or {}).get("homelist") or []
                all_homes = [{"home_id": h["id"], "home_owner": self._userId} for h in home_list]

                cnt = self._get_dev_cnt(server) or {}
                share_family = ((cnt.get("result") or {}).get("share") or {}).get("share_family") or []
                for h in share_family:
                    all_homes.append({"home_id": h["home_id"], "home_owner": h["home_owner"]})

                for home in all_homes:
                    devs = self._get_devices(server, home["home_id"], home["home_owner"]) or {}
                    info_list = (devs.get("result") or {}).get("device_info") or []
                    for d in info_list:
                        results.append({
                            "did": d.get("did"),
                            "name": d.get("name"),
                            "model": d.get("model"),
                            "ip": d.get("localip"),
                            "token": d.get("token"),
                            "mac": d.get("mac"),
                            "server": server,
                            "home_id": home["home_id"],
                        })
            except Exception:
                # Any single-server failure is non-fatal — keep scanning the rest.
                continue

        # De-duplicate by `did`, preferring entries that have IP+token (LAN-reachable).
        best: dict[str, dict] = {}
        for d in results:
            did = d.get("did")
            if not did:
                continue
            score = (1 if d.get("ip") else 0) + (1 if d.get("token") else 0)
            existing = best.get(did)
            if existing is None:
                best[did] = d
                continue
            existing_score = (1 if existing.get("ip") else 0) + (1 if existing.get("token") else 0)
            if score > existing_score:
                best[did] = d
        return list(best.values())

    def snapshot(self) -> dict:
        out: dict[str, Any] = {"state": self.state}
        if self.error:
            out["error"] = self.error
        if self.state == self.STATE_NEED_CAPTCHA and self._captcha_image_b64:
            out["captchaImage"] = self._captcha_image_b64
        return out

    # ---- login phases --------------------------------------------------

    def _fail(self, msg: str) -> dict:
        self.state = self.STATE_FAILED
        self.error = msg
        return self.snapshot()

    def _login_step_1(self) -> bool:
        url = "https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true"
        headers = {"User-Agent": self._agent, "Content-Type": "application/x-www-form-urlencoded"}
        cookies = {"userId": self._username}
        r = self._session.get(url, headers=headers, cookies=cookies)
        if r.status_code != 200:
            return False
        try:
            jr = self._to_json(r.text)
        except Exception:
            return False
        if "_sign" in jr:
            self._sign = jr["_sign"]
            return True
        if "ssecurity" in jr:
            self._ssecurity = jr["ssecurity"]
            self._userId = jr.get("userId")
            self._location = jr.get("location")
            return True
        return False

    def _login_step_2_initial(self) -> dict:
        fields = {
            "sid": "xiaomiio",
            "hash": hashlib.md5(self._password.encode()).hexdigest().upper(),
            "callback": "https://sts.api.io.mi.com/sts",
            "qs": "%3Fsid%3Dxiaomiio%26_json%3Dtrue",
            "user": self._username,
            "_sign": self._sign,
            "_json": "true",
        }
        return self._login_step_2_post(fields)

    def _login_step_2_post(self, fields: dict) -> dict:
        url = "https://account.xiaomi.com/pass/serviceLoginAuth2"
        headers = {"User-Agent": self._agent, "Content-Type": "application/x-www-form-urlencoded"}
        r = self._session.post(url, headers=headers, params=fields, allow_redirects=False)
        if r.status_code != 200:
            return self._fail(f"로그인 요청 실패 (HTTP {r.status_code}).")
        try:
            jr = self._to_json(r.text)
        except Exception:
            return self._fail("로그인 응답 파싱 실패.")

        # captchaUrl 체크가 먼저. Xiaomi 는 초기 로그인 시
        # `{code: 87001, captchaUrl: ...}` 처럼 두 필드를 같이 내려보낼 수 있어서
        # code 만 보고 fail 처리하면 캡챠 화면을 띄우지 못한다.
        # 잘못된 캡챠 재제출 시에도 새 captchaUrl 이 같이 오면 다시 보여주는 게 맞음.
        if jr.get("captchaUrl"):
            self._auth2_fields = fields
            img = self._download_captcha(jr["captchaUrl"])
            if not img:
                return self._fail("캡챠 이미지를 불러올 수 없습니다.")
            self._captcha_image_b64 = base64.b64encode(img).decode()
            self.state = self.STATE_NEED_CAPTCHA
            return self.snapshot()

        # captchaUrl 이 없는데 87001 이면 진짜 캡챠 실패.
        if jr.get("code") == 87001:
            return self._fail("캡챠가 일치하지 않습니다. 처음부터 다시 시도하세요.")

        if "ssecurity" in jr and len(str(jr["ssecurity"])) > 4:
            self._ssecurity = jr["ssecurity"]
            self._userId = jr.get("userId") or self._userId
            self._location = jr.get("location")
            return self._finalize_after_login()

        if "notificationUrl" in jr:
            self._notification_url = jr["notificationUrl"]
            return self._begin_2fa()

        return self._fail("로그인 실패: 알 수 없는 응답입니다.")

    def _download_captcha(self, captcha_url: str) -> bytes | None:
        if captcha_url.startswith("/"):
            captcha_url = "https://account.xiaomi.com" + captcha_url
        r = self._session.get(captcha_url)
        return r.content if r.status_code == 200 else None

    def _finalize_after_login(self) -> dict:
        if self._location and not self._serviceToken:
            r = self._session.get(self._location, headers={"User-Agent": self._agent})
            if r.status_code != 200:
                return self._fail(f"서비스 토큰 발급 실패 (HTTP {r.status_code}).")
            self._serviceToken = r.cookies.get("serviceToken")
        if not self._serviceToken:
            return self._fail("서비스 토큰을 찾을 수 없습니다.")
        self.state = self.STATE_READY
        return self.snapshot()

    def _begin_2fa(self) -> dict:
        notif = self._notification_url
        if not notif:
            return self._fail("2FA 알림 URL 누락.")
        headers = {"User-Agent": self._agent, "Content-Type": "application/x-www-form-urlencoded"}
        # authStart
        self._session.get(notif, headers=headers)
        try:
            ctx = parse_qs(urlparse(notif).query)["context"][0]
        except (KeyError, IndexError):
            return self._fail("2FA 컨텍스트를 추출할 수 없습니다.")
        # identity/list
        self._session.get(
            "https://account.xiaomi.com/identity/list",
            params={"sid": "xiaomiio", "context": ctx, "_locale": "en_US"},
            headers=headers,
        )
        # sendEmailTicket
        self._session.post(
            "https://account.xiaomi.com/identity/auth/sendEmailTicket",
            params={
                "_dc": str(int(time.time() * 1000)),
                "sid": "xiaomiio", "context": ctx, "mask": "0", "_locale": "en_US",
            },
            data={
                "retry": "0", "icode": "", "_json": "true",
                "ick": self._session.cookies.get("ick", ""),
            },
            headers=headers,
        )
        self._twofa_context = ctx
        self.state = self.STATE_NEED_2FA
        return self.snapshot()

    def _do_2fa_verify(self, code: str) -> dict:
        ctx = self._twofa_context
        if not ctx:
            return self._fail("2단계 인증 컨텍스트 없음.")
        headers = {"User-Agent": self._agent, "Content-Type": "application/x-www-form-urlencoded"}
        r = self._session.post(
            "https://account.xiaomi.com/identity/auth/verifyEmail",
            params={
                "_flag": "8", "_json": "true", "sid": "xiaomiio",
                "context": ctx, "mask": "0", "_locale": "en_US",
            },
            data={
                "_flag": "8", "ticket": code, "trust": "false", "_json": "true",
                "ick": self._session.cookies.get("ick", ""),
            },
            headers=headers,
        )
        if r.status_code != 200:
            return self._fail(f"인증 코드 검증 실패 (HTTP {r.status_code}).")

        finish_loc: str | None = None
        try:
            jr = r.json()
            finish_loc = jr.get("location")
        except Exception:
            finish_loc = r.headers.get("Location")
            if not finish_loc and r.text:
                m = re.search(r'https://account\.xiaomi\.com/identity/result/check\?[^"\']+', r.text)
                if m:
                    finish_loc = m.group(0)
        if not finish_loc:
            r0 = self._session.get(
                "https://account.xiaomi.com/identity/result/check",
                params={"sid": "xiaomiio", "context": ctx, "_locale": "en_US"},
                headers=headers, allow_redirects=False,
            )
            if r0.status_code in (301, 302) and r0.headers.get("Location"):
                finish_loc = r0.url if "serviceLoginAuth2/end" in r0.url else r0.headers["Location"]
        if not finish_loc:
            return self._fail("인증 후 결과 위치를 찾을 수 없습니다.")

        if "identity/result/check" in finish_loc:
            r = self._session.get(finish_loc, headers=headers, allow_redirects=False)
            end_url = r.headers.get("Location")
        else:
            end_url = finish_loc
        if not end_url:
            return self._fail("Auth2/end URL이 누락되었습니다.")

        r = self._session.get(end_url, headers=headers, allow_redirects=False)
        # Some servers serve a 200 'Tips' page first then 302 on the next call.
        if r.status_code == 200 and "Xiaomi Account - Tips" in r.text:
            r = self._session.get(end_url, headers=headers, allow_redirects=False)

        ext_pragma = r.headers.get("extension-pragma")
        if ext_pragma:
            try:
                ep = json.loads(ext_pragma)
                if ep.get("ssecurity"):
                    self._ssecurity = ep["ssecurity"]
            except Exception:
                pass
        if not self._ssecurity:
            return self._fail("ssecurity 헤더 누락 — 인증 실패.")

        sts_url = r.headers.get("Location")
        if not sts_url and r.text:
            idx = r.text.find("https://sts.api.io.mi.com/sts")
            if idx != -1:
                end = r.text.find('"', idx)
                if end == -1:
                    end = idx + 300
                sts_url = r.text[idx:end]
        if not sts_url:
            return self._fail("STS 리디렉션 누락.")

        r = self._session.get(sts_url, headers=headers, allow_redirects=True)
        if r.status_code != 200:
            return self._fail(f"STS 호출 실패 (HTTP {r.status_code}).")

        self._serviceToken = self._session.cookies.get("serviceToken", domain=".sts.api.io.mi.com")
        if not self._serviceToken:
            return self._fail("serviceToken 추출 실패.")
        for d in (".api.io.mi.com", ".io.mi.com", ".mi.com"):
            self._session.cookies.set("serviceToken", self._serviceToken, domain=d)
            self._session.cookies.set("yetAnotherServiceToken", self._serviceToken, domain=d)
        self._userId = (
            self._userId
            or self._session.cookies.get("userId", domain=".xiaomi.com")
            or self._session.cookies.get("userId", domain=".sts.api.io.mi.com")
        )
        self.state = self.STATE_READY
        return self.snapshot()

    # ---- API calls (encrypted) ----------------------------------------

    def _get_homes(self, country: str) -> dict | None:
        url = self._api_url(country) + "/v2/homeroom/gethome"
        return self._execute_api(
            url,
            {"data": '{"fg": true, "fetch_share": true, "fetch_share_dev": true, "limit": 300, "app_ver": 7}'},
        )

    def _get_dev_cnt(self, country: str) -> dict | None:
        url = self._api_url(country) + "/v2/user/get_device_cnt"
        return self._execute_api(url, {"data": '{ "fetch_own": true, "fetch_share": true}'})

    def _get_devices(self, country: str, home_id: Any, owner_id: Any) -> dict | None:
        url = self._api_url(country) + "/v2/home/home_device_list"
        payload = (
            '{"home_owner": ' + str(owner_id)
            + ',"home_id": ' + str(home_id)
            + ',"limit": 200, "get_split_device": true, "support_smart_home": true}'
        )
        return self._execute_api(url, {"data": payload})

    def _execute_api(self, url: str, params: dict) -> dict | None:
        headers = {
            "Accept-Encoding": "identity",
            "User-Agent": self._agent,
            "Content-Type": "application/x-www-form-urlencoded",
            "x-xiaomi-protocal-flag-cli": "PROTOCAL-HTTP2",
            "MIOT-ENCRYPT-ALGORITHM": "ENCRYPT-RC4",
        }
        cookies = {
            "userId": str(self._userId),
            "yetAnotherServiceToken": str(self._serviceToken),
            "serviceToken": str(self._serviceToken),
            "locale": "en_GB",
            "timezone": "GMT+02:00",
            "is_daylight": "1",
            "dst_offset": "3600000",
            "channel": "MI_APP_STORE",
        }
        millis = round(time.time() * 1000)
        nonce = self._gen_nonce(millis)
        signed = self._signed_nonce(nonce)
        params = dict(params)
        params["rc4_hash__"] = self._enc_signature(url, "POST", signed, params)
        for k, v in params.items():
            params[k] = self._encrypt_rc4(signed, v)
        params.update({
            "signature": self._enc_signature(url, "POST", signed, params),
            "ssecurity": self._ssecurity,
            "_nonce": nonce,
        })
        r = self._session.post(url, headers=headers, cookies=cookies, params=params)
        if r.status_code == 200:
            return json.loads(self._decrypt_rc4(self._signed_nonce(params["_nonce"]), r.text))
        return None

    # ---- crypto helpers -----------------------------------------------

    @staticmethod
    def _api_url(country: str) -> str:
        prefix = "" if country == "cn" else (country + ".")
        return f"https://{prefix}api.io.mi.com/app"

    def _signed_nonce(self, nonce: str) -> str:
        h = hashlib.sha256(base64.b64decode(self._ssecurity) + base64.b64decode(nonce))
        return base64.b64encode(h.digest()).decode("utf-8")

    @staticmethod
    def _gen_nonce(millis: int) -> str:
        b = os.urandom(8) + (int(millis / 60000)).to_bytes(4, byteorder="big")
        return base64.b64encode(b).decode()

    @staticmethod
    def _enc_signature(url: str, method: str, signed_nonce: str, params: dict) -> str:
        sp = [str(method).upper(), url.split("com")[1].replace("/app/", "/")]
        for k, v in params.items():
            sp.append(f"{k}={v}")
        sp.append(signed_nonce)
        return base64.b64encode(hashlib.sha1("&".join(sp).encode("utf-8")).digest()).decode()

    @staticmethod
    def _encrypt_rc4(password_b64: str, payload: str) -> str:
        engine = _rc4_engine(base64.b64decode(password_b64))
        engine.encrypt(bytes(1024))
        return base64.b64encode(engine.encrypt(payload.encode())).decode()

    @staticmethod
    def _decrypt_rc4(password_b64: str, payload: str) -> bytes:
        engine = _rc4_engine(base64.b64decode(password_b64))
        engine.encrypt(bytes(1024))
        return engine.encrypt(base64.b64decode(payload))

    @staticmethod
    def _to_json(text: str) -> dict:
        return json.loads(text.replace("&&&START&&&", ""))

    @staticmethod
    def _gen_agent() -> str:
        agent_id = "".join(chr(random.randint(65, 69)) for _ in range(13))
        text = "".join(chr(random.randint(97, 122)) for _ in range(18))
        return f"{text}-{agent_id} APP/com.xiaomi.mihome APPV/10.5.201"

    @staticmethod
    def _gen_device_id() -> str:
        return "".join(chr(random.randint(97, 122)) for _ in range(6))


# ---- per-user session manager -----------------------------------------

_lock = threading.Lock()
_sessions: dict[str, XiaomiCloudSession] = {}


def get_session(username: str) -> XiaomiCloudSession | None:
    with _lock:
        return _sessions.get(username)


def create_session(username: str) -> XiaomiCloudSession:
    with _lock:
        s = XiaomiCloudSession()
        _sessions[username] = s
        return s


def clear_session(username: str) -> None:
    with _lock:
        _sessions.pop(username, None)


# ---- catalog mapping --------------------------------------------------

_FAN_MODEL_HINTS = ("fan",)
_LIGHT_MODEL_HINTS = ("light", "bulb", "lamp", "lighting", "ceil", "yeelink")
_AC_MODEL_HINTS = ("aircondition", "airconditioner", "ac")
_HUMID_MODEL_HINTS = ("humid",)
_SENSOR_MODEL_HINTS = ("sensor", "motion", "contact")
# 공기청정기는 모델 prefix 가 'airpurifier' 또는 'airp' (zhimi 시리즈). 'air' 만
# 으로는 aircondition 과 충돌하므로 prefix-aware 매칭.
_AIRP_MODEL_HINTS = ("airpurifier", "airp.")


def _classify(model: str) -> tuple[str, str | None, str, bool]:
    """Map a Xiaomi model string → (iconKey, screen, type, supported).
    `type` is the backend dispatch key (devices_router 가 type=='airpurifier'
    같은 식으로 분기). 보통 iconKey 와 같지만 공기청정기처럼 iconKey('wind')
    와 분기 키('airpurifier') 가 다른 경우가 있어서 별도로 둠."""
    m = (model or "").lower()
    if any(h in m for h in _AIRP_MODEL_HINTS):
        # 매핑이 등록된 모델만 supported. 다른 모델(mb4/mb5/va2/vb4/rma1/za1...)
        # 은 detail 화면 진입은 막고 catalog 만 노출.
        from devices.airpurifier import is_supported_model
        return "wind", "airpurifier", "airpurifier", is_supported_model(model)
    if any(h in m for h in _FAN_MODEL_HINTS):
        return "fan", "fan", "fan", True
    if any(h in m for h in _LIGHT_MODEL_HINTS):
        return "bulb", None, "bulb", False
    if any(h in m for h in _AC_MODEL_HINTS):
        return "ac", None, "ac", False
    if any(h in m for h in _HUMID_MODEL_HINTS):
        return "humid", None, "humid", False
    if any(h in m for h in _SENSOR_MODEL_HINTS):
        return "sensor", None, "sensor", False
    return "bolt", None, "bolt", False


def map_to_catalog_entry(d: dict) -> dict:
    """Translate a raw cloud device dict to the catalog shape the frontend
    consumes. `supported` flags whether this app has a control surface for
    the device today (right now: fans only)."""
    model = d.get("model") or ""
    name = d.get("name") or d.get("did") or "Xiaomi 기기"
    icon_key, screen, type_, supported = _classify(model)
    sub_parts: list[str] = []
    if model:
        sub_parts.append(model)
    if d.get("ip"):
        sub_parts.append(d["ip"])
    return {
        "did": d.get("did"),
        "name": name,
        "label": name,
        "model": model,
        "ip": d.get("ip") or "",
        "token": d.get("token") or "",
        "mac": d.get("mac") or "",
        "server": d.get("server") or "",
        "iconKey": icon_key,
        "screen": screen,
        "type": type_,
        "supported": supported and bool(d.get("ip")) and bool(d.get("token")),
        "sub": " · ".join(sub_parts) if sub_parts else "Xiaomi",
    }
