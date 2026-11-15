# FlowTest NL —— 纯 Node 自然语言 Web 自动化 CLI

不依赖后端、不落数据库的命令行工具：

```text
自然语言 → 编译为测试用例 → 驱动本机 Chrome 执行 → 逐步断言 + 每步截图 → HTML / JSON / PDF / MD 报告
```

## 特点

- **纯 Node**：只需 Node 18+ 与本机 Google Chrome，不需要 JDK、不需要数据库、不需要部署服务
- **双编译引擎**：本地规则引擎（离线、确定性）+ 可选 LLM（OpenAI 兼容，失败自动回退规则引擎）
- **每步截图**：成功与失败都截图，写进 HTML 报告
- **逐步验证**：文本 / 标题 / 地址 / 元素可见 / 隐藏 / 值 / 数量 / 属性 / 接口，失败记录期望 vs 实际
- **失败自诊断**：定位失败时输出页面可交互元素清单与建议选择器，可直接复制修正用例
- **显示跑 / 隐式跑**：`--headed` 显示窗口，默认无头
- **批量执行**：目录扫描 + 并发 + 重试 + 汇总报告 + JUnit XML
- **报告齐全**：HTML、JSON、Markdown、PDF（PDF 由 Playwright 渲染 HTML 产出，零额外依赖）
- **用例可由 AI 生成**：`gen` 从需求描述批量产出正向/异常/边界用例

## 安装

```bash
cd nltest
npm install
```

依赖只有 `playwright-core`（驱动系统已装的 Chrome，不下载浏览器）。

## 快速开始

```bash
# 环境自检（Node / Chrome / LLM 连通性）
node index.mjs doctor

# 编译看看步骤对不对
node index.mjs compile --file examples/demo.nl

# 执行（隐式/无头）
node index.mjs run --file examples/demo.nl \
  --url http://localhost:8080 \
  --var demoUser=admin --var demoPassword=admin123

# 显示 Chrome 窗口跑
node index.mjs run --file examples/demo.nl --url http://localhost:8080 --headed

# 批量执行
node index.mjs run-all --dir examples/batch --workers 3

# 打开报告
open reports/demo/report.html
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `run` | 执行一条用例，生成报告 |
| `run-all` | 批量执行目录里的用例，生成汇总 + JUnit XML |
| `compile` | 只编译并预览步骤（`--emit` 可反向导出 `.nl` 用例文件） |
| `gen` | 用 LLM 从需求描述批量生成测试用例文件 |
| `models` | 列出 LLM 可用模型 |
| `doctor` | 环境自检 |
| `init` | 生成配置与示例用例模板 |

## 常用选项

### 执行

| 选项 | 说明 |
| --- | --- |
| `--file <路径>` | 用例文件（.nl/.txt/.md） |
| `--nl <文本>` | 直接写自然语言 |
| `--name <名称>` | 用例名称 |
| `--url <地址>` | 被测应用 Base URL（`打开 /xxx` 相对此地址） |
| `--var k=v` | 变量，可多次；用例里用 `${k}` 引用 |
| `--env-file <json>` | 从 JSON 读变量 |
| `--headed` | 显示 Chrome 窗口（默认隐式/无头） |
| `--browser <名字>` | 浏览器 channel，默认 `chrome`（也可 `msedge`） |
| `--timeout <秒>` | 每步超时，默认 10 |
| `--report-dir <目录>` | 报告目录，默认 `reports` |
| `--formats <列表>` | `html,json,pdf,md,junit`，默认 `html,json,md` |
| `--screenshot <模式>` | `each-step`（默认，每步都截） / `on-failure` / `none` |
| `--inline` | 截图内联进 HTML（单文件报告，便于转发） |
| `--workers <数量>` | run-all 并发，默认 3 |
| `--retry <次数>` | run-all 失败重试，默认 0 |
| `--step-retries <次数>` | 单步内部重试 |
| `--fail-fast` | 某步失败后停止后续步骤 |
| `--open` | 生成后打开报告 |

### AI（LLM）

| 选项 | 说明 |
| --- | --- |
| `--llm` | 启用 LLM 编译/生成（也可用配置文件 `llm.enabled`） |
| `--model <名字>` | 模型名 |
| `--llm-base-url <地址>` | OpenAI 兼容端点，如 `http://127.0.0.1:8788/v1` |
| `--api-key <key>` | API Key |
| `--context-url <地址>` | 编译前抓该页面的真实元素，交给模型挑更准的选择器 |
| `--config <路径>` | 指定配置文件 |

## 配置

配置优先级：**默认 < `~/.nltest/config.json` < 项目 `nltest.config.json` < 环境变量 < CLI 参数**。

```json
{
  "app": { "baseUrl": "" },
  "llm": {
    "enabled": false,
    "baseUrl": "http://127.0.0.1:8788/v1",
    "model": "deepseek-v4.1",
    "apiKey": "",
    "timeoutMs": 60000
  },
  "browser": { "channel": "chrome", "headless": true, "viewport": { "width": 1440, "height": 960 } },
  "runner": { "timeoutSeconds": 10, "stepRetries": 0, "failFast": false },
  "report": { "dir": "reports", "formats": ["html", "json", "md"], "screenshot": "each-step" }
}
```

环境变量覆盖：`NLTEST_APP_URL`、`NLTEST_LLM_ENABLED`、`NLTEST_LLM_BASE_URL`、`NLTEST_LLM_MODEL`、`NLTEST_LLM_API_KEY`、`NLTEST_HEADLESS`、`NLTEST_TIMEOUT`、`NLTEST_REPORT_DIR`、`NLTEST_REPORT_FORMATS`。

## 自然语言语法

```text
打开 /login                          # 相对 --url
在 #username 输入 ${user}            # 输入
点击 #login-btn                      # 点击（支持多候选：text=新增 | 新建 | 添加）
双击 .row                           # 双击
悬停 .menu                           # 悬停
勾选 #agree                          # 勾选
选择 #type 为 样机                    # 原生下拉
上传 #file /tmp/a.pdf                # 上传
下载 #export-btn                     # 下载并留存文件
拖拽 #a 到 #b                        # 拖拽
等待 2 秒                            # 等待
等待元素 .loading 消失                # 等待出现/消失
滚动到 #bottom                       # 滚动
切换到 iframe #f1                    # 进入 iframe
切换到标签页 结算                     # 多标签页
新开标签页 /pay                      # 新标签页
关闭当前标签页 / 刷新页面 / 后退 / 前进
取出 #orderNo 存为 orderNo           # 取值，供后续步骤 ${orderNo} 使用
截图 登录完成                        # 截图

断言标题包含 首页
断言文本包含 欢迎回来
断言地址包含 /home
断言元素 #btn 可见
断言元素 .loading 隐藏
断言元素 #count 的值为 1
断言元素 .item 的数量为 3
断言元素 #btn 的 class 包含 btn-primary
断言接口 /api/order/save 返回 200

# 表格（按行关键字定位，行内同名按钮不点错）
点击表格行 张三 的 编辑
断言元素 表格行 张三 的 状态 列 的值为 已完成
```

定位写法：`#id`、`.class`、`text=文字`、`placeholder=…`、`aria=…`、`title=…`、`data-testid=…`、`css=…`、`xpath=…`，纯文字自动按 `text=` 处理；多个候选用 `|` 分隔。

## 用例文件

支持元信息注释（批量统计与报告分组会用到）：

```text
# @title 登录冒烟
# @tags smoke,login
# @priority HIGH
打开 /login
断言文本包含 欢迎回来
```

## 报告

```text
reports/
├── 用例名/
│   ├── report.html          步骤明细 + 每步截图 + 期望/实际 + 失败诊断
│   ├── report.json          机器可读（供 CI / 看板消费）
│   ├── report.md
│   ├── report.pdf           可选（--formats 加 pdf）
│   ├── screenshots/step-01.png ...
│   └── artifacts/
│       ├── dom-step-XX.html 失败页面 DOM 快照
│       └── trace.zip        Playwright Trace（可用 npx playwright show-trace 打开）
├── summary.html / summary.md / summary.json / summary.pdf
└── junit.xml
```

## 失败自诊断

定位失败时，报告会输出：

- 期望值 vs 实际值
- 页面 DOM 快照（`artifacts/dom-step-XX.html`）
- **页面上可交互元素清单 + 建议选择器**（如 `text=新增客户`），可直接复制进用例
- Playwright Trace（回放每一步的 DOM 快照与网络）

这对「前端无法埋点」的场景最有用：工具帮你把选择器写出来。

## 用 LLM 生成用例

```bash
node index.mjs gen --from 需求.md --out ./cases --count 8 --llm
```

生成 `cases/*.nl` + `cases/cases.json`（含标题、标签、优先级、覆盖点说明），随后即可：

```bash
node index.mjs run-all --dir ./cases --workers 3
```

## 退出码

- `0`：全部通过
- `1`：有失败 / 异常 / CLI 调用失败

适合直接接 CI。
