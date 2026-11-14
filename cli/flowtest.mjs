#!/usr/bin/env node
/**
 * FlowTest 灵测 CLI
 *
 * 自然语言 -> 编译步骤 -> 保存用例 -> 驱动真实 Chrome 执行 -> 自动生成报告。
 *
 * 这个脚本只依赖 Node.js 18+ 内置能力（fetch / fs / child_process），
 * 不依赖第三方 npm 包，方便在 CI 或本地直接运行。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const VERSION = '1.0.0'

const FINAL_STATUSES = new Set(['PASSED', 'FAILED', 'ERROR', 'CANCELLED'])
const RUN_STATUS_LABELS = {
  QUEUED: '排队中',
  RUNNING: '执行中',
  PASSED: '通过',
  FAILED: '失败',
  ERROR: '异常',
  CANCELLED: '已取消'
}
const STEP_STATUS_LABELS = {
  PENDING: '待执行',
  RUNNING: '执行中',
  PASSED: '通过',
  FAILED: '失败',
  ERROR: '异常',
  SKIPPED: '跳过'
}
const ACTION_LABELS = {
  goto: '打开页面',
  click: '点击',
  fill: '输入',
  press: '按键',
  select: '选择',
  hover: '悬停',
  check: '勾选',
  uncheck: '取消勾选',
  scroll: '滚动',
  wait: '等待',
  waitFor: '等待元素',
  upload: '上传文件',
  screenshot: '截图',
  assertText: '断言文本',
  assertTitle: '断言标题',
  assertUrl: '断言地址',
  assertVisible: '断言可见',
  assertHidden: '断言隐藏',
  assertValue: '断言值',
  assertCount: '断言数量'
}

let useColor = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR
let quietMode = false
const paint = (code, value) => (useColor ? `\x1b[${code}m${value}\x1b[0m` : String(value))
const green = (value) => paint('32', value)
const red = (value) => paint('31', value)
const yellow = (value) => paint('33', value)
const cyan = (value) => paint('36', value)
const dim = (value) => paint('2', value)
const bold = (value) => paint('1', value)

class UserError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.name = 'UserError'
    this.exitCode = exitCode
  }
}

class HttpError extends UserError {
  constructor(status, message, endpoint) {
    super(`请求失败（HTTP ${status}）${endpoint ? `：${endpoint}` : ''}${message ? `\n${message}` : ''}`)
    this.name = 'HttpError'
    this.status = status
    this.endpoint = endpoint
  }
}

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

const BOOLEAN_FLAGS = new Set([
  'help', 'version', 'headed', 'headless', 'no-save-case', 'save-case',
  'no-screenshot', 'json', 'quiet', 'open', 'use-llm', 'no-color', 'no-zip'
])

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const rawArg = argv[i]
    if (rawArg === '-h') {
      out.help = true
      continue
    }
    if (rawArg === '-v') {
      out.version = true
      continue
    }
    if (!rawArg.startsWith('--')) {
      out._.push(rawArg)
      continue
    }
    let raw = rawArg.slice(2)
    let value = null
    const eq = raw.indexOf('=')
    if (eq >= 0) {
      value = raw.slice(eq + 1)
      raw = raw.slice(0, eq)
    }
    const key = camel(raw)
    if (BOOLEAN_FLAGS.has(raw)) {
      out[key] = value === null ? true : !['false', '0', 'no', 'off'].includes(value.toLowerCase())
      continue
    }
    if (value === null) {
      value = argv[++i]
      if (value === undefined) {
        throw new UserError(`参数 --${raw} 缺少值`)
      }
    }
    out[key] = value
  }
  return out
}

function camel(value) {
  return value.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
}

function env(name) {
  return process.env[name] === undefined ? '' : String(process.env[name])
}

function buildOptions(args) {
  useColor = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR && !args.noColor
  const baseUrl = normalizeBaseUrl(args.baseUrl || env('FLOWTEST_BASE_URL') || 'http://localhost:8080')
  const reportDir = args.reportDir || env('FLOWTEST_REPORT_DIR') || 'flowtest-reports'
  quietMode = Boolean(args.quiet || args.json)
  return {
    baseUrl,
    token: args.token || env('FLOWTEST_TOKEN') || '',
    username: args.username || env('FLOWTEST_USERNAME') || 'admin',
    password: args.password || env('FLOWTEST_PASSWORD') || 'admin123',
    projectRef: args.project || env('FLOWTEST_PROJECT') || '',
    envRef: args.env || env('FLOWTEST_ENV') || '',
    headless: !args.headed && args.headless !== false,
    screenshotEachStep: !args.noScreenshot,
    saveCase: !args.noSaveCase,
    useLlm: Boolean(args.useLlm),
    json: Boolean(args.json),
    quiet: Boolean(args.quiet || args.json),
    open: Boolean(args.open),
    noZip: Boolean(args.noZip),
    reportBase: path.resolve(expandHome(reportDir)),
    pollTimeoutMs: positiveNumber(args.timeout, 300) * 1000,
    caseTimeoutSeconds: Math.max(5, Math.min(3600, positiveNumber(args.caseTimeout, 120))),
    tags: (args.tags || 'cli,nl').split(',').map((tag) => tag.trim()).filter(Boolean),
    priority: (args.priority || 'MEDIUM').toUpperCase(),
    description: args.description || '由 FlowTest CLI 从自然语言生成。'
  }
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function normalizeBaseUrl(raw) {
  let text = String(raw || '').trim()
  if (!text) {
    text = 'http://localhost:8080'
  }
  if (!/^https?:\/\//i.test(text)) {
    text = `http://${text}`
  }
  return text.replace(/\/+$/, '')
}

function expandHome(value) {
  if (!value) return value
  if (value === '~') return process.env.HOME || value
  if (value.startsWith('~/')) return path.join(process.env.HOME || '', value.slice(2))
  return value
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function progress(message) {
  if (!quietMode) console.error(message)
}

function warn(message) {
  console.error(`${yellow('⚠')} ${message}`)
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatPercent(run) {
  const total = Number(run.totalSteps || 0)
  if (!total) return run.status === 'PASSED' ? '100%' : '0%'
  return `${Math.round((Number(run.passedSteps || 0) / total) * 100)}%`
}

function statusLabel(status) {
  return RUN_STATUS_LABELS[status] || status || '未知'
}

function stepStatusLabel(status) {
  return STEP_STATUS_LABELS[status] || status || '未知'
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action || '步骤'
}

function statusClass(status) {
  return String(status || 'unknown').toLowerCase().replace(/[^a-z]/g, '')
}

function truncate(value, max) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function mdCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim()
}

function slugify(value, max = 44) {
  const text = String(value || 'run')
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (text || 'run').slice(0, max)
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function uniqueDir(basePath) {
  if (!(await exists(basePath))) return basePath
  for (let index = 2; index < 1000; index++) {
    const candidate = `${basePath}-${index}`
    if (!(await exists(candidate))) return candidate
  }
  return `${basePath}-${Date.now()}`
}

async function readStdin() {
  let text = ''
  for await (const chunk of process.stdin) {
    text += chunk
  }
  return text
}

async function readNl(args) {
  let text = ''
  if (args.file) {
    if (args.file === '-') {
      text = await readStdin()
    } else {
      try {
        text = await fs.readFile(expandHome(args.file), 'utf8')
      } catch (error) {
        throw new UserError(`无法读取自然语言文件：${args.file}\n${error.message}`)
      }
    }
  } else {
    text = args.nl || ''
  }
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()
  if (!text) {
    throw new UserError('请提供自然语言测试步骤：使用 --nl "..."，或用 --file steps.txt 读取文件。')
  }
  return text
}

// ---------------------------------------------------------------------------
// HTTP / 平台 API
// ---------------------------------------------------------------------------

async function api(options, endpoint, { method = 'GET', body, token, raw = false, timeoutMs = 30000 } = {}) {
  const url = new URL(`${options.baseUrl}${endpoint}`)
  const headers = { Accept: 'application/json' }
  const authToken = token === undefined ? options.token : token
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }
  let payload
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { method, headers, body: payload, signal: controller.signal })
    if (!response.ok) {
      const text = await response.text()
      let message = text
      try {
        const parsed = JSON.parse(text)
        message = parsed.message || parsed.error || text
      } catch {
        // 非 JSON 错误体，保留原文
      }
      throw new HttpError(response.status, message, endpoint)
    }
    if (raw) {
      return Buffer.from(await response.arrayBuffer())
    }
    const text = await response.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch (error) {
    if (error instanceof HttpError || error instanceof UserError) throw error
    if (error.name === 'AbortError') {
      throw new UserError(`请求超时：${endpoint}`)
    }
    throw new UserError(
      `无法连接 FlowTest 后端（${options.baseUrl}）。\n` +
      '请确认后端已启动（通常在 flowtest 目录执行 ./start.sh），或使用 --base-url 指定地址。\n' +
      `原始错误：${error.message}`
    )
  } finally {
    clearTimeout(timer)
  }
}

async function authenticate(options) {
  if (options.token) {
    return options.token
  }
  progress(dim(`登录 ${options.baseUrl}（${options.username}）…`))
  const result = await api(options, '/api/auth/login', {
    method: 'POST',
    body: { username: options.username, password: options.password },
    token: ''
  })
  if (!result || !result.token) {
    throw new UserError('登录失败：平台没有返回 token。')
  }
  options.token = result.token
  options.user = result.user
  return result.token
}

async function loadProjects(options) {
  const projects = await api(options, '/api/projects')
  if (!Array.isArray(projects)) {
    throw new UserError('项目列表响应格式异常。')
  }
  return projects
}

async function resolveProject(options, forcedId) {
  const projects = await loadProjects(options)
  if (!projects.length) {
    throw new UserError('平台中还没有项目，请先在 Web 控制台创建一个项目。')
  }
  const reference = forcedId ? String(forcedId) : String(options.projectRef || '')
  if (!reference) {
    return projects[0]
  }
  const matched = projects.find((project) =>
    String(project.id) === reference ||
    String(project.key || '').toLowerCase() === reference.toLowerCase() ||
    String(project.name || '').toLowerCase() === reference.toLowerCase()
  ) || projects.find((project) => String(project.name || '').includes(reference))

  if (!matched) {
    const list = projects.map((project) => `#${project.id} ${project.name}（${project.key || '-'}）`).join('\n')
    throw new UserError(`未找到项目「${reference}」。可用项目：\n${list}`)
  }
  return matched
}

async function resolveEnvironment(options, project, forcedId) {
  const environments = await api(options, `/api/environments?projectId=${encodeURIComponent(project.id)}`)
  if (!Array.isArray(environments) || environments.length === 0) {
    throw new UserError(`项目「${project.name}」没有可用环境，请先在 Web 控制台创建环境。`)
  }
  const reference = forcedId ? String(forcedId) : String(options.envRef || '')
  if (!reference) {
    return environments.find((environment) => environment.defaultEnv) || environments[0]
  }
  const matched = environments.find((environment) =>
    String(environment.id) === reference ||
    String(environment.name || '').toLowerCase() === reference.toLowerCase()
  ) || environments.find((environment) => String(environment.name || '').includes(reference))
  if (!matched) {
    const list = environments.map((environment) => `#${environment.id} ${environment.name}`).join('\n')
    throw new UserError(`未找到环境「${reference}」。项目可用环境：\n${list}`)
  }
  return matched
}

// ---------------------------------------------------------------------------
// 命令：run
// ---------------------------------------------------------------------------

async function commandRun(args) {
  const options = buildOptions(args)
  if (args.case && (args.nl || args.file)) {
    throw new UserError('--case 与 --nl / --file 不能同时使用。')
  }
  if (!args.case && !args.nl && !args.file) {
    throw new UserError('请使用 --nl "自然语言步骤"、--file steps.txt，或 --case <id> 指定已有用例。')
  }

  await authenticate(options)

  let project
  let environment
  let caseDetail = null
  let compile = null
  let nl = ''
  let caseId = null
  let caseName = ''
  let run

  if (args.case) {
    const caseRef = String(args.case)
    if (!/^\d+$/.test(caseRef)) {
      throw new UserError('--case 需要传入数值型用例 ID。')
    }
    caseDetail = await api(options, `/api/cases/${caseRef}`)
    caseId = caseDetail.id
    caseName = caseDetail.name
    nl = caseDetail.nlInput || ''
    const explicitProject = args.project || options.projectRef
    project = await resolveProject(options, explicitProject ? undefined : caseDetail.projectId)
    environment = await resolveEnvironment(options, project, args.env)
    progress(`${green('●')} 用例 #${caseId}  ${bold(caseName)}`)
    progress(`  项目 ${project.name} · 环境 ${environment.name}`)
    run = await api(options, `/api/cases/${caseId}/run`, {
      method: 'POST',
      body: { environmentId: environment.id, headless: options.headless }
    })
  } else {
    nl = await readNl(args)
    project = await resolveProject(options)
    environment = await resolveEnvironment(options, project, args.env)
    progress(`${green('●')} 项目 ${project.name} · 环境 ${environment.name}`)

    progress(dim('编译自然语言步骤…'))
    compile = await api(options, '/api/cases/compile', {
      method: 'POST',
      body: {
        nl,
        title: args.name || args.title || null,
        useLlm: options.useLlm
      }
    })
    if (!compile || !Array.isArray(compile.steps) || compile.steps.length === 0) {
      throw new UserError('自然语言没有编译出可执行步骤，请检查输入描述。')
    }
    caseName = (args.name || compile.title || 'CLI 自然语言用例').trim().slice(0, 160)
    printCompileSummary(compile, options)

    if (options.saveCase) {
      const payload = {
        projectId: project.id,
        name: caseName,
        description: truncate(options.description, 1200),
        nlInput: nl,
        steps: compile.steps,
        tags: options.tags,
        priority: options.priority,
        status: 'READY',
        timeoutSeconds: options.caseTimeoutSeconds,
        headless: options.headless,
        screenshotEachStep: options.screenshotEachStep
      }
      caseDetail = await api(options, '/api/cases', { method: 'POST', body: payload })
      caseId = caseDetail.id
      caseName = caseDetail.name
      progress(`${green('✓')} 已生成用例 #${caseId}  ${bold(caseName)}`)
      run = await api(options, `/api/cases/${caseId}/run`, {
        method: 'POST',
        body: { environmentId: environment.id, headless: options.headless }
      })
    } else {
      progress(dim('已跳过用例保存（--no-save-case），直接临时执行。'))
      run = await api(options, '/api/runs/quick', {
        method: 'POST',
        body: {
          projectId: project.id,
          environmentId: environment.id,
          nl,
          title: caseName,
          steps: compile.steps,
          headless: options.headless,
          screenshotEachStep: options.screenshotEachStep
        }
      })
    }
  }

  if (!run || !run.id) {
    throw new UserError('执行请求没有返回运行编号。')
  }
  progress(`${cyan('▶')} 开始执行 run #${run.id}  ${bold(run.caseName || caseName)}（${options.headless ? '无头' : '可见'} Chrome）`)

  const detail = await waitForRun(options, run.id)
  const report = await generateReport(options, detail, {
    case: caseDetail,
    compile,
    nl,
    project,
    environment
  })

  const summary = buildSummary(detail, report, { caseId, caseName, project, environment })
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    printRunSummary(summary, report, detail)
  }

  if (options.open) {
    await openFile(report.htmlPath)
  }

  return summary.status === 'PASSED' ? 0 : 1
}

async function waitForRun(options, runId) {
  const startedAt = Date.now()
  const printedSteps = new Map()
  let lastRunStatus = null
  let detail = null
  let networkErrors = 0

  while (true) {
    try {
      detail = await api(options, `/api/runs/${runId}`)
      networkErrors = 0
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        throw new UserError(`执行 run #${runId} 不存在。`)
      }
      networkErrors++
      if (networkErrors > 3) throw error
      warn(`查询执行状态失败，稍后重试：${error.message}`)
      await sleep(1000)
      continue
    }

    const run = detail.run
    if (run.status !== lastRunStatus) {
      const statusText = `${statusLabel(run.status)}`
      const suffix = run.errorMessage ? ` · ${truncate(run.errorMessage, 120)}` : ''
      progress(`[run #${run.id}] ${paintRunStatus(run.status, statusText)}${suffix}`)
      lastRunStatus = run.status
    }

    for (const step of detail.steps || []) {
      const previous = printedSteps.get(step.stepIndex)
      if (previous === step.status) continue
      printedSteps.set(step.stepIndex, step.status)
      if (!['PASSED', 'FAILED', 'ERROR', 'SKIPPED'].includes(step.status)) continue
      const icon = step.status === 'PASSED' ? green('✓')
        : step.status === 'SKIPPED' ? dim('○')
          : red(step.status === 'FAILED' ? '✗' : '!')
      const duration = step.durationMs !== null && step.durationMs !== undefined
        ? dim(` · ${formatDuration(step.durationMs)}`)
        : ''
      const extra = step.message ? `  ${dim(truncate(step.message, 110))}` : ''
      progress(`  ${icon} ${String(step.stepIndex).padStart(2, '0')} ${step.description || actionLabel(step.action)}${duration}${extra}`)
    }

    if (FINAL_STATUSES.has(run.status)) {
      return detail
    }

    if (Date.now() - startedAt > options.pollTimeoutMs) {
      warn(`执行超过 ${Math.round(options.pollTimeoutMs / 1000)}s，正在请求取消…`)
      try {
        await api(options, `/api/runs/${runId}/cancel`, { method: 'POST' })
      } catch (error) {
        warn(`取消失败：${error.message}`)
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(1000)
        try {
          detail = await api(options, `/api/runs/${runId}`)
          if (FINAL_STATUSES.has(detail.run.status)) return detail
        } catch {
          // 保留最后一次快照
        }
      }
      return detail
    }

    await sleep(1000)
  }
}

function paintRunStatus(status, text) {
  if (status === 'PASSED') return green(text)
  if (status === 'FAILED' || status === 'ERROR') return red(text)
  if (status === 'CANCELLED') return yellow(text)
  if (status === 'RUNNING') return cyan(text)
  return text
}

function printCompileSummary(compile, options) {
  if (options.quiet) return
  const warnings = Array.isArray(compile.warnings) ? compile.warnings : []
  const summary = compile.summary || `${compile.steps.length} 个步骤`
  const engine = summary.includes('引擎') ? '' : ` · ${compile.engine || '规则引擎'}`
  progress(`${green('✓')} 编译完成：${bold(compile.title || '')}  ${dim(`(${summary}${engine})`)}`)
  for (const warning of warnings) {
    warn(warning)
  }
}

// ---------------------------------------------------------------------------
// 命令：compile
// ---------------------------------------------------------------------------

async function commandCompile(args) {
  const options = buildOptions(args)
  const nl = await readNl(args)
  await authenticate(options)
  const compile = await api(options, '/api/cases/compile', {
    method: 'POST',
    body: {
      nl,
      title: args.name || args.title || null,
      useLlm: options.useLlm
    }
  })
  if (options.json) {
    console.log(JSON.stringify(compile, null, 2))
    return 0
  }
  console.log(`${bold('FlowTest 编译结果')}  ${compile.title || ''}`)
  const summary = compile.summary || ''
  const engine = summary.includes('引擎') ? '' : `  ·  ${compile.engine || '规则引擎'}`
  console.log(`  ${summary}${engine}`)
  if (Array.isArray(compile.warnings) && compile.warnings.length) {
    console.log(yellow('  警告：'))
    for (const warning of compile.warnings) {
      console.log(`  - ${warning}`)
    }
  }
  console.log('')
  console.log(`${'#'.padStart(3)}  ${'动作'.padEnd(6)}  描述 / 参数`)
  for (const [index, step] of (compile.steps || []).entries()) {
    const action = `${String(index + 1).padStart(2, '0')}  ${(actionLabel(step.action)).padEnd(6)}`
    const params = [step.selector, step.value].filter(Boolean).join('  ')
    console.log(`${action}  ${step.description || ''}${params ? `  ${dim(params)}` : ''}`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// 命令：report
// ---------------------------------------------------------------------------

async function commandReport(args) {
  const options = buildOptions(args)
  const runRef = args.run || args._[1]
  if (!runRef || !/^\d+$/.test(String(runRef))) {
    throw new UserError('请使用 --run <执行ID> 或 flowtest report <执行ID> 指定要生成报告的执行。')
  }
  await authenticate(options)
  const detail = await api(options, `/api/runs/${runRef}`)
  let caseDetail = null
  if (detail.run.caseId) {
    try {
      caseDetail = await api(options, `/api/cases/${detail.run.caseId}`)
    } catch {
      // 用例可能已删除，不影响报告
    }
  }
  const report = await generateReport(options, detail, {
    case: caseDetail,
    compile: null,
    nl: caseDetail?.nlInput || '',
    project: { id: detail.run.projectId, name: detail.run.projectName },
    environment: { id: detail.run.environmentId, name: detail.run.environmentName }
  })
  const summary = buildSummary(detail, report, {
    caseId: detail.run.caseId,
    caseName: detail.run.caseName,
    project: { id: detail.run.projectId, name: detail.run.projectName },
    environment: { id: detail.run.environmentId, name: detail.run.environmentName }
  })
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    printRunSummary(summary, report, detail)
  }
  if (options.open) {
    await openFile(report.htmlPath)
  }
  return 0
}

// ---------------------------------------------------------------------------
// 命令：run-all（批量执行一个目录里的自然语言用例）
// ---------------------------------------------------------------------------

async function commandRunAll(args) {
  const options = buildOptions(args)
  // 批量场景默认不写入用例库，避免产生几十条临时用例；可用 --save-case 覆盖。
  options.saveCase = Boolean(args.saveCase)
  const retries = Math.max(0, Math.floor(Number(args.retry) || 0))
  const workerCount = Math.max(1, Math.floor(Number(args.workers) || 3))

  const files = await collectCaseFiles(args)
  await authenticate(options)
  const project = await resolveProject(options)
  const environment = await resolveEnvironment(options, project, args.env)

  progress(`${cyan('▶')} 批量执行 ${files.length} 条用例 · 项目 ${project.name} · 环境 ${environment.name} · 并发 ${workerCount} · 重试 ${retries}`)
  progress('')

  const tasks = await Promise.all(files.map(async (file) => {
    const base = path.basename(file).replace(/\.(nl|txt|md)$/i, '')
    const prefix = args.prefix || ''
    const name = (prefix + base).trim().slice(0, 160) || base
    const nl = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()
    return { file, base, name, nl }
  }))

  const results = await runAllInParallel(tasks, workerCount, async (task) => {
    const outcome = await runCaseWithRetry(options, task, project, environment, retries)
    return normalizeResult(task, outcome)
  })

  const batch = await buildBatchReport(options, results)
  if (options.json) {
    console.log(JSON.stringify(batch, null, 2))
  } else {
    printBatchSummary(batch, results)
  }

  if (options.open && batch.summaryHtml) {
    await openFile(batch.summaryHtml)
  }
  return batch.stats.passed === batch.stats.total ? 0 : 1
}

async function collectCaseFiles(args) {
  const files = []
  if (args.dir) {
    const dir = path.resolve(expandHome(args.dir))
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (error) {
      throw new UserError(`无法读取目录：${dir}\n${error.message}`)
    }
    for (const entry of entries) {
      if (entry.isFile() && /\.(nl|txt|md)$/i.test(entry.name)) {
        files.push(path.join(dir, entry.name))
      }
    }
  }
  for (const item of args._.slice(1)) {
    if (item && !String(item).startsWith('--')) {
      files.push(path.resolve(expandHome(item)))
    }
  }
  const seen = new Set()
  const unique = []
  for (const file of files.sort()) {
    const absolute = path.resolve(file)
    if (!seen.has(absolute)) {
      seen.add(absolute)
      unique.push(absolute)
    }
  }
  if (!unique.length) {
    throw new UserError('没有找到可执行的用例文件。请用 --dir 指定目录，或传入 .nl/.txt/.md 文件列表。')
  }
  return unique
}

async function runNlCase(options, task, project, environment) {
  const compile = await api(options, '/api/cases/compile', {
    method: 'POST',
    body: { nl: task.nl, title: task.name, useLlm: options.useLlm }
  })
  if (!compile || !Array.isArray(compile.steps) || compile.steps.length === 0) {
    throw new UserError('自然语言没有编译出可执行步骤')
  }

  let caseDetail = null
  let caseId = null
  let run
  if (options.saveCase) {
    caseDetail = await api(options, '/api/cases', {
      method: 'POST',
      body: {
        projectId: project.id,
        name: task.name,
        description: truncate(options.description, 1200),
        nlInput: task.nl,
        steps: compile.steps,
        tags: options.tags,
        priority: options.priority,
        status: 'READY',
        timeoutSeconds: options.caseTimeoutSeconds,
        headless: options.headless,
        screenshotEachStep: options.screenshotEachStep
      }
    })
    caseId = caseDetail.id
    run = await api(options, `/api/cases/${caseId}/run`, {
      method: 'POST',
      body: { environmentId: environment.id, headless: options.headless }
    })
  } else {
    run = await api(options, '/api/runs/quick', {
      method: 'POST',
      body: {
        projectId: project.id,
        environmentId: environment.id,
        nl: task.nl,
        title: task.name,
        steps: compile.steps,
        headless: options.headless,
        screenshotEachStep: options.screenshotEachStep
      }
    })
  }

  if (!run || !run.id) {
    throw new UserError('执行请求没有返回运行编号')
  }
  const detail = await waitForRun(options, run.id)
  const report = await generateReport(options, detail, {
    case: caseDetail,
    compile,
    nl: task.nl,
    project,
    environment
  })
  const summary = buildSummary(detail, report, { caseId, caseName: task.name, project, environment })
  return { summary, report, detail }
}

async function runCaseWithRetry(options, task, project, environment, retries) {
  let last
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      last = await runNlCase(options, task, project, environment)
      if (last.summary.status === 'PASSED') {
        return last
      }
      if (attempt < retries) {
        progress(`  ${yellow('↻')} 重试 ${task.name}（${attempt + 1}/${retries}）`)
      }
    } catch (error) {
      last = { error: error instanceof UserError ? error.message : String(error?.message || error) }
      if (attempt < retries) {
        progress(`  ${yellow('↻')} 重试 ${task.name}（${attempt + 1}/${retries}）：${last.error}`)
      }
    }
  }
  return last
}

async function runAllInParallel(tasks, workerCount, fn) {
  const results = new Array(tasks.length)
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++
      results[index] = await fn(tasks[index])
    }
  }
  const count = Math.max(1, Math.min(workerCount, tasks.length))
  await Promise.all(Array.from({ length: count }, () => worker()))
  return results
}

function normalizeResult(task, outcome) {
  if (outcome.error) {
    return { name: task.name, file: task.file, status: 'ERROR', error: outcome.error, summary: null, report: null }
  }
  const summary = outcome.summary
  return {
    name: task.name,
    file: task.file,
    status: summary.status,
    summary,
    report: outcome.report,
    error: summary.errorMessage || null
  }
}

async function buildBatchReport(options, results) {
  const stats = {
    total: results.length,
    passed: results.filter((result) => result.status === 'PASSED').length,
    failed: results.filter((result) => result.status === 'FAILED').length,
    error: results.filter((result) => result.status === 'ERROR' || result.status === 'CANCELLED').length
  }
  stats.passRate = stats.total ? `${Math.round((stats.passed / stats.total) * 100)}%` : '0%'
  stats.totalDurationMs = results.reduce((sum, result) => sum + Number(result.summary?.durationMs || 0), 0)

  const summaryHtml = path.join(options.reportBase, 'summary.html')
  const summaryMd = path.join(options.reportBase, 'summary.md')
  const generatedAt = new Date().toISOString()
  const rows = results.map((result) => {
    const summary = result.summary
    const relative = result.report ? path.relative(options.reportBase, result.report.htmlPath).split(path.sep).join('/') : null
    const status = result.status
    const steps = summary ? `${summary.passedSteps}/${summary.totalSteps}` : '—'
    const duration = summary ? formatDuration(summary.durationMs) : '—'
    const message = result.error || (summary?.errorMessage) || ''
    return { result, status, steps, duration, message, relative }
  })

  const htmlRows = rows.map((row) => `
    <tr class="row-${statusClass(row.status)}">
      <td>${htmlEscape(row.result.name)}</td>
      <td><span class="pill ${statusClass(row.status)}">${htmlEscape(statusLabel(row.status))}</span></td>
      <td>${htmlEscape(row.steps)}</td>
      <td>${htmlEscape(row.duration)}</td>
      <td>${row.relative ? `<a href="${htmlEscape(row.relative)}">report.html</a>` : '—'}</td>
      <td class="msg">${htmlEscape(row.message || '')}</td>
    </tr>`).join('')

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FlowTest 批量执行汇总</title>
<style>
  :root { --bg:#f3f5fb; --panel:#fff; --ink:#14172a; --muted:#6d7288; --line:#e6e9f3; --ok:#12805c; --ok-soft:#e5f7ef; --bad:#b42318; --bad-soft:#fdecea; --warn:#9a5b00; --warn-soft:#fff5dc; }
  * { box-sizing:border-box; }
  body { margin:0; color:var(--ink); background:var(--bg); font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { width:min(1180px,calc(100% - 40px)); margin:32px auto 64px; }
  header { border-radius:20px; padding:30px 34px; color:#fff; background:linear-gradient(125deg,#171b3a,#272c62 55%,#4338ca); }
  header h1 { margin:0 0 6px; font-size:28px; }
  header p { margin:0; color:#c6c9e9; font-size:13px; }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:18px 0; }
  .stat { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .stat .k { color:var(--muted); font-size:11px; }
  .stat .v { font-size:22px; font-weight:700; margin-top:2px; }
  .table-wrap { background:var(--panel); border:1px solid var(--line); border-radius:14px; overflow:auto; }
  table { width:100%; border-collapse:collapse; min-width:760px; }
  th,td { padding:11px 13px; text-align:left; border-bottom:1px solid var(--line); }
  th { background:#fafbff; color:var(--muted); font-size:11px; font-weight:600; }
  tr:last-child td { border-bottom:0; }
  .row-failed,.row-error,.row-cancelled { background:#fffafa; }
  .pill { display:inline-flex; border-radius:999px; padding:2px 9px; font-size:11.5px; font-weight:600; }
  .pill.passed { background:var(--ok-soft); color:var(--ok); }
  .pill.failed,.pill.error { background:var(--bad-soft); color:var(--bad); }
  .pill.cancelled { background:var(--warn-soft); color:var(--warn); }
  .msg { color:var(--muted); font-size:12px; max-width:360px; }
  a { color:#4338ca; }
  @media (max-width:800px){ .stats{grid-template-columns:repeat(2,1fr);} }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>FlowTest 批量执行汇总</h1>
    <p>共 ${stats.total} 条用例 · 通过 ${stats.passed} · 失败 ${stats.failed} · 异常 ${stats.error} · ${htmlEscape(formatDate(generatedAt))}</p>
  </header>
  <section class="stats">
    <div class="stat"><div class="k">通过率</div><div class="v">${htmlEscape(stats.passRate)}</div></div>
    <div class="stat"><div class="k">总数 / 通过</div><div class="v">${stats.total} / ${stats.passed}</div></div>
    <div class="stat"><div class="k">失败 / 异常</div><div class="v">${stats.failed} / ${stats.error}</div></div>
    <div class="stat"><div class="k">总耗时</div><div class="v">${htmlEscape(formatDuration(stats.totalDurationMs))}</div></div>
  </section>
  <div class="table-wrap">
    <table>
      <thead><tr><th>用例</th><th>状态</th><th>步骤</th><th>耗时</th><th>报告</th><th>备注</th></tr></thead>
      <tbody>${htmlRows || '<tr><td colspan="6">没有结果。</td></tr>'}</tbody>
    </table>
  </div>
</div>
</body>
</html>`

  const mdLines = []
  mdLines.push('# FlowTest 批量执行汇总')
  mdLines.push('')
  mdLines.push(`- 总数：${stats.total} · 通过：${stats.passed} · 失败：${stats.failed} · 异常：${stats.error}`)
  mdLines.push(`- 通过率：${stats.passRate} · 总耗时：${formatDuration(stats.totalDurationMs)}`)
  mdLines.push(`- 生成时间：${formatDate(generatedAt)}`)
  mdLines.push('')
  mdLines.push('| 用例 | 状态 | 步骤 | 耗时 | 报告 |')
  mdLines.push('| --- | --- | --- | ---: | --- |')
  for (const row of rows) {
    const link = row.relative ? `[report.html](${row.relative})` : '—'
    mdLines.push(`| ${mdCell(row.result.name)} | ${mdCell(statusLabel(row.status))} | ${mdCell(row.steps)} | ${mdCell(row.duration)} | ${link} |`)
  }
  mdLines.push('')

  await fs.writeFile(summaryHtml, html, 'utf8')
  await fs.writeFile(summaryMd, mdLines.join('\n'), 'utf8')

  return {
    stats,
    results: results.map((result) => ({
      name: result.name,
      file: result.file,
      status: result.status,
      runId: result.summary?.runId || null,
      caseId: result.summary?.caseId || null,
      passedSteps: result.summary?.passedSteps ?? null,
      totalSteps: result.summary?.totalSteps ?? null,
      durationMs: result.summary?.durationMs ?? null,
      passRate: result.summary?.passRate ?? null,
      reportHtml: result.report?.htmlPath || null,
      reportMd: result.report?.mdPath || null,
      error: result.error
    })),
    summaryHtml,
    summaryMd,
    reportBase: options.reportBase
  }
}

function printBatchSummary(batch, results) {
  console.log('')
  console.log(`${bold('批量执行完成')}  共 ${batch.stats.total} 条 · 通过 ${green(batch.stats.passed)} · 失败 ${red(batch.stats.failed)} · 异常 ${yellow(batch.stats.error)}  (${batch.stats.passRate})`)
  console.log(`  总耗时 ${formatDuration(batch.stats.totalDurationMs)}`)
  console.log('')
  for (const result of results) {
    const icon = result.status === 'PASSED' ? green('✓') : red('✗')
    const steps = result.summary ? `${result.summary.passedSteps}/${result.summary.totalSteps}` : '—'
    const duration = result.summary ? formatDuration(result.summary.durationMs) : '—'
    console.log(`  ${icon} ${result.name}  ${dim(`${steps} 步 · ${duration}`)}`)
    if (result.error) {
      console.log(`      ${red(result.error)}`)
    }
  }
  console.log('')
  console.log(`  汇总报告  ${cyan(batch.summaryHtml)}`)
  console.log(`  Markdown  ${batch.summaryMd}`)
  console.log('')
}

// ---------------------------------------------------------------------------
// 报告生成
// ---------------------------------------------------------------------------

async function generateReport(options, detail, meta) {
  const run = detail.run
  const baseName = `run-${String(run.id).padStart(4, '0')}-${slugify(run.caseName || meta.case?.name || 'run')}`
  const reportDir = await uniqueDir(path.join(options.reportBase, baseName))
  const screenshotDir = path.join(reportDir, 'screenshots')
  const artifactDir = path.join(reportDir, 'artifacts')
  await fs.mkdir(screenshotDir, { recursive: true })
  await fs.mkdir(artifactDir, { recursive: true })

  const downloaded = new Map()
  const screenshots = []
  const warnings = []

  for (const artifact of detail.artifacts || []) {
    const endpoint = `/api/runs/${run.id}/artifacts/${artifact.id}/download`
    try {
      const buffer = await api(options, endpoint, { raw: true, timeoutMs: 30000 })
      if (artifact.type === 'SCREENSHOT') {
        const extension = path.extname(artifact.fileName || '') || '.png'
        const index = artifact.stepIndex === null || artifact.stepIndex === undefined
          ? String(artifact.id)
          : String(artifact.stepIndex).padStart(2, '0')
        let fileName = `step-${index}${extension}`
        if (await exists(path.join(screenshotDir, fileName))) {
          fileName = `step-${index}-${artifact.id}${extension}`
        }
        const absolute = path.join(screenshotDir, fileName)
        await fs.writeFile(absolute, buffer)
        const relative = `screenshots/${fileName}`
        downloaded.set(artifact.id, relative)
        screenshots.push({ artifact, relative, fileName })
      } else {
        const safeName = safeFileName(artifact.fileName || `${artifact.type.toLowerCase()}-${artifact.id}`)
        let target = path.join(artifactDir, safeName)
        if (artifact.type === 'LOG' && safeName === 'console.log') {
          target = path.join(reportDir, 'console.log')
        }
        await fs.writeFile(target, buffer)
        downloaded.set(artifact.id, path.relative(reportDir, target).split(path.sep).join('/'))
      }
    } catch (error) {
      warnings.push(`产物 ${artifact.fileName || artifact.id} 下载失败：${error.message}`)
    }
  }

  // 后端 ZIP 也保存一份，方便归档或转发。
  let zipPath = null
  if (!options.noZip) {
    try {
      const buffer = await api(options, `/api/runs/${run.id}/download`, { raw: true, timeoutMs: 60000 })
      const fileName = `flowtest-run-${run.id}.zip`
      zipPath = path.join(reportDir, fileName)
      await fs.writeFile(zipPath, buffer)
    } catch (error) {
      warnings.push(`ZIP 下载失败：${error.message}`)
    }
  }

  // 即使产物下载失败，也从执行详情补一份 console.log / report.json，保证报告完整可读。
  const consolePath = path.join(reportDir, 'console.log')
  if (!(await exists(consolePath))) {
    await fs.writeFile(consolePath, detail.consoleLog || '（无控制台日志）\n', 'utf8')
  }
  const backendReportPath = path.join(artifactDir, 'report.json')
  if (!(await exists(backendReportPath))) {
    await fs.writeFile(backendReportPath, JSON.stringify({
      generatedBy: 'FlowTest CLI',
      generatedAt: new Date().toISOString(),
      run: detail.run,
      steps: detail.steps,
      artifacts: detail.artifacts,
      consoleLog: detail.consoleLog
    }, null, 2), 'utf8')
  }

  const reportData = {
    generatedAt: new Date().toISOString(),
    generator: `FlowTest CLI ${VERSION}`,
    platform: options.baseUrl,
    project: meta.project || null,
    environment: meta.environment || null,
    case: meta.case ? {
      id: meta.case.id,
      name: meta.case.name,
      description: meta.case.description,
      nlInput: meta.case.nlInput || meta.nl || '',
      tags: meta.case.tags,
      priority: meta.case.priority
    } : {
      id: run.caseId,
      name: run.caseName,
      nlInput: meta.nl || ''
    },
    compile: meta.compile || null,
    downloads: {
      screenshots: screenshots.length,
      zip: zipPath ? path.basename(zipPath) : null,
      warnings
    },
    detail
  }
  await fs.writeFile(path.join(reportDir, 'run.json'), JSON.stringify(reportData, null, 2), 'utf8')

  const html = buildHtmlReport(reportData, { screenshots, downloaded, zipFileName: zipPath ? path.basename(zipPath) : null })
  const markdown = buildMarkdownReport(reportData, { screenshots, zipFileName: zipPath ? path.basename(zipPath) : null })
  const htmlPath = path.join(reportDir, 'report.html')
  const mdPath = path.join(reportDir, 'report.md')
  await fs.writeFile(htmlPath, html, 'utf8')
  await fs.writeFile(mdPath, markdown, 'utf8')

  return {
    reportDir,
    htmlPath,
    mdPath,
    zipPath,
    screenshotCount: screenshots.length,
    screenshots,
    warnings
  }
}

function safeFileName(value) {
  const base = path.basename(String(value || 'artifact'))
  const sanitized = base.replace(/[\\/:*?"<>|]/g, '_')
  return sanitized || 'artifact'
}

function screenshotIndex(step, artifacts, downloaded) {
  const byId = step.screenshotArtifactId
    ? (artifacts || []).find((artifact) => String(artifact.id) === String(step.screenshotArtifactId))
    : null
  const byStep = (artifacts || []).find((artifact) =>
    artifact.type === 'SCREENSHOT' && String(artifact.stepIndex) === String(step.stepIndex)
  )
  const artifact = byId || byStep
  if (!artifact) return null
  return downloaded.get(artifact.id) || null
}

function buildSummary(detail, report, meta) {
  const run = detail.run
  const steps = detail.steps || []
  const failedSteps = steps.filter((step) => ['FAILED', 'ERROR'].includes(step.status))
  return {
    status: run.status,
    statusLabel: statusLabel(run.status),
    runId: run.id,
    caseId: meta.caseId || run.caseId || null,
    caseName: meta.caseName || run.caseName,
    projectId: meta.project?.id ?? run.projectId,
    projectName: meta.project?.name ?? run.projectName,
    environmentId: meta.environment?.id ?? run.environmentId,
    environmentName: meta.environment?.name ?? run.environmentName,
    totalSteps: run.totalSteps,
    passedSteps: run.passedSteps,
    failedSteps: run.failedSteps,
    skippedSteps: run.skippedSteps,
    passRate: formatPercent(run),
    durationMs: run.durationMs,
    errorMessage: run.errorMessage || null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    reportDir: report.reportDir,
    reportHtml: report.htmlPath,
    reportMd: report.mdPath,
    zip: report.zipPath,
    screenshots: report.screenshotCount,
    failedStepDetails: failedSteps.map((step) => ({
      index: step.stepIndex,
      description: step.description,
      message: step.message,
      expectedValue: step.expectedValue,
      actualValue: step.actualValue
    })),
    warnings: report.warnings
  }
}

function printRunSummary(summary, report, detail) {
  const passed = summary.status === 'PASSED'
  const symbol = passed ? green('✔') : red('✖')
  console.log('')
  console.log(`${symbol} ${bold(passed ? '测试通过' : `测试${summary.statusLabel}`)}  ${summary.caseName}  ${dim(`#${summary.runId}`)}`)
  console.log(`   用例      ${summary.caseId ? `#${summary.caseId}  ` : ''}${summary.caseName}`)
  console.log(`   项目      ${summary.projectName || '—'}  /  ${summary.environmentName || '—'}`)
  console.log(`   步骤      ${summary.passedSteps}/${summary.totalSteps} 通过 · ${summary.failedSteps} 失败 · ${summary.skippedSteps} 跳过  (${summary.passRate})`)
  console.log(`   耗时      ${formatDuration(summary.durationMs)}`)
  if (summary.errorMessage) {
    console.log(`   错误      ${red(summary.errorMessage)}`)
  }
  for (const step of summary.failedStepDetails) {
    console.log(`   ${red('✗')} ${String(step.index).padStart(2, '0')} ${step.description || ''}`)
    if (step.message) console.log(`      ${step.message}`)
    if (step.expectedValue !== null && step.expectedValue !== undefined) {
      console.log(`      期望：${step.expectedValue}`)
    }
    if (step.actualValue !== null && step.actualValue !== undefined) {
      console.log(`      实际：${step.actualValue}`)
    }
  }
  if (summary.warnings?.length) {
    console.log(yellow(`   提示      ${summary.warnings.length} 个产物下载警告，详见报告`))
  }
  console.log('')
  console.log(`   报告      ${cyan(summary.reportHtml)}`)
  console.log(`   Markdown  ${summary.reportMd}`)
  if (summary.zip) console.log(`   产物 ZIP  ${summary.zip}`)
  console.log(`   截图      ${summary.screenshots} 张  ${dim(report.reportDir)}`)
  console.log('')
}

// ---------------------------------------------------------------------------
// HTML / Markdown 报告
// ---------------------------------------------------------------------------

function buildHtmlReport(data, { screenshots, downloaded, zipFileName }) {
  const run = data.detail.run
  const steps = data.detail.steps || []
  const artifacts = data.detail.artifacts || []
  const status = statusClass(run.status)
  const warnings = data.downloads?.warnings || []
  const compile = data.compile
  const nl = data.case?.nlInput || ''
  const passed = Number(run.passedSteps || 0)
  const total = Number(run.totalSteps || 0)
  const percent = total ? Math.round((passed / total) * 100) : (run.status === 'PASSED' ? 100 : 0)

  const stepRows = steps.map((step) => {
    const screenshot = screenshotIndex(step, artifacts, downloaded)
    const values = []
    if (step.selector) values.push(`<span class="param"><b>选择器</b> ${htmlEscape(step.selector)}</span>`)
    if (step.value) values.push(`<span class="param"><b>参数</b> ${htmlEscape(step.value)}</span>`)
    if (step.expectedValue !== null && step.expectedValue !== undefined) {
      values.push(`<span class="param"><b>期望</b> ${htmlEscape(step.expectedValue)}</span>`)
    }
    if (step.actualValue !== null && step.actualValue !== undefined) {
      values.push(`<span class="param ${step.status === 'FAILED' ? 'bad' : ''}"><b>实际</b> ${htmlEscape(step.actualValue)}</span>`)
    }
    return `
      <tr class="step-row ${statusClass(step.status)}">
        <td class="num">${step.stepIndex}</td>
        <td>
          <div class="step-title">${htmlEscape(step.description || actionLabel(step.action))}</div>
          <div class="step-action">${htmlEscape(actionLabel(step.action))} <span class="mono">${htmlEscape(step.action)}</span></div>
          ${values.length ? `<div class="params">${values.join('')}</div>` : ''}
          ${step.message ? `<div class="step-message">${htmlEscape(step.message)}</div>` : ''}
        </td>
        <td><span class="pill ${statusClass(step.status)}">${htmlEscape(stepStatusLabel(step.status))}</span></td>
        <td class="duration">${htmlEscape(formatDuration(step.durationMs))}</td>
        <td class="shot-cell">${screenshot ? `<a href="${htmlEscape(screenshot)}" target="_blank" rel="noreferrer"><img class="thumb" src="${htmlEscape(screenshot)}" alt="步骤 ${step.stepIndex} 截图"></a>` : '<span class="muted">—</span>'}</td>
      </tr>`
  }).join('')

  const gallery = screenshots.length
    ? screenshots.map((shot) => {
      const step = shotsStep(shot.artifact, steps)
      const title = step ? `步骤 ${step.stepIndex} · ${step.description || actionLabel(step.action)}` : (shot.artifact.fileName || '截图')
      return `
        <figure class="shot">
          <a href="${htmlEscape(shot.relative)}" target="_blank" rel="noreferrer">
            <img src="${htmlEscape(shot.relative)}" alt="${htmlEscape(title)}" loading="lazy">
          </a>
          <figcaption>${htmlEscape(title)}</figcaption>
        </figure>`
    }).join('')
    : '<p class="empty">本次执行没有截图产物。</p>'

  const warningBlock = warnings.length
    ? `<section class="card warn-card"><h2>产物下载提示</h2><ul>${warnings.map((warning) => `<li>${htmlEscape(warning)}</li>`).join('')}</ul></section>`
    : ''

  const compileBlock = compile
    ? `<section class="card">
        <h2>编译信息</h2>
        <div class="compile-meta">
          <span>${htmlEscape(compile.engine || '规则引擎')}</span>
          <span>${htmlEscape(compile.summary || '')}</span>
        </div>
        ${Array.isArray(compile.warnings) && compile.warnings.length
      ? `<ul class="compile-warnings">${compile.warnings.map((warning) => `<li>${htmlEscape(warning)}</li>`).join('')}</ul>`
      : ''}
      </section>`
    : ''

  const sourceBlock = nl
    ? `<section class="card">
        <details open>
          <summary><h2>自然语言源</h2></summary>
          <pre class="source">${htmlEscape(nl)}</pre>
        </details>
      </section>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="FlowTest CLI ${VERSION}">
  <title>${htmlEscape(`FlowTest 报告 · ${run.caseName} · #${run.id}`)}</title>
  <style>
    :root {
      --bg: #f3f5fb;
      --panel: #ffffff;
      --ink: #14172a;
      --muted: #6d7288;
      --line: #e6e9f3;
      --primary: #4f46e5;
      --primary-soft: #eef0ff;
      --ok: #12805c;
      --ok-soft: #e5f7ef;
      --bad: #b42318;
      --bad-soft: #fdecea;
      --warn: #9a5b00;
      --warn-soft: #fff5dc;
      --shadow: 0 16px 40px rgba(26, 32, 68, .08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 0%, #e8e9ff 0, transparent 32rem),
        radial-gradient(circle at 100% 5%, #e7f7ff 0, transparent 34rem),
        var(--bg);
      font: 14px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .wrap { width: min(1180px, calc(100% - 40px)); margin: 32px auto 64px; }
    .hero {
      position: relative;
      overflow: hidden;
      border-radius: 24px;
      padding: 34px 38px;
      color: #fff;
      background: linear-gradient(125deg, #171b3a 0%, #272c62 55%, #4338ca 100%);
      box-shadow: var(--shadow);
    }
    .hero::after {
      content: "";
      position: absolute;
      width: 340px; height: 340px; right: -110px; top: -190px;
      border-radius: 50%; background: rgba(116, 126, 255, .24);
      filter: blur(4px);
    }
    .eyebrow { display: flex; gap: 10px; align-items: center; color: #bfc4ff; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #8ef0c9; box-shadow: 0 0 0 4px rgba(142,240,201,.14); }
    h1 { margin: 14px 0 6px; font-size: clamp(24px, 3vw, 38px); line-height: 1.2; letter-spacing: -.02em; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 12px 22px; color: #c6c9e9; font-size: 13px; }
    .hero-actions { position: relative; z-index: 1; margin-top: 22px; display: flex; flex-wrap: wrap; gap: 10px; }
    .button {
      display: inline-flex; align-items: center; gap: 7px;
      border: 1px solid rgba(255,255,255,.22); color: #fff; text-decoration: none;
      padding: 8px 14px; border-radius: 10px; font-size: 12.5px; background: rgba(255,255,255,.08);
    }
    .button:hover { background: rgba(255,255,255,.16); }
    .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: 18px 0; }
    .metric { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 15px 16px; box-shadow: 0 8px 20px rgba(26,32,68,.03); }
    .metric .label { color: var(--muted); font-size: 11px; letter-spacing: .04em; }
    .metric .value { margin-top: 4px; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
    .metric .value.small { font-size: 15px; }
    .metric .note { color: var(--muted); font-size: 11px; margin-top: 2px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 22px 24px; margin: 16px 0; box-shadow: 0 8px 24px rgba(26,32,68,.035); }
    .card h2 { margin: 0 0 14px; font-size: 16px; letter-spacing: -.01em; }
    .card details summary { cursor: pointer; list-style: none; }
    .card details summary::-webkit-details-marker { display: none; }
    .card details summary h2 { display: inline-block; margin-bottom: 0; }
    .alert { border-radius: 14px; padding: 14px 16px; margin: 16px 0; background: var(--bad-soft); border: 1px solid #f5c7c2; color: var(--bad); }
    .alert b { display: block; margin-bottom: 3px; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 9px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
    .pill.passed { background: var(--ok-soft); color: var(--ok); }
    .pill.failed, .pill.error { background: var(--bad-soft); color: var(--bad); }
    .pill.cancelled { background: var(--warn-soft); color: var(--warn); }
    .pill.running { background: var(--primary-soft); color: var(--primary); }
    .pill.queued, .pill.pending, .pill.skipped { background: #eef0f6; color: var(--muted); }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; min-width: 840px; }
    th, td { padding: 12px 13px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
    th { background: #fafbff; color: var(--muted); font-size: 11px; letter-spacing: .05em; font-weight: 600; }
    tr:last-child td { border-bottom: 0; }
    .step-row.failed, .step-row.error { background: #fffafa; }
    .num { width: 40px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .step-title { font-weight: 600; }
    .step-action { color: var(--muted); font-size: 11.5px; margin-top: 2px; }
    .mono, .source, .console { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .step-action .mono { font-size: 10.5px; background: #f1f3fa; border-radius: 5px; padding: 1px 4px; }
    .params { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 6px; }
    .param { font-size: 11.5px; color: #4f5570; background: #f7f8fc; border: 1px solid #eef0f7; border-radius: 6px; padding: 2px 7px; }
    .param b { color: #9aa0b8; font-weight: 500; margin-right: 3px; }
    .param.bad { color: var(--bad); background: var(--bad-soft); border-color: #f5c7c2; }
    .step-message { margin-top: 6px; font-size: 12px; color: #555b74; }
    .duration { width: 74px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .shot-cell { width: 160px; }
    .thumb { width: 140px; height: 80px; object-fit: cover; border-radius: 7px; border: 1px solid var(--line); display: block; }
    .muted { color: var(--muted); }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .shot { margin: 0; background: #fafbff; border: 1px solid var(--line); border-radius: 12px; padding: 8px; }
    .shot img { width: 100%; height: 180px; object-fit: cover; object-position: top; border-radius: 8px; display: block; background: #eef1fa; }
    .shot figcaption { color: var(--muted); font-size: 11.5px; padding: 7px 3px 2px; }
    .empty { color: var(--muted); }
    .compile-meta { display: flex; flex-wrap: wrap; gap: 6px; }
    .compile-meta span { background: #f4f5fb; border-radius: 7px; padding: 3px 8px; font-size: 12px; color: #5f6580; }
    .compile-warnings, .warn-card ul { margin: 10px 0 0; padding-left: 20px; color: var(--warn); }
    .source { margin: 12px 0 0; padding: 13px 14px; border-radius: 10px; background: #f7f8fc; border: 1px solid var(--line); white-space: pre-wrap; word-break: break-word; font-size: 12px; }
    .console { margin: 0; padding: 14px 16px; max-height: 420px; overflow: auto; border-radius: 10px; background: #11152a; color: #d9def7; font-size: 11.5px; line-height: 1.7; white-space: pre-wrap; }
    .links { display: flex; flex-wrap: wrap; gap: 8px; }
    .links a { color: var(--primary); background: var(--primary-soft); border-radius: 8px; padding: 7px 11px; text-decoration: none; font-size: 12.5px; }
    .links a:hover { text-decoration: underline; }
    .warn-card { border-color: #f0dfb4; background: #fffdf6; }
    footer { margin-top: 28px; color: var(--muted); font-size: 11.5px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    @media (max-width: 900px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
      .hero { padding: 26px 22px; }
      .wrap { width: min(100% - 24px, 1180px); margin-top: 16px; }
    }
    @media print {
      body { background: #fff; }
      .wrap { width: 100%; margin: 0; }
      .hero { border-radius: 0; box-shadow: none; }
      .card, .metric { break-inside: avoid; box-shadow: none; }
      .button, .hero-actions { display: none; }
    }
  </style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <div class="eyebrow"><span class="dot"></span> FlowTest 灵测 · EXECUTION REPORT</div>
    <h1>${htmlEscape(run.caseName)}</h1>
    <div class="hero-meta">
      <span>执行 #${run.id}</span>
      <span>${htmlEscape(run.projectName || '—')} / ${htmlEscape(run.environmentName || '—')}</span>
      <span>${htmlEscape(formatDate(run.startedAt))}</span>
      <span class="pill ${status}">${htmlEscape(statusLabel(run.status))}</span>
    </div>
    <div class="hero-actions">
      <a class="button" href="run.json">查看原始执行数据</a>
      <a class="button" href="report.md">Markdown 报告</a>
      ${zipFileName ? `<a class="button" href="${htmlEscape(zipFileName)}">下载产物 ZIP</a>` : ''}
    </div>
  </header>

  <section class="grid">
    <div class="metric"><div class="label">执行状态</div><div class="value"><span class="pill ${status}">${htmlEscape(statusLabel(run.status))}</span></div><div class="note">${htmlEscape(run.triggerType || 'MANUAL')} · ${run.attempt}/${run.maxAttempts} 次尝试</div></div>
    <div class="metric"><div class="label">步骤通过</div><div class="value">${passed}/${total}</div><div class="note">失败 ${run.failedSteps} · 跳过 ${run.skippedSteps}</div></div>
    <div class="metric"><div class="label">通过率</div><div class="value">${percent}%</div><div class="note">${htmlEscape(formatPercent(run))}</div></div>
    <div class="metric"><div class="label">总耗时</div><div class="value">${htmlEscape(formatDuration(run.durationMs))}</div><div class="note">${htmlEscape(formatDate(run.finishedAt))}</div></div>
    <div class="metric"><div class="label">项目</div><div class="value small">${htmlEscape(run.projectName || '—')}</div><div class="note">${htmlEscape(run.environmentName || '—')}</div></div>
    <div class="metric"><div class="label">发起人</div><div class="value small">${htmlEscape(run.requestedBy || '—')}</div><div class="note">${htmlEscape(formatDate(data.generatedAt))} 生成</div></div>
  </section>

  ${run.errorMessage ? `<div class="alert"><b>执行错误</b>${htmlEscape(run.errorMessage)}</div>` : ''}

  ${compileBlock}
  ${sourceBlock}

  <section class="card">
    <h2>步骤明细</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>动作与结果</th><th>状态</th><th>耗时</th><th>截图</th></tr></thead>
        <tbody>${stepRows || '<tr><td colspan="5" class="muted">没有步骤记录。</td></tr>'}</tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <h2>截图时间线</h2>
    <div class="gallery">${gallery}</div>
  </section>

  ${warningBlock}

  <section class="card">
    <h2>报告与产物</h2>
    <div class="links">
      <a href="artifacts/report.json">report.json</a>
      <a href="console.log">console.log</a>
      ${zipFileName ? `<a href="${htmlEscape(zipFileName)}">flowtest-run-${run.id}.zip</a>` : ''}
    </div>
  </section>

  <section class="card">
    <h2>控制台日志</h2>
    <pre class="console">${htmlEscape(data.detail.consoleLog || '（无控制台日志）')}</pre>
  </section>

  <footer>
    <span>由 FlowTest CLI ${VERSION} 于 ${htmlEscape(formatDate(data.generatedAt))} 生成</span>
    <span>${htmlEscape(data.platform)}</span>
  </footer>
</div>
</body>
</html>`
}

function shotsStep(artifact, steps) {
  return (steps || []).find((step) => String(step.stepIndex) === String(artifact.stepIndex))
}

function buildMarkdownReport(data, { screenshots, zipFileName }) {
  const run = data.detail.run
  const steps = data.detail.steps || []
  const lines = []
  lines.push(`# FlowTest 测试报告：${run.caseName}`)
  lines.push('')
  lines.push(`- 执行编号：**#${run.id}**`)
  lines.push(`- 状态：**${statusLabel(run.status)}**`)
  lines.push(`- 项目 / 环境：${run.projectName || '—'} / ${run.environmentName || '—'}`)
  lines.push(`- 步骤：${run.passedSteps}/${run.totalSteps} 通过 · ${run.failedSteps} 失败 · ${run.skippedSteps} 跳过`)
  lines.push(`- 通过率：${formatPercent(run)}`)
  lines.push(`- 总耗时：${formatDuration(run.durationMs)}`)
  lines.push(`- 开始时间：${formatDate(run.startedAt)}`)
  lines.push(`- 结束时间：${formatDate(run.finishedAt)}`)
  lines.push(`- 生成时间：${formatDate(data.generatedAt)}`)
  if (run.errorMessage) lines.push(`- 错误：${run.errorMessage}`)
  lines.push('')
  if (data.case?.nlInput) {
    lines.push('## 自然语言源')
    lines.push('')
    lines.push('```text')
    lines.push(data.case.nlInput)
    lines.push('```')
    lines.push('')
  }
  if (data.compile) {
    lines.push('## 编译信息')
    lines.push('')
    lines.push(`- 引擎：${data.compile.engine || '规则引擎'}`)
    lines.push(`- 摘要：${data.compile.summary || '—'}`)
    lines.push(`- 步骤数：${data.compile.steps?.length || 0}`)
    if (data.compile.warnings?.length) {
      lines.push(`- 警告：${data.compile.warnings.join('；')}`)
    }
    lines.push('')
  }
  lines.push('## 步骤明细')
  lines.push('')
  lines.push('| # | 动作 | 描述 | 状态 | 耗时 | 结果 |')
  lines.push('| ---: | --- | --- | --- | ---: | --- |')
  for (const step of steps) {
    lines.push(`| ${step.stepIndex} | ${mdCell(actionLabel(step.action))} | ${mdCell(step.description)} | ${mdCell(stepStatusLabel(step.status))} | ${mdCell(formatDuration(step.durationMs))} | ${mdCell(step.message || '')} |`)
  }
  lines.push('')
  lines.push('## 截图')
  lines.push('')
  if (screenshots.length) {
    for (const shot of screenshots) {
      const step = shotsStep(shot.artifact, steps)
      const title = step ? `步骤 ${step.stepIndex} · ${step.description || actionLabel(step.action)}` : shot.artifact.fileName
      lines.push(`### ${title}`)
      lines.push('')
      lines.push(`![${title}](${shot.relative})`)
      lines.push('')
    }
  } else {
    lines.push('本次执行没有截图产物。')
    lines.push('')
  }
  lines.push('## 控制台日志')
  lines.push('')
  lines.push('```text')
  lines.push(data.detail.consoleLog || '（无控制台日志）')
  lines.push('```')
  lines.push('')
  lines.push('## 报告与产物')
  lines.push('')
  lines.push('- [report.json](artifacts/report.json)')
  lines.push('- [console.log](console.log)')
  if (zipFileName) lines.push(`- [${zipFileName}](${zipFileName})`)
  lines.push('')
  lines.push('---')
  lines.push(`由 FlowTest CLI ${VERSION} 生成 · ${data.platform}`)
  lines.push('')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// 打开报告 / 帮助
// ---------------------------------------------------------------------------

async function openFile(filePath) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath]
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', (error) => warn(`无法自动打开报告：${error.message}`))
    child.unref()
  } catch (error) {
    warn(`无法自动打开报告：${error.message}`)
  }
}

function printHelp() {
  console.log(`FlowTest 灵测 CLI v${VERSION}

把中文自然语言编译成可执行测试用例，调用 FlowTest 平台执行真实 Chrome，
并在执行结束后自动生成 HTML / Markdown 测试报告。

用法：
  flowtest run --nl "打开 /demo/index.html\\n断言标题包含 FlowShop" [选项]
  flowtest run --file ./examples/login.nl --name "登录并加购" [选项]
  flowtest run --case 1 [选项]
  flowtest run-all --dir ./cases [--workers 3] [--retry 1]  批量执行目录里的自然语言用例
  flowtest compile --nl "点击 #login-btn" [--json]
  flowtest report --run 2 [--report-dir ./reports] [--open]

常用选项：
  --name <名称>            生成用例的名称
  --description <描述>     用例描述
  --tags <a,b>             用例标签，默认 cli,nl
  --priority <级别>        LOW | MEDIUM | HIGH，默认 MEDIUM
  --project <id|key|name>  项目，默认第一个项目
  --env <id|name>          环境，默认项目默认环境
  --headed                 显示 Chrome 窗口（默认无头）
  --no-screenshot          关闭每步截图（显式“截图”步骤仍会执行）
  --no-save-case           不写入用例库，直接临时执行
  --use-llm                使用平台配置的 LLM 增强编译（默认规则引擎）
  --timeout <秒>           等待执行完成的最长时间，默认 300
  --case-timeout <秒>      用例单步执行超时，默认 120
  --dir <目录>             run-all：扫描目录里的 .nl/.txt/.md 文件
  --workers <数量>         run-all：并发数，默认 3
  --retry <次数>           run-all：失败重试次数，默认 0
  --prefix <前缀>          run-all：用例名称前缀
  --report-dir <目录>      报告输出根目录，默认 flowtest-reports
  --open                   生成后用系统浏览器打开 HTML 报告
  --json                   以 JSON 输出最终摘要（进度写入 stderr）
  --quiet                  静默进度输出
  --no-zip                 不下载后端完整产物 ZIP
  --base-url <url>         平台地址，默认 http://localhost:8080
  --username <用户名>      登录账号，默认 admin
  --password <密码>        登录密码，默认 admin123
  --token <JWT>            直接使用已有 JWT
  -h, --help               显示帮助
  -v, --version            显示版本

环境变量：
  FLOWTEST_BASE_URL        平台地址
  FLOWTEST_USERNAME        登录账号
  FLOWTEST_PASSWORD        登录密码
  FLOWTEST_TOKEN           已有 JWT
  FLOWTEST_PROJECT         默认项目
  FLOWTEST_ENV             默认环境
  FLOWTEST_REPORT_DIR      报告输出根目录

示例：
  cd flowtest
  ./ft run --file cli/examples/login.nl --name "登录 · 搜索 · 加购"
  ./ft run --nl $'打开 /demo/index.html\\n点击 #login-btn' --headed --open
  ./ft run --case 1 --report-dir ./reports --open
  ./ft compile --file cli/examples/login.nl
  ./ft run-all --dir cases --workers 3 --retry 1 --report-dir ./reports

退出码：
  0 执行通过（PASSED）
  1 执行失败 / 异常 / 取消，或 CLI 调用失败
  （run-all：全部用例通过返回 0，任一失败返回 1）
`)
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.version) {
    console.log(`FlowTest CLI ${VERSION}`)
    return 0
  }
  if (args.help) {
    printHelp()
    return 0
  }
  const command = args._[0] || 'run'
  if (command === 'run') return commandRun(args)
  if (command === 'run-all' || command === 'batch') return commandRunAll(args)
  if (command === 'compile') return commandCompile(args)
  if (command === 'report') return commandReport(args)
  if (command === 'help') {
    printHelp()
    return 0
  }
  throw new UserError(`未知命令「${command}」。可用命令：run、run-all、compile、report。`)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    if (error instanceof UserError) {
      console.error(`${red('✖')} ${error.message}`)
    } else {
      console.error(`${red('✖')} ${error.stack || error.message}`)
    }
    process.exitCode = error.exitCode || 1
  })
