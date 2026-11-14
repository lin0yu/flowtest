#!/usr/bin/env node
// FlowTest NL —— 纯 Node 自然语言 Web 自动化 CLI
// 用法：node index.mjs run --file 用例.nl [--headed] [--url ...]
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { compile, summarizeSteps, ACTION_LABELS } from './lib/compiler.mjs'
import { launchBrowser, runCase } from './lib/runner.mjs'
import { buildCaseHtml, buildSummaryHtml, buildSummaryMd, STATUS_LABELS } from './lib/report.mjs'

const VERSION = '1.0.0'
let quiet = false

const BOOLEAN = new Set([
  'help', 'version', 'headed', 'no-screenshot', 'inline', 'json', 'quiet', 'open'
])

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h') { out.help = true; continue }
    if (arg === '-v') { out.version = true; continue }
    if (!arg.startsWith('--')) { out._.push(arg); continue }
    let raw = arg.slice(2)
    let value = null
    const eq = raw.indexOf('=')
    if (eq >= 0) { value = raw.slice(eq + 1); raw = raw.slice(0, eq) }
    const key = raw.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (BOOLEAN.has(raw)) { out[key] = value === null ? true : !['false', '0', 'no'].includes(value.toLowerCase()); continue }
    if (value === null) { value = argv[++i]; if (value === undefined) throw new Error(`参数 --${raw} 缺少值`) }
    if (out[key] === undefined) out[key] = value
    else out[key] = [].concat(out[key], value)
  }
  return out
}

function log(msg) { if (!quiet) console.error(msg) }
function green(s) { return `\x1b[32m${s}\x1b[0m` }
function red(s) { return `\x1b[31m${s}\x1b[0m` }
function yellow(s) { return `\x1b[33m${s}\x1b[0m` }
function dim(s) { return `\x1b[2m${s}\x1b[0m` }

function expandHome(p) {
  if (!p) return p
  if (p === '~') return process.env.HOME || p
  if (p.startsWith('~/')) return path.join(process.env.HOME || '', p.slice(2))
  return p
}

function slugify(value, max = 48) {
  const t = String(value || 'case').replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '')
  return (t || 'case').slice(0, max)
}

async function exists(p) { try { await fs.access(p); return true } catch { return false } }

async function uniqueDir(base) {
  if (!(await exists(base))) return base
  for (let i = 2; i < 1000; i++) { const c = `${base}-${i}`; if (!(await exists(c))) return c }
  return `${base}-${Date.now()}`
}

async function readNl(args) {
  let text = ''
  if (args.file) {
    if (args.file === '-') { for await (const c of process.stdin) text += c }
    else text = await fs.readFile(expandHome(args.file), 'utf8')
  } else {
    text = args.nl || ''
  }
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()
  if (!text) throw new Error('请提供自然语言步骤：--nl "..." 或 --file 用例.nl')
  return text
}

async function loadVars(args) {
  const vars = {}
  if (args.envFile) {
    const json = JSON.parse(await fs.readFile(expandHome(args.envFile), 'utf8'))
    Object.assign(vars, json)
  }
  const list = args.var ? [].concat(args.var) : []
  for (const item of list) {
    const idx = item.indexOf('=')
    if (idx <= 0) throw new Error(`--var 需要 key=value 形式：${item}`)
    vars[item.slice(0, idx).trim()] = item.slice(idx + 1)
  }
  return vars
}

function buildOptions(args) {
  quiet = Boolean(args.quiet || args.json)
  const baseUrl = (args.baseUrl || args.url || '').replace(/\/+$/, '')
  return {
    headless: !args.headed,
    channel: args.browser || 'chrome',
    baseUrl,
    timeoutSeconds: Math.max(1, Number(args.timeout) || 10),
    reportBase: path.resolve(expandHome(args.reportDir || 'reports')),
    screenshotEachStep: !args.noScreenshot,
    inline: Boolean(args.inline),
    workers: Math.max(1, Math.floor(Number(args.workers) || 3)),
    retry: Math.max(0, Math.floor(Number(args.retry) || 0)),
    json: Boolean(args.json),
    open: Boolean(args.open),
    prefix: args.prefix || ''
  }
}

// 实际执行 + 生成报告：返回 { status, steps, durationMs, reportHtmlPath, name }
async function executeCase(options, { name, nl, vars }) {
  const { steps, warnings } = compile(nl)
  for (const w of warnings) log(yellow(`⚠ ${w}`))

  const caseDir = await uniqueDir(path.join(options.reportBase, slugify(name)))
  await fs.mkdir(caseDir, { recursive: true })

  const browser = await launchBrowser({ channel: options.channel, headless: options.headless })
  let result
  try {
    result = await runCase(browser, {
      steps, vars, baseUrl: options.baseUrl,
      timeoutSeconds: options.timeoutSeconds,
      screenshotEachStep: options.screenshotEachStep,
      reportDir: caseDir, inline: options.inline
    })
  } finally {
    await browser.close()
  }

  const report = {
    name,
    status: result.status,
    durationMs: result.durationMs,
    startedAt: new Date().toISOString(),
    steps: result.steps
  }
  const htmlPath = path.join(caseDir, 'report.html')
  await fs.writeFile(htmlPath, buildCaseHtml(report), 'utf8')

  return {
    name,
    status: result.status,
    steps: result.steps,
    durationMs: result.durationMs,
    passed: result.steps.filter((s) => s.status === 'PASSED').length,
    total: result.steps.length,
    reportDir: caseDir,
    reportHtml: htmlPath
  }
}

function printCaseResult(r) {
  const passed = r.status === 'PASSED'
  console.log('')
  console.log(`${passed ? green('✔') : red('✖')} ${passed ? '测试通过' : `测试${STATUS_LABELS[r.status] || r.status}`}  ${r.name}  ${dim(`(${r.passed}/${r.total} 步 · ${(r.durationMs / 1000).toFixed(1)}s)`)}`)
  for (const step of r.steps) {
    if (step.status !== 'PASSED') {
      console.log(`   ${red('✗')} ${String(step.index).padStart(2, '0')} ${step.description}`)
      console.log(`      ${step.message}`)
      if (step.expectedValue !== null && step.expectedValue !== undefined) console.log(`      期望：${step.expectedValue}`)
      if (step.actualValue !== null && step.actualValue !== undefined) console.log(`      实际：${step.actualValue}`)
    }
  }
  console.log(`   报告  ${r.reportHtml}`)
  console.log('')
}

async function commandRun(args) {
  const options = buildOptions(args)
  const nl = await readNl(args)
  const vars = await loadVars(args)
  const name = (args.name || (args.file && args.file !== '-' ? path.basename(args.file).replace(/\.(nl|txt|md)$/i, '') : '用例')) .trim().slice(0, 160)

  log(dim(`浏览器：${options.channel} · ${options.headless ? '隐式(无头)' : '显示(可见)'} · 每步超时 ${options.timeoutSeconds}s`))
  const r = await executeCase(options, { name, nl, vars })

  if (options.json) console.log(JSON.stringify(r, null, 2))
  else printCaseResult(r)

  if (options.open) openFile(r.reportHtml)
  return r.status === 'PASSED' ? 0 : 1
}

async function commandRunAll(args) {
  const options = buildOptions(args)
  const vars = await loadVars(args)

  const files = []
  if (args.dir) {
    const dir = path.resolve(expandHome(args.dir))
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(nl|txt|md)$/i.test(entry.name)) files.push(path.join(dir, entry.name))
    }
  }
  for (const item of args._.slice(1)) if (item && !item.startsWith('--')) files.push(path.resolve(expandHome(item)))
  const unique = [...new Set(files.map((f) => path.resolve(f)))].sort()
  if (!unique.length) throw new Error('没有找到用例文件。请用 --dir 指定目录，或传入文件列表。')

  const tasks = await Promise.all(unique.map(async (file) => {
    const base = path.basename(file).replace(/\.(nl|txt|md)$/i, '')
    const nl = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()
    return { file, name: (options.prefix + base).trim().slice(0, 160) || base, nl }
  }))

  log(dim(`批量执行 ${tasks.length} 条 · 并发 ${options.workers} · 重试 ${options.retry} · ${options.headless ? '隐式' : '显示'}`))
  log('')

  const results = new Array(tasks.length)
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++
      const task = tasks[i]
      let r = null
      for (let attempt = 0; attempt <= options.retry; attempt++) {
        try {
          r = await executeCase(options, { name: task.name, nl: task.nl, vars })
          if (r.status === 'PASSED') break
          if (attempt < options.retry) log(`  ${yellow('↻')} 重试 ${task.name}（${attempt + 1}/${options.retry}）`)
        } catch (e) {
          r = { name: task.name, status: 'ERROR', steps: [], durationMs: 0, passed: 0, total: 0, error: e.message }
          if (attempt < options.retry) log(`  ${yellow('↻')} 重试 ${task.name}（${attempt + 1}/${options.retry}）：${e.message}`)
        }
      }
      results[i] = r
      const icon = r.status === 'PASSED' ? green('✓') : red('✗')
      log(`  ${icon} ${r.name}  ${dim(`${r.passed}/${r.total} 步 · ${(r.durationMs / 1000).toFixed(1)}s`)}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.workers, tasks.length) }, () => worker()))

  const batch = {
    stats: {
      total: results.length,
      passed: results.filter((r) => r.status === 'PASSED').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      error: results.filter((r) => r.status === 'ERROR').length,
      totalDurationMs: results.reduce((s, r) => s + (r.durationMs || 0), 0)
    },
    generatedAt: new Date().toISOString(),
    results: []
  }
  batch.stats.passRate = batch.stats.total ? `${Math.round((batch.stats.passed / batch.stats.total) * 100)}%` : '0%'
  batch.results = results.map((r) => ({
    name: r.name,
    status: r.status,
    steps: `${r.passed}/${r.total}`,
    duration: r.durationMs < 1000 ? `${r.durationMs}ms` : `${(r.durationMs / 1000).toFixed(1)}s`,
    report: r.reportHtml ? path.relative(options.reportBase, r.reportHtml).split(path.sep).join('/') : null,
    error: r.error || ''
  }))

  await fs.mkdir(options.reportBase, { recursive: true })
  const summaryHtml = path.join(options.reportBase, 'summary.html')
  const summaryMd = path.join(options.reportBase, 'summary.md')
  await fs.writeFile(summaryHtml, buildSummaryHtml(batch), 'utf8')
  await fs.writeFile(summaryMd, buildSummaryMd(batch), 'utf8')

  if (options.json) {
    console.log(JSON.stringify({ stats: batch.stats, summaryHtml, summaryMd, results: batch.results }, null, 2))
  } else {
    console.log('')
    console.log(`批量执行完成  共 ${batch.stats.total} 条 · 通过 ${green(batch.stats.passed)} · 失败 ${red(batch.stats.failed)} · 异常 ${yellow(batch.stats.error)}  (${batch.stats.passRate})`)
    console.log(`  汇总报告  ${summaryHtml}`)
    console.log(`  Markdown  ${summaryMd}`)
    console.log('')
  }

  if (options.open) openFile(summaryHtml)
  return batch.stats.passed === batch.stats.total ? 0 : 1
}

async function commandCompile(args) {
  const nl = await readNl(args)
  const { steps, warnings } = compile(nl)
  if (args.json) {
    console.log(JSON.stringify({ steps, warnings, summary: summarizeSteps(steps) }, null, 2))
    return 0
  }
  console.log(`编译结果  ${summarizeSteps(steps)}`)
  if (warnings.length) { console.log(yellow('警告：')); for (const w of warnings) console.log(`  - ${w}`) }
  console.log('')
  for (const s of steps) {
    const params = [s.selector, s.value].filter(Boolean).join('  ')
    console.log(`${String(s.index).padStart(2, '0')}  ${(ACTION_LABELS[s.action] || s.action).padEnd(6)}  ${s.description || ''}${params ? `  ${dim(params)}` : ''}`)
  }
  return 0
}

function openFile(filePath) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath]
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
  } catch {
    // 忽略
  }
}

function printHelp() {
  console.log(`FlowTest NL CLI v${VERSION}

纯 Node 自然语言 Web 自动化工具：自然语言 → 生成用例 → 驱动本机 Chrome 执行 → 每步截图 → 生成 HTML 报告。
不依赖后端、不落数据库，报告直接写本地目录。

用法：
  nltest run --file 用例.nl [--headed] [--url https://xx] [--var k=v]
  nltest run --nl "打开 /login\\n点击 #btn"
  nltest run-all --dir ./cases --workers 3
  nltest compile --file 用例.nl [--json]

常用选项：
  --file <路径>         自然语言用例文件（.nl/.txt/.md）
  --nl <文本>           直接写自然语言
  --name <名称>         用例名称
  --url <地址>          相对地址（goto /xxx）的 Base URL
  --var k=v             变量（可多次），用例里用 \${k} 引用
  --env-file <json>     从 JSON 文件读取变量
  --headed              显示 Chrome 窗口（默认隐式/无头）
  --browser <名字>      浏览器，默认 chrome（也可 msedge）
  --timeout <秒>        每一步超时，默认 10
  --report-dir <目录>   报告目录，默认 reports
  --no-screenshot       关闭每步截图
  --inline              截图内联进 HTML（单文件报告）
  --workers <数量>      run-all 并发数，默认 3
  --retry <次数>        run-all 失败重试次数，默认 0
  --prefix <前缀>       run-all 用例名称前缀
  --open                生成后打开报告
  --json                以 JSON 输出结果
  -h, --help            帮助

变量：
  用例里写 \${user}、\${pwd}，通过 --var user=admin --var pwd=xxx 或 --env-file 传入。

退出码：
  0 全部通过；1 有失败/异常
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.version) { console.log(`FlowTest NL CLI ${VERSION}`); return 0 }
  if (args.help) { printHelp(); return 0 }
  const command = args._[0] || 'run'
  if (command === 'run') return commandRun(args)
  if (command === 'run-all' || command === 'batch') return commandRunAll(args)
  if (command === 'compile') return commandCompile(args)
  if (command === 'help') { printHelp(); return 0 }
  throw new Error(`未知命令「${command}」。可用：run、run-all、compile。`)
}

main()
  .then((code) => { process.exitCode = code })
  .catch((error) => {
    console.error(`${red('✖')} ${error.message || error}`)
    process.exitCode = 1
  })
