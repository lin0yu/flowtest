# FlowTest 灵测 · 产品功能设计

> 自然语言驱动的 Web 自动化测试平台。前端 Vue 3.5 + Element Plus，后端 JDK 21 + Spring Boot，执行引擎 Selenium + 本机 Chrome。

## 1. 系统定位

FlowTest 面向三类使用者：

1. **测试/研发人员**：在 Web 界面用中文描述测试场景，AI 自动编译为可编辑步骤，一键执行，实时查看每一步的过程截图、断言结果和控制台日志。
2. **命令行/CI**：用 `./ft run --file steps.nl` 完成自然语言编译、用例生成、真实 Chrome 执行，并自动产出 HTML/Markdown 报告。
3. **外部自动化工具/CI**：通过 API Key 调用平台，用自然语言提交测试用例、触发执行、轮询结果、下载报告，把 FlowTest 当作「Web 测试执行能力中台」。

## 2. 核心模块

| 模块 | 能力 |
| --- | --- |
| 认证与开放接口 | JWT 登录、角色、API Key 管理、外部自动化 API |
| 项目空间 | 项目 CRUD、统计、演示项目 |
| 环境配置 | 项目级环境、Base URL、`${variable}` 变量替换、默认环境 |
| 测试用例 | 自然语言描述、规则/LLM 双引擎编译、步骤可视化编辑、版本号、标签、优先级、状态 |
| AI 用例工坊 | 自然语言 → 步骤预览 → 立即执行 → 实时过程/截图/断言验证 → 保存用例 |
| CLI 执行器 | 自然语言文件/命令行输入 → 自动生成用例 → 执行 → 自动生成 HTML/Markdown 报告；`run-all` 支持目录批量并发执行 + 汇总报告，支持 CI 退出码 |
| 任务与调度 | 用例套件任务、Cron 定时、重试、批量执行、Webhook 回调 |
| 执行中心 | 队列、并发、取消、重跑、SSE 实时步骤/日志、失败自动截图 |
| 报告与产物 | 每一步截图、断言期望/实际值、执行日志、HTML/JSON 报告、ZIP 下载 |
| 文件能力 | 用例附件上传/下载、用例 JSON 导入/导出、执行产物下载 |
| 仪表盘 | 通过率、7 日趋势、最近执行、失败用例排行、引擎状态 |

## 3. 自然语言步骤协议

支持中英文动词，编译为统一动作：

`goto / click / fill / press / select / hover / check / uncheck / wait / waitFor / scroll / upload / screenshot`

断言：`assertText / assertTitle / assertUrl / assertVisible / assertHidden / assertValue / assertCount`

示例：

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

编译引擎：

1. **本地规则引擎**：离线可用，零依赖，覆盖常见 Web 操作与断言。
2. **LLM 引擎（可选）**：配置 OpenAI 兼容端点后启用，规则校验兜底，失败自动回退规则引擎。

## 4. 执行与验证链路

```text
Web AI 工坊 / CLI 自然语言文件 / 已保存用例 / 外部 API
   → 编译为 StepDef[]
   → 生成 Run 快照（环境、步骤、参数）
   → 线程池排队
   → Selenium 启动 Chrome（优先复用缓存 ChromeDriver）
   → 逐步执行 + 每步截图 + 断言期望/实际
   → SSE 推送步骤/日志/状态
   → 落库 + 生成 report.json/console.log
   → Web 实时监视器 / CLI 自动生成 HTML + Markdown 报告
   → 失败重试/Webhook/仪表盘统计
```

## 5. 外部工具接入

```bash
# 1. 用 API Key 触发自然语言测试（异步）
curl -X POST http://localhost:8080/api/v1/automation/runs \
  -H "X-API-Key: $FLOWTEST_KEY" -H "Content-Type: application/json" \
  -d '{"projectId":1,"environmentId":1,"title":"下单链路冒烟","nl":"打开 /demo/index.html\n断言标题包含 FlowShop"}'

# 2. 轮询结果
curl -H "X-API-Key: $FLOWTEST_KEY" http://localhost:8080/api/v1/automation/runs/123

# 3. 一个请求同步等待并拿完整报告
curl -X POST http://localhost:8080/api/v1/automation/runs?wait=true \
  -H "X-API-Key: $FLOWTEST_KEY" -H "Content-Type: application/json" \
  -d '{"caseId":1,"environmentId":1}'
```

平台内置 **FlowShop 演示站点**（`/demo/index.html`），无需外网即可验证登录、搜索、加购、断言、截图全链路。

## 6. 技术架构

- 前端：Vue 3.5、Vite、TypeScript、Element Plus、Pinia、Vue Router、Axios、ECharts、Day.js
- 后端：JDK 21、Spring Boot 3.5、Spring Security、JWT、Spring Data JPA、H2、Selenium 4、Spring Scheduling
- 实时：SSE（token 查询参数鉴权）
- 存储：本地 `data/uploads`、`data/artifacts`，H2 文件库 `data/flowtest.mv.db`
- 引擎：Selenium + 本机 Google Chrome（headless=new）；优先复用缓存 ChromeDriver，缺失时回退 Selenium Manager 自动匹配
- CLI：零依赖 Node.js 脚本（`flowtest/cli/flowtest.mjs`），输出 HTML/Markdown/ZIP/截图报告，支持 CI 退出码
