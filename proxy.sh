#!/usr/bin/env bash
# FlowTest 代理配置助手
#
#   ./proxy.sh show                     查看当前代理配置
#   ./proxy.sh set <地址>               设置代理（写入 .proxyrc + 应用到本仓库 git）
#   ./proxy.sh off                      关闭代理（清除 .proxyrc 与 git 配置）
#   ./proxy.sh test                     测试代理连通性
#   ./proxy.sh env                      输出 export 语句（供 eval 使用）
#   ./proxy.sh npm on|off               开/关本项目 npm 的代理
#
# 换公司网络时：./proxy.sh set http://公司代理:端口  即可，无需改代码。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
RC="$ROOT/.proxyrc"

load_rc() {
  PROXY_URL=""
  if [ -f "$RC" ]; then
    # shellcheck disable=SC1090
    . "$RC"
  fi
}

cmd_show() {
  load_rc
  echo "配置文件      : $RC"
  echo "  PROXY_URL   : ${PROXY_URL:-（未设置）}"
  echo "git http.proxy : $(git -C "$ROOT" config --get http.proxy || echo 未设置)"
  echo "git https.proxy: $(git -C "$ROOT" config --get https.proxy || echo 未设置)"
  echo "npm proxy      : $(npm config get proxy 2>/dev/null | sed 's#//.*@#//***@#' || echo 未设置)"
  echo "环境变量       : http_proxy=${http_proxy:-未设置} https_proxy=${https_proxy:-未设置}"
  echo
  echo "提示：未设置时代理走直连；如需改地址执行 ./proxy.sh set <地址>"
}

cmd_set() {
  local url="${1:-}"
  if [ -z "$url" ]; then
    echo "用法: ./proxy.sh set <代理地址，例如 http://127.0.0.1:33210>"
    exit 1
  fi
  case "$url" in
    http://*|https://*|socks5://*|socks5h://*) ;;
    *) url="http://$url" ;;
  esac
  printf 'PROXY_URL=%s\n' "$url" > "$RC"
  git -C "$ROOT" config http.proxy "$url"
  git -C "$ROOT" config https.proxy "$url"
  echo "✓ 已设置代理：$url"
  echo "  - 写入 $RC"
  echo "  - 已应用到本仓库 git 配置（git push/pull 会自动走代理）"
  echo "  - 如需给 npm 也走代理：./proxy.sh npm on"
}

cmd_off() {
  rm -f "$RC"
  git -C "$ROOT" config --unset http.proxy 2>/dev/null || true
  git -C "$ROOT" config --unset https.proxy 2>/dev/null || true
  echo "✓ 已关闭代理（git 与 .proxyrc 均已清除）"
}

cmd_test() {
  load_rc
  local url="${1:-${PROXY_URL:-}}"

  local direct_code proxy_code
  direct_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://github.com 2>/dev/null || true)
  direct_code="${direct_code:-000}"
  echo "直连 github.com : $direct_code"

  if [ -z "$url" ]; then
    echo "未设置代理地址"
    return 0
  fi
  proxy_code=$(curl -x "$url" -s -o /dev/null -w '%{http_code}' --max-time 12 https://github.com 2>/dev/null || true)
  proxy_code="${proxy_code:-000}"
  echo "经代理 $url : $proxy_code"

  if [ "$direct_code" = "200" ]; then
    echo "→ 建议：直连可用，执行 ./proxy.sh off 使用直连"
  elif [ "$proxy_code" = "200" ]; then
    echo "→ 建议：直连不通，执行 ./proxy.sh set $url 使用代理"
  else
    echo "→ 两条路都不通，请检查网络/代理软件"
  fi
}

cmd_auto() {
  load_rc
  local url="${PROXY_URL:-}"
  local direct_code proxy_code
  direct_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://github.com 2>/dev/null || true)
  direct_code="${direct_code:-000}"

  if [ "$direct_code" = "200" ]; then
    cmd_off
    echo "→ 自动选择：直连可用，已关闭代理"
    return 0
  fi

  if [ -z "$url" ]; then
    echo "→ 自动选择失败：直连不通，且未设置代理地址（./proxy.sh set <地址>）"
    exit 1
  fi
  proxy_code=$(curl -x "$url" -s -o /dev/null -w '%{http_code}' --max-time 12 https://github.com 2>/dev/null || true)
  proxy_code="${proxy_code:-000}"
  if [ "$proxy_code" = "200" ]; then
    git -C "$ROOT" config http.proxy "$url"
    git -C "$ROOT" config https.proxy "$url"
    echo "→ 自动选择：直连不通、代理可用，已启用代理 $url"
  else
    echo "→ 自动选择失败：直连($direct_code) 与代理($proxy_code) 都不通"
    exit 1
  fi
}

cmd_env() {
  load_rc
  [ -n "${PROXY_URL:-}" ] || exit 0
  echo "export http_proxy=$PROXY_URL"
  echo "export https_proxy=$PROXY_URL"
  echo "export HTTP_PROXY=$PROXY_URL"
  echo "export HTTPS_PROXY=$PROXY_URL"
}

cmd_token() {
  local t="${1:-}"
  if [ -z "$t" ]; then
    echo "用法: ./proxy.sh token <GitHub Personal Access Token>"
    exit 1
  fi
  printf '%s\n' "$t" > "$ROOT/.git-token"
  chmod 600 "$ROOT/.git-token"
  echo "✓ 已保存 GitHub token 到 .git-token（不提交，权限 600）"
}

cmd_push() {
  load_rc
  local remote="${1:-origin}"
  local branch="${2:-main}"
  local url="${PROXY_URL:-}"

  local remote_url slug owner auth_url token=""
  remote_url=$(git -C "$ROOT" remote get-url "$remote" 2>/dev/null || echo "")
  if [ -z "$remote_url" ]; then
    echo "✗ 未找到远程仓库 $remote"
    exit 1
  fi
  slug="${remote_url##*/}"; slug="${slug%.git}"
  owner="${slug%%/*}"

  if [ -f "$ROOT/.git-token" ]; then
    token=$(cat "$ROOT/.git-token")
  fi
  [ -z "$token" ] && token="${FLOWTEST_GITHUB_TOKEN:-}"

  if [ -n "$token" ]; then
    auth_url="https://${owner}:${token}@github.com/${slug}"
  else
    auth_url="$remote_url"
  fi

  # 依次尝试：直连 → 代理，多轮重试（网络可能是间歇性的）
  local round
  for round in 1 2 3; do
    local direct_code
    direct_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://github.com 2>/dev/null || true)
    direct_code="${direct_code:-000}"
    if [ "$direct_code" = "200" ]; then
      echo "→ [第${round}轮] 直连可用，使用直连推送…"
      if git -C "$ROOT" -c http.proxy= -c https.proxy= push "$auth_url" "$branch"; then
        git -C "$ROOT" fetch "$remote" >/dev/null 2>&1 || true
        echo "✓ 推送完成"
        return 0
      fi
    fi

    if [ -n "$url" ]; then
      local proxy_code
      proxy_code=$(curl -x "$url" -s -o /dev/null -w '%{http_code}' --max-time 12 https://github.com 2>/dev/null || true)
      proxy_code="${proxy_code:-000}"
      if [ "$proxy_code" = "200" ]; then
        echo "→ [第${round}轮] 直连不通，改用代理 $url 推送…"
        if git -C "$ROOT" -c http.proxy="$url" -c https.proxy="$url" push "$auth_url" "$branch"; then
          git -C "$ROOT" fetch "$remote" >/dev/null 2>&1 || true
          echo "✓ 推送完成"
          return 0
        fi
      fi
    fi

    if [ "$round" -lt 3 ]; then
      echo "→ [第${round}轮] 网络不可用，8 秒后重试…"
      sleep 8
    fi
  done

  echo "✗ 推送失败：网络不通或凭据无效（token 可用 ./proxy.sh token <token> 更新）"
  exit 1
}

cmd_npm() {
  load_rc
  local mode="${1:-on}"
  case "$mode" in
    on)
      [ -n "${PROXY_URL:-}" ] || { echo "请先执行 ./proxy.sh set <地址>"; exit 1; }
      npm config set proxy "$PROXY_URL" --location=project >/dev/null
      npm config set https-proxy "$PROXY_URL" --location=project >/dev/null
      echo "✓ 已为本项目开启 npm 代理（写入 .npmrc）"
      ;;
    off)
      npm config delete proxy --location=project >/dev/null 2>&1 || true
      npm config delete https-proxy --location=project >/dev/null 2>&1 || true
      echo "✓ 已关闭 npm 代理"
      ;;
    *)
      echo "用法: ./proxy.sh npm on|off"
      exit 1
      ;;
  esac
}

case "${1:-show}" in
  show) cmd_show ;;
  set) shift; cmd_set "$@" ;;
  off) cmd_off ;;
  auto) cmd_auto ;;
  test) shift; cmd_test "$@" ;;
  env) cmd_env ;;
  npm) shift; cmd_npm "$@" ;;
  token) shift; cmd_token "$@" ;;
  push) shift; cmd_push "$@" ;;
  *)
    echo "用法: ./proxy.sh {show|set <地址>|off|auto|test|env|npm on|off|token <tk>|push [remote] [branch]}"
    exit 1
    ;;
esac
