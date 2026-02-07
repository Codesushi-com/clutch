#!/usr/bin/env bash
# Trap production server + work loop (separate processes)
#
# Usage:
#   ./run.sh start     - build + start server + work loop
#   ./run.sh stop      - stop everything
#   ./run.sh restart   - stop + start
#   ./run.sh watch     - start + auto-rebuild on main changes
#   ./run.sh status    - show what's running
#   ./run.sh logs      - tail server log
#   ./run.sh loop-logs - tail work loop log
#   ./run.sh loop-restart - restart just the work loop

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3002}"
SERVER_LOG="/tmp/trap-prod.log"
LOOP_LOG="/tmp/trap-loop.log"
SERVER_PID="/tmp/trap-server.pid"
LOOP_PID="/tmp/trap-loop.pid"

build() {
  echo "[trap] Building..."
  pnpm build 2>&1 | tail -5
  echo "[trap] Build complete"
}

start_server() {
  stop_server 2>/dev/null || true
  echo "[trap] Starting production server on port $PORT"
  NODE_ENV=production nohup volta run node ./node_modules/next/dist/bin/next start -p "$PORT" > "$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PID"
  echo "[trap] Server PID $(cat "$SERVER_PID"), log: $SERVER_LOG"
}

stop_server() {
  if [[ -f "$SERVER_PID" ]]; then
    local pid
    pid=$(cat "$SERVER_PID")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      echo "[trap] Stopped server PID $pid"
    fi
    rm -f "$SERVER_PID"
  fi
  fuser -k "$PORT/tcp" 2>/dev/null || true
}

start_loop() {
  stop_loop 2>/dev/null || true
  # Check if enabled
  if grep -q "WORK_LOOP_ENABLED=true" .env.local 2>/dev/null; then
    echo "[trap] Starting work loop (separate process)"
    nohup volta run npx tsx worker/loop.ts > "$LOOP_LOG" 2>&1 &
    echo $! > "$LOOP_PID"
    echo "[trap] Loop PID $(cat "$LOOP_PID"), log: $LOOP_LOG"
  else
    echo "[trap] Work loop disabled (WORK_LOOP_ENABLED != true)"
  fi
}

stop_loop() {
  if [[ -f "$LOOP_PID" ]]; then
    local pid
    pid=$(cat "$LOOP_PID")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      echo "[trap] Stopped loop PID $pid"
    fi
    rm -f "$LOOP_PID"
  fi
}

status() {
  echo "=== Trap Status ==="
  if [[ -f "$SERVER_PID" ]] && kill -0 "$(cat "$SERVER_PID")" 2>/dev/null; then
    echo "Server: RUNNING (PID $(cat "$SERVER_PID"), port $PORT)"
  else
    echo "Server: STOPPED"
  fi
  if [[ -f "$LOOP_PID" ]] && kill -0 "$(cat "$LOOP_PID")" 2>/dev/null; then
    echo "Loop:   RUNNING (PID $(cat "$LOOP_PID"))"
  else
    echo "Loop:   STOPPED"
  fi
  echo ""
  grep "WORK_LOOP" .env.local 2>/dev/null || echo "(no work loop config)"
}

watch_and_rebuild() {
  build
  start_server
  start_loop

  echo "[trap] Watching for git changes on main..."
  local last_hash
  last_hash=$(git rev-parse HEAD)

  while true; do
    sleep 15
    git fetch origin main --quiet 2>/dev/null || continue
    local remote_hash
    remote_hash=$(git rev-parse origin/main 2>/dev/null || echo "$last_hash")

    if [[ "$remote_hash" != "$last_hash" ]]; then
      echo "[trap] main updated: ${last_hash:0:7} → ${remote_hash:0:7}"
      if git pull --ff-only --quiet 2>/dev/null; then
        last_hash="$remote_hash"
        echo "[trap] Rebuilding..."
        if build; then
          stop_server
          start_server
          stop_loop
          start_loop
          echo "[trap] Restarted at $(date '+%H:%M:%S')"
        else
          echo "[trap] BUILD FAILED — server still running old version"
        fi
      else
        echo "[trap] Pull failed (dirty state?), skipping"
      fi
    fi
  done
}

case "${1:-status}" in
  start)
    build
    start_server
    start_loop
    ;;
  stop)
    stop_loop
    stop_server
    ;;
  restart)
    stop_loop
    stop_server
    sleep 1
    build
    start_server
    start_loop
    ;;
  watch)
    trap 'stop_loop; stop_server; exit 0' INT TERM
    watch_and_rebuild
    ;;
  status)
    status
    ;;
  logs|log)
    tail -f "$SERVER_LOG"
    ;;
  loop-logs|loop-log)
    tail -f "$LOOP_LOG"
    ;;
  loop-restart)
    stop_loop
    start_loop
    ;;
  loop-stop)
    stop_loop
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|watch|status|logs|loop-logs|loop-restart|loop-stop}"
    exit 1
    ;;
esac
