# FlowTest 灵测

FlowTest 是一个可本地运行的全栈 Web 自动化测试平台。它把中文自然语言测试意图编译成可执行的浏览器步骤，使用本机 Chrome 真实执行，并通过 SSE 实时回传步骤状态、截图和日志，最终生成可下载的执行报告。

内置 **FlowShop 演示商城**，无需外网即可完成「登录 → 搜索 → 加购 → 断言 → 截图 → 报告」的全链路验收。

> **只想用一个纯命令行工具（不用后端、不落数据库）？** 见 [`nltest/`](./nltest/)：纯 Node + Playwright，自然语言 → 自动执行 → 每步截图 → HTML 报告，支持单条和批量。

## 功能

- **AI 用例工坊**：中文自然语言描述业务流程，编译为 `goto / click / fill / assert / screenshot` 等步骤；支持可选 OpenAI 兼容 LLM，失败自动回退本地规则引擎。
- **真实浏览器执行**：Selenium 4 + 本机 Chrome，支持无头/可见窗口、环境变量替换、每步截图、断言等待与超时。
- **实时执行监视器**：SSE 推送 `snapshot / status / step / log / done` 事件，前端实时展示进度、最新截图和控制台日志。
- **用例资产**：用例 CRUD、自然语言编辑、步骤预览、标签、优先级、附件、JSON 导入导出。
- **执行报告**：步骤时间线、失败定位、期望/实际值、截图画廊、控制台、report.json、console.log，以及完整 ZIP 打包下载。
- **项目与环境**：项目空间、Base URL、`${变量}` 环境变量、默认环境。
- **任务调度**：Cron 定时任务、多用例批次、失败重试、超时、Webhook 回调、手动触发。
- **CLI 自然语言执行**：`./ft run --file steps.nl` 一键完成编译、生成用例、真实 Chrome 执行、HTML/Markdown 报告。
- **平台调用**：为外部脚本/CI 提供 `X-API-Key` 鉴权的 `/api/v1/automation/**` API，支持同步等待执行结果。
- **工作台**：执行趋势、通过率、项目概览、最近执行和失败用例。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3.5、Vite、TypeScript、Element Plus、Pinia、ECharts |
| 后端 | JDK 21、Spring Boot 3.5、Spring Security JWT、Spring Data JPA |
| 自动化 | Selenium 4.52、本机 Google Chrome |
| 存储 | H2 文件数据库、本地 artifacts/uploads 目录 |
| 实时 | Server-Sent Events（SSE） |

## 快速开始

### 环境要求

- macOS（当前验证环境）
- JDK 21
- Node.js 18+ 与 npm
- Google Chrome
- 本仓库已内置 `tools/apache-maven-3.9.9`，无需全局安装 Maven

### 一键启动

```bash
cd flowtest
./start.sh
```

启动完成后访问：

- 平台：<http://localhost:5173>
- 后端 API：<http://localhost:8080/api>
- FlowShop 演示商城：<http://localhost:8080/demo/index.html>

默认账号：`admin / admin123`

停止服务：

```bash
./stop.sh
```

日志分别写入 `flowtest/backend.log` 和 `flowtest/frontend.log`。

### 手动启动

后端：

```bash
cd flowtest/backend
MAVEN_OPTS="-DsocksProxyHost= -Dhttp.proxyHost= -Dhttps.proxyHost= -Djava.net.useSystemProxies=false" \
  ../tools/apache-maven-3.9.9/bin/mvn -s ../tools/settings.xml spring-boot:run
```

前端：

```bash
cd flowtest/frontend
npm install
npm run dev
```

## 五分钟验收路径

1. 使用 `admin / admin123` 登录。
2. 打开 **AI 用例工坊**，输入或点击示例：
   ```text
   打开 /demo/index.html
   在 #username 输入 ${demoUser}
   在 #password 输入 ${demoPassword}
   点击 #login-btn
   断言文本包含 欢迎回来，admin
   在 #search 输入 机械键盘
   点击 #search-btn
   断言元素 [data-testid='product-101'] 可见
   点击 [data-testid='add-101']
   断言元素 #cart-count 的值为 1
   截图 登录并加购完成
   ```
3. 点击 **编译预览**，检查生成的步骤。
4. 点击 **生成并执行**，观察右侧监视器与实时步骤：Chrome 启动、每步状态、最新截图、控制台日志。
5. 执行结束后点击 **查看完整报告**：
   - 12 个步骤全部通过；
   - 通过率、耗时、截图画廊、report.json / console.log；
   - 可下载 ZIP 报告。
6. 也可以直接执行种子用例 **「登录 · 搜索 · 加购全链路」**。

种子数据还包含第二条用例 **「搜索商品并校验购物车数量」**（8 步）以及一个每日定时任务。

## CLI：自然语言生成用例并自动出报告

`flowtest/ft` 是零依赖 Node.js CLI。它连接本地 FlowTest 后端，完成：

```text
中文自然语言 → 编译步骤 → 生成用例 → 启动真实 Chrome 执行 → 自动生成 HTML/Markdown 报告
```

CLI 默认使用 `admin / admin123` 登录本地后端，默认项目为第一个项目，环境为项目默认环境。

### 基础用法

```bash
cd flowtest

# 查看示例
./ft --help

# 只编译，不执行
./ft compile --file cli/examples/login.nl

# 自然语言生成用例 + 执行 + 自动生成报告
./ft run --file cli/examples/login.nl --name "CLI · 登录搜索加购"

# 直接传入多行自然语言
./ft run --nl $'打开 /demo/index.html\n断言标题包含 FlowShop'

# 执行已有用例
./ft run --case 1 --open

# 批量执行一个目录里的自然语言用例（几十条单机并发即可）
./ft run-all --dir cli/examples/batch --workers 3 --retry 1 --report-dir ./reports

# 对已有执行记录补生成报告
./ft report --run 2 --open
```

执行结束后会输出报告目录，例如：

```text
flowtest-reports/run-0008-CLI-·-登录搜索加购/
├── report.html       # 可直接打开/归档的 HTML 报告
├── report.md         # Markdown 报告
├── run.json          # 完整执行数据
├── console.log       # 引擎控制台日志
├── screenshots/      # 每步截图
├── artifacts/        # report.json 等产物
└── flowtest-run-8.zip
```

报告包含：执行状态、通过率、步骤耗时、失败断言期望/实际值、截图画廊、自然语言源、编译信息和控制台日志。

批量执行会额外在报告根目录生成 `summary.html` / `summary.md` 汇总（通过率、失败清单、每例耗时）。

### 常用选项

| 选项 | 说明 |
| --- | --- |
| `--name <名称>` | 生成用例的名称 |
| `--project <id\|key\|name>` | 指定项目，默认第一个项目 |
| `--env <id\|name>` | 指定环境，默认项目默认环境 |
| `--headed` | 显示 Chrome 窗口，默认无头 |
| `--no-screenshot` | 关闭每步截图 |
| `--no-save-case` | 不写入用例库，只做临时执行 |
| `--use-llm` | 使用平台配置的 LLM 增强编译，默认规则引擎 |
| `--report-dir <目录>` | 报告输出根目录，默认 `flowtest-reports` |
| `--open` | 生成后自动打开 HTML 报告 |
| `--json` | 以 JSON 输出最终摘要，适合 CI |
| `--timeout <秒>` | 等待执行完成的最长时间，默认 300 |

也可通过环境变量配置：

```bash
export FLOWTEST_BASE_URL=http://localhost:8080
export FLOWTEST_USERNAME=admin
export FLOWTEST_PASSWORD=admin123
export FLOWTEST_PROJECT=FLOWSHOP
export FLOWTEST_REPORT_DIR=./reports
```

CLI 退出码：`0` 表示执行通过，`1` 表示执行失败/异常/取消，或调用出错。适合直接接入 CI。

## 外部自动化调用

1. 在 **系统设置 → API 密钥** 创建密钥（完整密钥只显示一次）。
2. 调用异步执行：

```bash
curl -X POST http://localhost:8080/api/v1/automation/runs \
  -H "X-API-Key: ft_你的密钥" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "nl": "打开 /demo/index.html\n断言标题包含 FlowShop"
  }'
```

3. 查询执行详情：

```bash
curl http://localhost:8080/api/v1/automation/runs/1 \
  -H "X-API-Key: ft_你的密钥"
```

4. 同步等待结果（最多 180 秒）：

```bash
curl -X POST "http://localhost:8080/api/v1/automation/runs?wait=true&waitSeconds=120" \
  -H "X-API-Key: ft_你的密钥" \
  -H "Content-Type: application/json" \
  -d '{"projectId":1,"caseId":1,"environmentId":1}'
```

其它接口：

- `POST /api/v1/automation/compile` 编译自然语言
- `GET /api/v1/automation/runs/{id}/report` 获取执行报告
- `POST /api/v1/automation/runs/{id}/cancel` 取消执行
- `GET /api/v1/automation/health` 健康检查

平台内部 UI 使用 JWT；SSE 与截图预览支持通过 `?token=` 识别身份。

## 目录结构

```text
flowtest/
├── DESIGN.md                 产品与架构设计
├── README.md
├── start.sh / stop.sh
├── ft                        CLI 入口
├── cli/
│   ├── README.md             CLI 详细用法
│   ├── flowtest.mjs          零依赖 Node.js CLI
│   └── examples/
│       ├── login.nl          单条自然语言示例
│       └── batch/            批量执行示例目录
├── nltest/                   纯 Node CLI（无需后端，Playwright 驱动）
│   ├── index.mjs             命令行入口
│   ├── lib/                  编译器 / 执行器 / 报告生成
│   ├── examples/             自然语言示例
│   └── README.md
├── backend/
│   ├── pom.xml
│   ├── src/main/java/com/flowtest/
│   │   ├── automation/       Selenium 执行器、动作定义
│   │   ├── config/           Security、Seeder、线程池
│   │   ├── domain/ JPA 实体
│   │   ├── repo/             数据访问
│   │   ├── service/          编译、执行、任务、统计、存储
│   │   └── web/              REST / SSE Controller
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   └── static/demo/      FlowShop 演示站点
│   └── data/                 H2、uploads、artifacts、tmp
├── frontend/
│   └── src/
│       ├── views/            工坊、项目、用例、执行、任务、环境、设置
│       ├── components/       时间线、状态标签、图表等
│       ├── api/ types/ stores/
│       └── layout/
└── tools/apache-maven-3.9.9/
```

## 配置

主要配置位于 `backend/src/main/resources/application.yml`：

- `server.port`：后端端口，默认 `8080`
- `flowtest.jwt.secret`：JWT 签名密钥
- `flowtest.engine.browser-binary`：Chrome 路径
- `flowtest.engine.max-parallel`：最大并发浏览器数
- `flowtest.llm.*`：可选 LLM 编译配置
- H2 文件：`backend/data/flowtest.mv.db`

### 重置演示数据

停止后端后删除数据库文件，再启动即可重新生成种子数据：

```bash
./stop.sh
rm -f backend/data/flowtest.mv.db backend/data/flowtest.trace.db
./start.sh
```

> 删除数据库会同时清除自建项目、用例、执行记录与 API Key。产物目录 `backend/data/artifacts` 可单独清理。

## 已知说明

- 首次启动 ChromeDriver 时 Selenium Manager 可能需要准备驱动；之后后端会优先复用 `~/.cache/selenium/chromedriver` 中与 Chrome 主版本匹配的缓存，单次 12 步演示执行约 4–8 秒。
- 演示环境 Base URL 为 `http://localhost:8080`，请先启动后端再执行用例；CLI 同样需要后端已启动。
- 前端生产构建使用 `npm run build`，类型检查使用 `npx vue-tsc --noEmit`。
- 当前为本地单机演示平台，默认账号密码仅用于验收，正式使用前请修改密码与 JWT 密钥。
