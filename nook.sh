#!/bin/bash
# nook 서비스 관리 스크립트
# 사용법: ./nook.sh [start|stop|restart|status|logs [backend|frontend]]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR"
LOG_DIR="$SCRIPT_DIR/logs"

BACKEND_PID="$LOG_DIR/backend.pid"
FRONTEND_PID="$LOG_DIR/frontend.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

mkdir -p "$LOG_DIR"

# ── 색상 출력 헬퍼 ──────────────────────────────────────────────
green()  { echo -e "\033[32m$*\033[0m"; }
red()    { echo -e "\033[31m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

# ── PID로 프로세스 살아있는지 확인 ─────────────────────────────
is_running() {
    local pid_file="$1"
    [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

# ── 백엔드 시작 ────────────────────────────────────────────────
start_backend() {
    if is_running "$BACKEND_PID"; then
        yellow "Backend already running (PID $(cat "$BACKEND_PID"))"
        return
    fi
    cd "$BACKEND_DIR"
    # nohup으로 백그라운드 실행, 로그 누적
    setsid .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload \
        >> "$BACKEND_LOG" 2>&1 < /dev/null &
    echo $! > "$BACKEND_PID"
    green "Backend started  (PID $!, port 8080)"
}

# ── 프론트엔드 시작 ────────────────────────────────────────────
start_frontend() {
    if is_running "$FRONTEND_PID"; then
        yellow "Frontend already running (PID $(cat "$FRONTEND_PID"))"
        return
    fi
    cd "$FRONTEND_DIR"
    # Vite dev 서버를 모든 인터페이스에서 수신
    setsid npm run dev -- --host 0.0.0.0 \
        >> "$FRONTEND_LOG" 2>&1 < /dev/null &
    echo $! > "$FRONTEND_PID"
    green "Frontend started (PID $!, port 5173)"
}

# ── 백엔드 종료 ────────────────────────────────────────────────
stop_backend() {
    if ! is_running "$BACKEND_PID"; then
        yellow "Backend not running"
        rm -f "$BACKEND_PID"
        return
    fi
    # uvicorn --reload 사용 시 자식 프로세스 그룹 전체 종료
    local pid
    pid=$(cat "$BACKEND_PID")
    kill -- -"$(ps -o pgid= -p "$pid" | tr -d ' ')" 2>/dev/null || kill "$pid"
    rm -f "$BACKEND_PID"
    green "Backend stopped"
}

# ── 프론트엔드 종료 ────────────────────────────────────────────
stop_frontend() {
    if ! is_running "$FRONTEND_PID"; then
        yellow "Frontend not running"
        rm -f "$FRONTEND_PID"
        return
    fi
    local pid
    pid=$(cat "$FRONTEND_PID")
    kill -- -"$(ps -o pgid= -p "$pid" | tr -d ' ')" 2>/dev/null || kill "$pid"
    rm -f "$FRONTEND_PID"
    green "Frontend stopped"
}

# ── 상태 확인 ──────────────────────────────────────────────────
cmd_status() {
    echo "──────────────────────────────"
    if is_running "$BACKEND_PID"; then
        green "● Backend   RUNNING (PID $(cat "$BACKEND_PID"), port 8080)"
    else
        red   "○ Backend   STOPPED"
    fi

    if is_running "$FRONTEND_PID"; then
        green "● Frontend  RUNNING (PID $(cat "$FRONTEND_PID"), port 5173)"
    else
        red   "○ Frontend  STOPPED"
    fi
    echo "──────────────────────────────"
}

# ── 로그 tail ──────────────────────────────────────────────────
cmd_logs() {
    local target="${2:-both}"
    case "$target" in
        backend)  tail -f "$BACKEND_LOG" ;;
        frontend) tail -f "$FRONTEND_LOG" ;;
        # 기본: 두 로그 동시 출력 (Ctrl+C로 종료)
        *)        tail -f "$BACKEND_LOG" "$FRONTEND_LOG" ;;
    esac
}

# ── 메인 ───────────────────────────────────────────────────────
case "${1:-}" in
    start)
        start_backend
        start_frontend
        ;;
    stop)
        stop_frontend
        stop_backend
        ;;
    restart)
        stop_frontend
        stop_backend
        sleep 1
        start_backend
        start_frontend
        ;;
    status)
        cmd_status
        ;;
    logs)
        cmd_logs "$@"
        ;;
    *)
        echo "사용법: $0 {start|stop|restart|status|logs [backend|frontend]}"
        exit 1
        ;;
esac
