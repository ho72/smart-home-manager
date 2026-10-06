# 실행과 환경 설정

[프로젝트 소개](../README.md) · [환경변수 예시](../.env.example)

## 준비와 설치

Node.js 22, npm, Python 3.12와 실행 중인 [공통 인증 서버](https://github.com/ho72/unified-auth-server)를 준비합니다. 아래 명령은 macOS/Linux 기준입니다.

```bash
git clone https://github.com/ho72/smart-home-manager.git
cd smart-home-manager
npm ci
cp .env.example .env
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
```

## 기본 설정

| 환경변수 | 역할 |
| --- | --- |
| `VITE_API_URL` | 로컬 Vite 프록시를 사용하면 빈 값 유지 |
| `VITE_UNIPASS_URL` | 브라우저에서 접근할 공통 인증 서버 주소 |
| `VITE_BACKEND_PROXY_TARGET` | Vite가 API를 전달할 백엔드 주소. 기본 `http://localhost:8080` |
| `UNIPASS_BASE_URL` | 백엔드가 프로필 확인·토큰 갱신에 사용할 인증 서버 주소 |
| `NOOK_CORS_ORIGINS` | 웹의 Origin. 기본 `http://localhost:5173` |
| `FRONTEND_BASE_URL` | 기기 플랫폼 인증 이후 돌아올 웹 주소 |
| `NOOK_ADMIN_USER_IDS` | 관리자에 해당하는 공통 계정 ID. 쉼표로 여러 ID 구분 |

관리자는 ID 외에 `NOOK_ADMIN_HANDLES`, `NOOK_ADMIN_EMAILS`로도 지정할 수 있습니다. 현재 코드에서는 역할 저장소에 관리자가 없으면 최초로 인증한 사용자를 관리자로 등록합니다. 새 환경에서 원하는 관리자 ID를 먼저 설정해 역할을 초기화합니다.

공통 인증 서버의 `NOOK_ORIGIN`은 웹 Origin과 일치시킵니다.

## 실행

터미널 1에서 백엔드를 실행합니다.

```bash
cd backend
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8080
```

터미널 2에서는 저장소 루트에서 웹을 실행합니다.

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

- 웹: `http://localhost:5173`
- 상태 확인: `http://localhost:8080/health`
- API 문서: `http://localhost:8080/docs`

백엔드는 루트 `.env`를 `python-dotenv`로 읽고, Vite는 루트의 `VITE_` 설정을 사용합니다. 프론트엔드 코드는 공통 인증 서버에서 받은 토큰을 처리하며, 백엔드는 `/auth/me`로 해당 계정을 확인합니다. 자체 이메일·비밀번호 로그인 API는 비활성화되어 있습니다.

## 선택적 연동

| 기능 | 준비할 설정 |
| --- | --- |
| SmartThings | `SMARTTHINGS_CLIENT_ID`, `SMARTTHINGS_CLIENT_SECRET`, `SMARTTHINGS_REDIRECT_URI` 및 자신의 기기 |
| Xiaomi/miio | 앱의 연결 절차 또는 `MIIO_FAN_IP`, `MIIO_FAN_TOKEN`과 해당 기기 |
| 날씨 | `KMA_API_KEY`, 위치·예보 지역 설정 |
| LLM 제어 | `OPENROUTER_API_KEY`, 모델 설정. `LLM_DEVICE_LABEL_PREFIX`로 도구에 노출할 기기 라벨 범위 지정 가능 |
| Web Push | 브라우저 구독, localhost 또는 HTTPS, 서버가 실행 중 생성하는 VAPID 설정 |
| 체중계 수집 | 수집 장치와 서버 주소. 라우트는 `/ingest/scale`, `/ingest/scale/live` |

`SCALE_SERVER_URL`·`SCALE_LIVE_SERVER_URL`은 각각 `/ingest/scale`, `/ingest/scale/live`로 보내는 HTTP POST 주소입니다. 수집 장치는 등록 시 받은 장치 토큰을 `X-Device-Token` 헤더에 넣습니다. 저장소에는 장치 펌웨어나 실제 측정 데이터가 포함되어 있지 않습니다.

기기 상태와 계정·토큰·VAPID 파일, SQLite 데이터는 실행 시 생성하는 비공개 상태입니다. 이 파일을 공개 저장소에 추가하지 않습니다.

## 빌드와 관리 스크립트

```bash
npm run build
```

백엔드는 `dist/`가 있으면 정적 웹을 제공합니다. 별도로 [nook.sh](../nook.sh)가 있지만, `setsid`와 PID 기반 종료를 사용하는 Linux용 개발 관리 스크립트입니다. macOS의 기본 실행 안내는 위의 두 터미널 방식입니다.

실제 기기 연결과 제어·푸시 전송까지 확인하려면 해당 플랫폼 계정과 장비가 필요합니다.
