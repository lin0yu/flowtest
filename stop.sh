#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
stopped=0

for port in 8080 5173; do
  pids="$(lsof -ti tcp:$port 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "停止端口 $port 上的进程…"
    echo "$pids" | xargs kill 2>/dev/null || true
    stopped=1
  fi
done

rm -f "$ROOT/.backend.pid" "$ROOT/.frontend.pid"

if [ "$stopped" -eq 1 ]; then
  echo "FlowTest 已停止。"
else
  echo "FlowTest 当前未运行。"
fi
