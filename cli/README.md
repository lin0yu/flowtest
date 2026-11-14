# FlowTest CLI

零依赖 Node.js CLI（Node 18+）。把中文自然语言编译为自动化测试用例，调用 FlowTest 后端启动真实 Chrome 执行，并在结束后自动生成 HTML / Markdown 测试报告。

## 前置条件

以下命令均在 `flowtest/` 目录执行。

1. 启动 FlowTest 后端：

   ```bash
   ./start.sh
   ```

2. 默认连接 `http://localhost:8080`，默认账号 `admin / admin123`。

## 快速开始

```bash
# 1. 只编译，检查步骤
./ft compile --file cli/examples/login.nl

# 2. 自然语言生成用例 → 执行 → 自动出报告
./ft run --file cli/examples/login.nl --name "登录搜索加购"

# 3. 打开 HTML 报告
open flowtest-reports/run-*/report.html
```

也可以直接写自然语言：

```bash
./ft run --nl $'打开 /demo/index.html\n断言标题包含 FlowShop'
```

## 命令

```text
flowtest run     生成/选择用例并执行，自动生成报告
flowtest run-all 批量执行目录里的自然语言用例，生成汇总报告
flowtest compile 只编译自然语言，输出步骤
flowtest report  为已有执行记录补生成报告
```

### run

```bash
./ft run --file steps.nl [选项]
./ft run --nl "..." [选项]
./ft run --case 1 [选项]
```

常用参数：

| 参数 | 说明 |
| --- | --- |
| `--name <名称>` | 生成用例的名称 |
| `--description <描述>` | 用例描述 |
| `--tags <a,b>` | 用例标签，默认 `cli,nl` |
| `--priority <LOW\|MEDIUM\|HIGH>` | 用例优先级，默认 `MEDIUM` |
| `--project <id\|key\|name>` | 项目，默认第一个项目 |
| `--env <id\|name>` | 环境，默认项目默认环境 |
| `--headed` | 显示 Chrome 窗口，默认无头 |
| `--no-screenshot` | 关闭每步截图（显式截图步骤仍保留） |
| `--no-save-case` | 不写入用例库，直接临时执行 |
| `--use-llm` | 使用平台配置的 LLM 增强编译 |
| `--timeout <秒>` | 等待执行完成的最长时间，默认 300 |
| `--case-timeout <秒>` | 用例执行超时，默认 120 |
| `--report-dir <目录>` | 报告根目录，默认 `flowtest-reports` |
| `--open` | 生成后用系统浏览器打开报告 |
| `--json` | stdout 只输出 JSON 摘要，适合 CI |
| `--quiet` | 不输出执行进度 |

登录/平台参数：

| 参数 | 说明 |
| --- | --- |
| `--base-url <url>` | 平台地址，默认 `http://localhost:8080` |
| `--username <用户名>` | 登录账号，默认 `admin` |
| `--password <密码>` | 登录密码，默认 `admin123` |
| `--token <JWT>` | 直接使用已有 JWT |

### run-all（批量）

把一个目录里的 `.nl` / `.txt` / `.md` 自然语言用例全部跑完，每个用例独立生成报告，最后汇总成一份 `summary.html` / `summary.md`：

```bash
./ft run-all --dir cli/examples/batch --workers 3 --retry 1 --report-dir ./reports
```

- `--workers <数量>`：并发数，默认 3（受后端 `flowtest.engine.max-parallel` 限制）
- `--retry <次数>`：失败用例自动重试次数，默认 0
- `--prefix <前缀>`：给用例名称统一加前缀
- 默认**不写入用例库**（临时执行）；需要落库用 `--save-case`
- 失败不会中断，其余用例继续跑
- 退出码：全部通过返回 `0`，任一失败返回 `1`

产出：

```text
reports/
├── summary.html   总览：通过率、失败清单、每例耗时
├── summary.md
└── run-0001-用例名/
    ├── report.html
    ├── report.md
    └── screenshots/...
```

### compile

```bash
./ft compile --file cli/examples/login.nl
./ft compile --nl "点击 #login-btn" --json
```

### report

```bash
./ft report --run 1 --open
./ft report 1 --report-dir ./reports
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `FLOWTEST_BASE_URL` | 平台地址 |
| `FLOWTEST_USERNAME` | 登录账号 |
| `FLOWTEST_PASSWORD` | 登录密码 |
| `FLOWTEST_TOKEN` | 已有 JWT |
| `FLOWTEST_PROJECT` | 默认项目（ID / key / 名称） |
| `FLOWTEST_ENV` | 默认环境（ID / 名称） |
| `FLOWTEST_REPORT_DIR` | 报告根目录 |

## 报告结构

```text
flowtest-reports/run-0001-CLI-示例-登录搜索加购/
├── report.html       可直接打开/归档的 HTML 报告
├── report.md         Markdown 报告
├── run.json          完整执行数据（用例、编译信息、步骤、产物）
├── console.log       引擎控制台日志
├── screenshots/      每步截图
│   ├── step-01.png
│   └── ...
├── artifacts/
│   └── report.json   平台生成的报告
└── flowtest-run-1.zip
```

HTML 报告包含：执行状态、通过率、总耗时、步骤明细、失败断言期望/实际值、截图时间线、自然语言源、编译信息、控制台日志和产物下载。

## CI 示例

```bash
#!/usr/bin/env bash
set -euo pipefail
cd flowtest
./ft run \
  --file cli/examples/login.nl \
  --name "CI · 登录搜索加购" \
  --report-dir "$CI_PROJECT_DIR/reports" \
  --json > report-summary.json
```

退出码：

- `0`：执行结果为 `PASSED`
- `1`：执行失败、异常、取消，或 CLI 调用失败

## 实现说明

- 自然语言默认走平台本地规则引擎，不依赖外网；`--use-llm` 可启用平台配置的 LLM。
- 通过 JWT 登录调用平台内部 API，可创建用例、触发执行、读取执行详情并下载全部产物。
- 报告由 CLI 在本地生成，截图和日志会随报告一起落盘，不依赖平台在线状态。
- 若直接调用外部系统，请使用 `X-API-Key` 访问 `/api/v1/automation/**`（见根目录 README）。
