#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MVN="$ROOT/tools/apache-maven-3.9.9/bin/mvn"
MAVEN_OPTS_VALUE="-DsocksProxyHost= -Dhttp.proxyHost= -Dhttps.proxyHost= -Djava.net.useSystemProxies=false"

if lsof -ti tcp:8080 >/dev/null 2>&1; then
  echo "端口 8080 已被占用。请先执行 ./stop.sh，或关闭占用该端口的进程。"
  exit 1
fi

if lsof -ti tcp:5173 >/dev/null 2>&1; then
  echo "端口 5173 已被占用。请先执行 ./stop.sh，或关闭占用该端口的进程。"
  exit 1
fi

if [ ! -x "$MVN" ]; then
  echo "未找到内置 Maven：$MVN"
  exit 1
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "首次运行，安装前端依赖…"
  (cd "$ROOT/frontend" && npm install --no-audit --no-fund)
fi

echo "启动 FlowTest 后端（8080）…"
(
  cd "$ROOT/backend"
  nohup env MAVEN_OPTS="$MAVEN_OPTS_VALUE" "$MVN" -s ../tools/settings.xml spring-boot:run \
    > "$ROOT/backend.log" 2>&1 &
  echo $! > "$ROOT/.backend.pid"
)

echo "启动 FlowTest 前端（5173）…"
(
  cd "$ROOT/frontend"
  nohup npm run dev > "$ROOT/frontend.log" 2>&1 &
  echo $! > "$ROOT/.frontend.pid"
)

ready=0
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:8080/demo/index.html" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "后端未能按时启动，最近日志："
  tail -40 "$ROOT/backend.log" || true
  exit 1
fi

ready=0
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:5173" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "前端未能按时启动，最近日志："
  tail -40 "$ROOT/frontend.log" || true
  exit 1
fi

echo
echo "FlowTest 灵测已启动"
echo "  平台      http://localhost:5173"
echo "  演示商城  http://localhost:8080/demo/index.html"
echo "  默认账号  admin / admin123"
echo
echo "日志：backend.log / frontend.log"
echo "停止：./stop.sh"
