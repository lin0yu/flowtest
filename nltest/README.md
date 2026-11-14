# FlowTest NL —— 纯 Node 自然语言 Web 自动化 CLI

不依赖后端、不落数据库的纯命令行工具：

```text
自然语言 → 生成自动化用例 → 驱动本机 Chrome 执行 → 每步验证 + 截图 → 生成 HTML 报告
```

## 特点

- **纯 Node**：只需 Node 18+ 和本机 Google Chrome，不用 JDK、不用后端服务
- **自然语言生成用例**：中文描述流程，自动编译成可执行步骤
- **每步截图**：每个步骤都截图，写进 HTML 报告
- **每步断言**：文本/标题/地址/元素可见/隐藏/值/数量，失败记录「期望 vs 实际」
- **显示跑 / 隐式跑**：`--headed` 显示窗口，默认无头隐式跑
- **批量执行**：`run-all` 一次跑一个目录，并发 + 汇总报告
- **不落数据**：结果只写到本地报告目录

## 安装

```bash
cd nltest
npm install
```

依赖 `playwright-core`（驱动系统已装的 Chrome，不下载浏览器）。确保机器装了 Google Chrome。

## 快速开始

```bash
# 只编译，看步骤
node index.mjs compile --file examples/demo.nl

# 执行（隐式/无头）
node index.mjs run --file examples/demo.nl \
  --url http://localhost:8080 \
  --var demoUser=admin --var demoPassword=admin123

# 显示 Chrome 窗口跑
node index.mjs run --file examples/demo.nl --url http://localhost:8080 --headed

# 打开报告
open reports/demo/report.html
```

## 命令

### run（跑一条）

```bash
node index.mjs run --file 用例.nl [选项]
node index.mjs run --nl "打开 /login\n点击 #btn" [选项]
```

### run-all（批量）

```bash
node index.mjs run-all --dir ./cases --workers 3 --retry 1 --report-dir ./reports
```

### compile（只编译）

```bash
node index.mjs compile --file 用例.nl --json
```

## 常用选项

| 选项 | 说明 |
| --- | --- |
| `--file <路径>` | 自然语言用例文件（.nl/.txt/.md） |
| `--nl <文本>` | 直接写自然语言 |
| `--name <名称>` | 用例名称 |
| `--url <地址>` | 相对地址（`打开 /xxx`）的 Base URL |
| `--var k=v` | 变量，可多次，用例里用 `${k}` 引用 |
| `--env-file <json>` | 从 JSON 文件读变量 |
| `--headed` | 显示 Chrome 窗口（默认隐式/无头） |
| `--browser <名字>` | 浏览器 channel，默认 `chrome`（也可 `msedge`） |
| `--timeout <秒>` | 每一步超时，默认 10 |
| `--report-dir <目录>` | 报告目录，默认 `reports` |
| `--no-screenshot` | 关闭每步截图 |
| `--inline` | 截图内联进 HTML（单文件报告，方便转发） |
| `--workers <数量>` | run-all 并发数，默认 3 |
| `--retry <次数>` | run-all 失败重试，默认 0 |
| `--prefix <前缀>` | run-all 用例名前缀 |
| `--open` | 生成后打开报告 |
| `--json` | JSON 输出 |

## 自然语言语法

```text
打开 /login                          # 打开页面（相对地址拼 --url）
在 #username 输入 ${user}            # 输入
点击 #login-btn                      # 点击
悬停 .menu                           # 悬停
勾选 #agree                          # 勾选复选框
选择 #type 为 样机                    # 原生下拉选择
上传 #file /tmp/a.pdf                # 上传文件
等待 2 秒                            # 等待
等待元素 .loading 消失                # 等待出现/消失
滚动到 #bottom                       # 滚动
截图 登录完成                        # 截图

断言标题包含 首页                     # 标题断言
断言文本包含 欢迎回来                 # 页面文本断言
断言地址包含 /home                    # 地址断言
断言元素 #btn 可见                    # 元素可见
断言元素 .loading 隐藏                # 元素隐藏
断言元素 #count 的值为 1              # 元素值
断言元素 .item 的数量为 3             # 元素数量
```

定位写法：`#id`、`.class`、`text=文字`、`placeholder=请输入`、`data-testid=xx`、`css=...`、`xpath=...`，纯文字自动按 `text=` 处理。

## 报告

```text
reports/
├── 用例名/
│   ├── report.html        每一步 + 截图 + 期望/实际
│   └── screenshots/step-01.png ...
└── summary.html / summary.md   （run-all 才有，汇总通过率/失败清单）
```

## 退出码

- `0`：全部通过
- `1`：有失败 / 异常

适合直接接 CI。

## 变量注入

用例里写 `${user}`、`${pwd}`，运行时注入：

```bash
node index.mjs run --file 用例.nl --var user=test01 --var pwd=secret

# 或 JSON 文件
node index.mjs run --file 用例.nl --env-file env.json
```

```json
{ "user": "test01", "pwd": "secret" }
```
