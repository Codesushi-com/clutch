#!/usr/bin/env bash
# OpenClutch production server + work loop (systemd-managed)
#
# Usage:
#   ./run.sh start      - build + enable/start all services
#   ./run.sh stop       - stop all services
#   ./run.sh restart    - stop + start
#   ./run.sh watch      - start + auto-rebuild on main changes (uses PID files)
#   ./run.sh status     - show systemd service status
#   ./run.sh logs       - tail server logs (journald)
#   ./run.sh loop-logs  - tail work loop logs (journald)
#   ./run.sh bridge-logs- tail chat bridge logs (journald)
#   ./run.sh watcher-logs - tail session watcher logs (journald)

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3002}"

# Systemd service names
SERVER_SERVICE="clutch-server"
LOOP_SERVICE="clutch-loop"
BRIDGE_SERVICE="clutch-bridge"
WATCHER_SERVICE="clutch-session-watcher"

build() {
  echo "[clutch] Building..."
  pnpm build 2>&1 | tail -5
  echo "[clutch] Build complete"
}

install_services() {
  # Generate service files from templates with dynamic paths
  local WORKING_DIR NODE_BIN ENV_FILE
  WORKING_DIR="$(pwd)"
  NODE_BIN="$(which node)"
  ENV_FILE="$WORKING_DIR/.env.local"

  echo "[clutch] Generating systemd service files..."
  echo "[clutch]   Working directory: $WORKING_DIR"
  echo "[clutch]   Node binary: $NODE_BIN"
  echo "[clutch]   Env file: $ENV_FILE"

  mkdir -p ~/.config/systemd/user/
  for service in "$SERVER_SERVICE" "$LOOP_SERVICE" "$BRIDGE_SERVICE" "$WATCHER_SERVICE"; do
    local template="systemd/${service}.service.template"
    local output="systemd/${service}.service"

    if [[ ! -f "$template" ]]; then
      echo "[clutch] Error: $template not found"
      exit 1
    fi

    # Generate service file from template
    sed -e "s|{{WORKING_DIR}}|$WORKING_DIR|g" \
        -e "s|{{NODE_BIN}}|$NODE_BIN|g" \
        -e "s|{{ENV_FILE}}|$ENV_FILE|g" \
        "$template" > "$output"

    # Copy to systemd user directory
    cp "$output" ~/.config/systemd/user/
    echo "[clutch]   Generated: $output"
  done

  systemctl --user daemon-reload
  echo "[clutch] Systemd unit files installed"
}

start_services() {
  echo "[clutch] Starting services..."
  systemctl --user start "$SERVER_SERVICE"
  # Loop, bridge, and watcher have After=clutch-server.service, but we still wait a moment
  sleep 1
  systemctl --user start "$BRIDGE_SERVICE"
  systemctl --user start "$LOOP_SERVICE"
  systemctl --user start "$WATCHER_SERVICE"
  echo "[clutch] Services started"
}

stop_services() {
  echo "[clutch] Stopping services..."
  systemctl --user stop "$WATCHER_SERVICE" "$LOOP_SERVICE" "$BRIDGE_SERVICE" "$SERVER_SERVICE" 2>/dev/null || true
  echo "[clutch] Services stopped"
}

enable_services() {
  systemctl --user enable "$SERVER_SERVICE" "$BRIDGE_SERVICE" "$LOOP_SERVICE" "$WATCHER_SERVICE"
  echo "[clutch] Services enabled (will start on boot/login)"
}

status() {
  echo "=== OpenClutch Systemd Status ==="
  echo ""
  systemctl --user status "$SERVER_SERVICE" --no-pager -o short 2>/dev/null || echo "Server: not found"
  echo ""
  systemctl --user status "$LOOP_SERVICE" --no-pager -o short 2>/dev/null || echo "Loop: not found"
  echo ""
  systemctl --user status "$BRIDGE_SERVICE" --no-pager -o short 2>/dev/null || echo "Bridge: not found"
  echo ""
  systemctl --user status "$WATCHER_SERVICE" --no-pager -o short 2>/dev/null || echo "Watcher: not found"
}

logs() {
  journalctl --user -u "$SERVER_SERVICE" -f
}

loop_logs() {
  journalctl --user -u "$LOOP_SERVICE" -f
}

bridge_logs() {
  journalctl --user -u "$BRIDGE_SERVICE" -f
}

all_logs() {
  journalctl --user -u "$SERVER_SERVICE" -u "$LOOP_SERVICE" -u "$BRIDGE_SERVICE" -u "$WATCHER_SERVICE" -f
}

watcher_logs() {
  journalctl --user -u "$WATCHER_SERVICE" -f
}

# Legacy watch mode (still uses PID files for git-based auto-rebuild)
SERVER_LOG="/tmp/clutch-prod.log"
LOOP_LOG="/tmp/clutch-loop.log"
BRIDGE_LOG="/tmp/clutch-bridge.log"
SERVER_PID="/tmp/clutch-server.pid"
LOOP_PID="/tmp/clutch-loop.pid"
BRIDGE_PID="/tmp/clutch-bridge.pid"

kill_tree() {
  local pid="$1"
  local pidfile="${2:-}"
  if ! kill -0 "$pid" 2>/dev/null; then
    [[ -n "$pidfile" ]] && rm -f "$pidfile"
    return 0
  fi
  local pgid
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
  if [[ -n "$pgid" && "$pgid" != "0" ]]; then
    kill -- "-$pgid" 2>/dev/null || true
  else
    kill "$pid" 2>/dev/null || true
  fi
  sleep 1
  if [[ -n "$pgid" && "$pgid" != "0" ]]; then
    kill -9 -- "-$pgid" 2>/dev/null || true
  fi
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  [[ -n "$pidfile" ]] && rm -f "$pidfile"
}

stop_server_pid() {
  if [[ -f "$SERVER_PID" ]]; then
    local pid
    pid=$(cat "$SERVER_PID")
    kill_tree "$pid" "$SERVER_PID"
  fi
  fuser -k "$PORT/tcp" 2>/dev/null || true
}

stop_loop_pid() {
  if [[ -f "$LOOP_PID" ]]; then
    local pid
    pid=$(cat "$LOOP_PID")
    kill_tree "$pid" "$LOOP_PID"
  fi
}

stop_bridge_pid() {
  if [[ -f "$BRIDGE_PID" ]]; then
    local pid
    pid=$(cat "$BRIDGE_PID")
    kill_tree "$pid" "$BRIDGE_PID"
  fi
}

start_server_pid() {
  stop_server_pid 2>/dev/null || true
  echo "[clutch] Starting production server on port $PORT (watch mode)"
  local NODE_BIN
  NODE_BIN="$(which node)"
  NODE_ENV=production setsid nohup "$NODE_BIN" ./node_modules/next/dist/bin/next start -p "$PORT" > "$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PID"
}

start_loop_pid() {
  stop_loop_pid 2>/dev/null || true
  if grep -q "WORK_LOOP_ENABLED=true" .env.local 2>/dev/null; then
    echo "[clutch] Starting work loop (watch mode)"
    set -a
    source <(grep -v '^#' .env.local)
    set +a
    local NODE_BIN
    NODE_BIN="$(which node)"
    setsid nohup "$NODE_BIN" ./node_modules/.bin/tsx worker/loop.ts > "$LOOP_LOG" 2>&1 &
    echo $! > "$LOOP_PID"
  else
    echo "[clutch] Work loop disabled (WORK_LOOP_ENABLED != true)"
  fi
}

start_bridge_pid() {
  stop_bridge_pid 2>/dev/null || true
  echo "[clutch] Starting chat bridge (watch mode)"
  set -a
  source <(grep -v '^#' .env.local)
  set +a
  local NODE_BIN
  NODE_BIN="$(which node)"
  setsid nohup "$NODE_BIN" ./node_modules/.bin/tsx worker/chat-bridge.ts > "$BRIDGE_LOG" 2>&1 &
  echo $! > "$BRIDGE_PID"
}

watch_and_rebuild() {
  build
  start_server_pid
  start_bridge_pid
  start_loop_pid

  echo "[clutch] Watching for git changes on main..."
  local last_hash
  last_hash=$(git rev-parse HEAD)

  while true; do
    sleep 15
    git fetch origin main --quiet 2>/dev/null || continue
    local remote_hash
    remote_hash=$(git rev-parse origin/main 2>/dev/null || echo "$last_hash")

    if [[ "$remote_hash" != "$last_hash" ]]; then
      echo "[clutch] main updated: ${last_hash:0:7} → ${remote_hash:0:7}"
      if git pull --ff-only --quiet 2>/dev/null; then
        last_hash="$remote_hash"
        echo "[clutch] Rebuilding..."
        if build; then
          stop_server_pid
          start_server_pid
          stop_bridge_pid
          start_bridge_pid
          stop_loop_pid
          start_loop_pid
          echo "[clutch] Restarted at $(date '+%H:%M:%S')"
        else
          echo "[clutch] BUILD FAILED — server still running old version"
        fi
      else
        echo "[clutch] Pull failed (dirty state?), skipping"
      fi
    fi
  done
}

# Legacy clean command (kill all clutch processes)
clean() {
  echo "[clutch] Killing all clutch-related processes..."
  stop_services 2>/dev/null || true
  local pids
  pids=$(ps aux | grep -E 'clutch.*(loop|bridge|next|chat-bridge|session-watcher)' | grep -v grep | awk '{print $2}')
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
  rm -f "$SERVER_PID" "$LOOP_PID" "$BRIDGE_PID"
  fuser -k "$PORT/tcp" 2>/dev/null || true
  echo "[clutch] Clean complete"
}

# Main command dispatch
case "${1:-status}" in
  start)
    install_services
    build
    enable_services
    start_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    stop_services
    sleep 1
    install_services
    build
    start_services
    ;;
  watch)
    trap 'stop_loop_pid; stop_bridge_pid; stop_server_pid; exit 0' INT TERM
    watch_and_rebuild
    ;;
  status)
    status
    ;;
  logs|log)
    logs
    ;;
  loop-logs|loop-log)
    loop_logs
    ;;
  bridge-logs|bridge-log)
    bridge_logs
    ;;
  watcher-logs|watcher-log)
    watcher_logs
    ;;
  all-logs)
    all_logs
    ;;
  enable)
    install_services
    enable_services
    ;;
  install)
    install_services
    ;;
  clean)
    clean
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|watch|status|logs|loop-logs|bridge-logs|watcher-logs|all-logs|enable|install|clean}"
    exit 1
    ;;
esac
