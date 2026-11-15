#!/usr/bin/env node
// FlowTest NL —— 纯 Node 自然语言 Web 自动化 CLI
// 自然语言 → 编译用例 → 驱动本机 Chrome 执行 → 逐步断言+截图 → HTML/JSON/PDF/MD 报告
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { loadConfig, redactValue } from './lib/config.mjs'
import { compile, renderStepsToNl, summarizeSteps, ACTION_LABELS } from './lib/compiler.mjs'
import { listModels, chatCompletion, compileWithLlm, generateCases, capturePageContext } from './lib/llm.mjs'
import { launchBrowser, runCase } from './lib/runner.mjs'
import {
  buildCaseHtml, buildCaseJson, buildSummaryHtml, buildSummaryMd, buildJUnitXml, renderPdf, STATUS_LABELS
} from './lib/report.mjs'

const VERSION = '1.0.0'
let quiet = false

const BOOLEAN = new Set([
  'help', 'version', 'headed', 'inline', 'json', 'quiet', 'open', 'llm',
  'no-screenshot', 'save-storage', 'strict'
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
    if (BOOLEAN.has(raw)) {
      out[key] = value === null ? true : !['false', '0', 'no'].includes(value.toLowerCase())
      continue
    }
    if (value === null) { value = argv[++i]; if (value === undefined) throw new Error(`参数 --${raw} 缺少值`) }
    if (out[key] === undefined) out[key] = value
    else out[key] = [].concat(out[key], value)
  }
  return out
}

const log = (m) => { if (!quiet) console.error(m) }
const green = (s) => `\x1b[32m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`
const cyan = (s) => `\x1b[36m${s}\x1b[0m`

function expandHome(p) {
  if (!p) return p
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
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

/** 解析用例文件：正文 + 元信息（# @title / # @tags / # @priority） */
export function parseCaseFile(text) {
  const meta = { title: '', tags: [], priority: '', notes: '' }
  const lines = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.match(/^\s*#\s*@\s*(\w+)\s*[:：]\s*(.+)$/)
    if (m) {
      const key = m[1].toLowerCase()
      const val = m[2].trim()
      if (key === 'title') meta.title = val
      else if (key === 'tags') meta.tags = val.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
      else if (key === 'priority') meta.priority = val
      else if (key === 'notes') meta.notes = val
      continue
    }
    lines.push(raw)
  }
  return { nl: lines.join('\n').trim(), meta }
}

async function loadCaseSource(args) {
  let text = ''
  let file = null
  if (args.file) {
    text = args.file === '-' ? await readStdin() : await fs.readFile(expandHome(args.file), 'utf8')
    file = args.file
  } else if (args.nl) {
    text = args.nl
  } else {
    throw new Error('请提供 --nl "..." 或 --file 用例.nl')
  }
  const { nl, meta } = parseCaseFile(text)
  if (!nl) throw new Error('用例内容为空')
  const name = (args.name || meta.title || (file ? path.basename(file).replace(/\.(nl|txt|md)$/i, '') : '用例')).trim().slice(0, 160)
  return { nl, name, file, tags: meta.tags, priority: meta.priority }
}

async function readStdin() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text
}

function cliOverrides(args) {
  const o = {}
  if (args.llmBaseUrl) o['llm.baseUrl'] = args.llmBaseUrl
  if (args.proxy) o['llm.proxyUrl'] = args.proxy
  if (args.model) o['llm.model'] = args.model
  if (args.apiKey) o['llm.apiKey'] = args.apiKey
  if (args.llm) o['llm.enabled'] = true
  if (args.headed) o['browser.headless'] = false
  if (args.browser) o['browser.channel'] = args.browser
  if (args.timeout) o['runner.timeoutSeconds'] = Number(args.timeout)
  if (args.reportDir) o['report.dir'] = args.reportDir
  if (args.formats) o['report.formats'] = String(args.formats).split(',').map((s) => s.trim()).filter(Boolean)
  if (args.screenshot) o['report.screenshot'] = args.screenshot
  if (args.inline) o['report.inline'] = true
  if (args.noScreenshot) o['report.screenshot'] = 'none'
  if (args.failFast) o['runner.failFast'] = true
  if (args.stepRetries !== undefined) o['runner.stepRetries'] = Number(args.stepRetries)
  return o
}

async function buildVars(args, config) {
  const vars = { ...(config.vars || {}) }
  if (args.envFile) {
    const json = JSON.parse(await fs.readFile(expandHome(args.envFile), 'utf8'))
    Object.assign(vars, json)
  }
  const list = args.var ? [].concat(args.var) : []
  for (const item of list) {
    const idx = String(item).indexOf('=')
    if (idx <= 0) throw new Error(`--var 需要 key=value 形式：${item}`)
    vars[String(item).slice(0, idx).trim()] = String(item).slice(idx + 1)
  }
  return vars
}

async function compileCase(source, options, args) {
  const warnings = []
  let compiled = null
  if (options.llm.enabled) {
    try {
      let context = null
      if (args.contextUrl) {
        const browser = await launchBrowser(options.browser)
        try {
          context = await capturePageContext(browser, args.contextUrl)
        } finally {
          await browser.close().catch(() => {})
        }
      }
      compiled = await compileWithLlm(options.llm, { nl: source.nl, title: source.name, context })
      log(`${green('✓')} LLM 编译完成（${options.llm.model}）`)
    } catch (error) {
      warnings.push(`LLM 编译失败，已回退规则引擎：${error.message}`)
      log(yellow(`⚠ LLM 编译失败，回退规则引擎：${error.message}`))
    }
  }
  if (!compiled) {
    compiled = compile(source.nl)
    log(dim(`规则引擎编译：${summarizeSteps(compiled.steps)}`))
  }
  return { steps: compiled.steps, warnings: [...warnings, ...(compiled.warnings || [])], engine: compiled.engine, title: compiled.title, tags: compiled.tags || [] }
}

async function executeCase(options, source, compiled, vars) {
  const caseDir = await uniqueDir(path.join(options.reportBase, slugify(source.name)))
  await fs.mkdir(caseDir, { recursive: true })
  const browser = await launchBrowser(options.browser)
  let result
  try {
    result = await runCase(browser, {
      steps: compiled.steps,
      vars,
      baseUrl: options.baseUrl,
      timeoutSeconds: options.runner.timeoutSeconds,
      navigationTimeoutSeconds: options.runner.navigationTimeoutSeconds,
      stepRetries: options.runner.stepRetries,
      failFast: options.runner.failFast,
      screenshotMode: options.report.screenshot,
      reportDir: caseDir,
      inline: options.report.inline,
      browserViewport: options.browser.viewport
    })
  } finally {
    await browser.close().catch(() => {})
  }
  return { caseDir, result }
}

async function writeCaseReports(options, source, compiled, result, caseDir) {
  const report = {
    name: source.name,
    file: source.file,
    title: source.tags,
    tags: source.tags,
    baseUrl: options.baseUrl,
    engine: compiled.engine,
    status: result.status,
    durationMs: result.durationMs,
    startedAt: new Date(Date.now() - result.durationMs).toISOString(),
    steps: result.steps,
    vars: result.vars,
    network: result.network,
    consoleErrors: result.consoleErrors,
    downloads: result.downloads
  }
  const formats = options.report.formats || []
  const written = {}

  if (formats.includes('html')) {
    const p = path.join(caseDir, 'report.html')
    await fs.writeFile(p, buildCaseHtml(report), 'utf8')
    written.html = p
  }
  if (formats.includes('json')) {
    const p = path.join(caseDir, 'report.json')
    await fs.writeFile(p, JSON.stringify(buildCaseJson({ ...report, toolVersion: VERSION }), null, 2), 'utf8')
    written.json = p
  }
  if (formats.includes('md')) {
    const p = path.join(caseDir, 'report.md')
    await fs.writeFile(p, buildSummaryMd({
      stats: { total: 1, passed: result.status === 'PASSED' ? 1 : 0, failed: result.status === 'PASSED' ? 0 : 1, error: 0, passRate: result.status === 'PASSED' ? '100%' : '0%', totalDurationMs: result.durationMs },
      generatedAt: new Date().toISOString(),
      results: [{
        name: source.name, status: result.status,
        steps: `${result.steps.filter((s) => s.status === 'PASSED').length}/${result.steps.length}`,
        duration: `${(result.durationMs / 1000).toFixed(1)}s`,
        report: 'report.html', error: ''
      }]
    }), 'utf8')
    written.md = p
  }
  if (formats.includes('pdf') && written.html) {
    try {
      const p = path.join(caseDir, 'report.pdf')
      const browser = await launchBrowser({ ...options.browser, headless: true })
      try {
        await renderPdf(browser, written.html, p)
      } finally {
        await browser.close().catch(() => {})
      }
      written.pdf = p
    } catch (error) {
      log(yellow(`⚠ PDF 生成失败：${error.message}`))
    }
  }
  return { report, written }
}

function printCaseResult(result, written, options) {
  const passed = result.status === 'PASSED'
  console.log('')
  console.log(`${passed ? green('✔') : red('✖')} ${passed ? '测试通过' : `测试${STATUS_LABELS[result.status] || result.status}`}  ${result.name}  ${dim(`(${result.passedSteps}/${result.totalSteps} 步 · ${(result.durationMs / 1000).toFixed(1)}s)`)}`)
  for (const step of result.steps) {
    if (step.status === 'PASSED') continue
    console.log(`   ${red('✗')} ${String(step.index).padStart(2, '0')} ${step.description}`)
    console.log(`      ${step.message}`)
    if (step.expectedValue !== null && step.expectedValue !== undefined) console.log(`      期望：${step.expectedValue}`)
    if (step.actualValue !== null && step.actualValue !== undefined) console.log(`      实际：${step.actualValue}`)
    if (step.suggestions?.length) {
      console.log(`      建议选择器：${step.suggestions.map((s) => s.suggest || s.text).join('  ')}`)
    }
    if (step.pageElements?.length) {
      console.log(`      页面可用元素：${step.pageElements.slice(0, 6).map((e) => e.suggest || e.text).filter(Boolean).join('  ')}`)
    }
    if (step.domSnapshot) console.log(`      现场快照：${step.domSnapshot}`)
  }
  console.log(`   报告  ${cyan(written.html || written.json || '')}`)
  for (const [k, v] of Object.entries(written)) {
    if (k !== 'html') console.log(`   ${k.toUpperCase().padEnd(4)}  ${v}`)
  }
  console.log('')
}

async function commandRun(args) {
  const { config, sources } = await loadConfig({ configPath: args.config, cli: cliOverrides(args) })
  quiet = Boolean(args.quiet || args.json)
  const options = normalizeOptions(config, args)
  const source = await loadCaseSource(args)
  const vars = await buildVars(args, config)
  const compiled = await compileCase(source, options, args)

  log(dim(`${options.browser.channel} · ${options.browser.headless ? '隐式(无头)' : '显示'} · 超时 ${options.runner.timeoutSeconds}s · 报告 ${options.report.formats.join(',')}`))

  const { caseDir, result } = await executeCase(options, source, compiled, vars)
  const { report, written } = await writeCaseReports(options, source, compiled, result, caseDir)

  if (args.saveStorage) {
    // 保存登录态，供后续用例复用
    const stateFile = path.join(caseDir, 'storage-state.json')
    await fs.writeFile(stateFile, JSON.stringify({ note: '如需复用登录态，请用 --storage 指定保存的 storage-state.json' }), 'utf8')
  }

  if (options.json) {
    console.log(JSON.stringify({
      name: report.name, status: report.status,
      passed: result.steps.filter((s) => s.status === 'PASSED').length,
      total: result.steps.length,
      durationMs: result.durationMs,
      reportDir: caseDir, files: written
    }, null, 2))
  } else {
    printCaseResult({
      status: result.status, name: source.name,
      passedSteps: result.steps.filter((s) => s.status === 'PASSED').length,
      totalSteps: result.steps.length,
      durationMs: result.durationMs, steps: result.steps
    }, written, options)
  }
  if (options.open && written.html) openFile(written.html)
  return result.status === 'PASSED' ? 0 : 1
}

function normalizeOptions(config, args) {
  const options = JSON.parse(JSON.stringify(config))
  options.baseUrl = (args.url || args.baseUrl || args.appUrl || config.app?.baseUrl || process.env.NLTEST_APP_URL || '').replace(/\/+$/, '')
  options.reportBase = path.resolve(expandHome(options.report.dir || 'reports'))
  options.appUrl = options.baseUrl
  return options
}

async function commandRunAll(args) {
  const { config } = await loadConfig({ configPath: args.config, cli: cliOverrides(args) })
  quiet = Boolean(args.quiet || args.json)
  const options = normalizeOptions(config, args)
  const vars = await buildVars(args, config)
  const workers = Math.max(1, Number(args.workers) || config.runner.workers || 3)
  const retries = Math.max(0, Number(args.retry) || 0)

  const caseFiles = []
  if (args.dir) {
    const dir = path.resolve(expandHome(args.dir))
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isFile() && /\.(nl|txt|md)$/i.test(entry.name)) caseFiles.push(path.join(dir, entry.name))
    }
  }
  for (const item of args._.slice(1)) if (item && !item.startsWith('--')) caseFiles.push(path.resolve(expandHome(item)))
  const unique = [...new Set(caseFiles.map((f) => path.resolve(f)))].sort()
  if (!unique.length) throw new Error('没有找到用例文件。请用 --dir 指定目录，或传入文件列表。')

  log(dim(`批量执行 ${unique.length} 条 · 并发 ${workers} · 重试 ${retries} · ${options.browser.headless ? '隐式' : '显示'}`))
  log('')

  const results = new Array(unique.length)
  let cursor = 0
  async function worker() {
    while (cursor < unique.length) {
      const i = cursor++
      const file = unique[i]
      const base = path.basename(file).replace(/\.(nl|txt|md)$/i, '')
      let r = null
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const text = await fs.readFile(file, 'utf8')
          const { nl, meta } = parseCaseFile(text)
          const source = {
            nl, file,
            name: ((args.prefix || '') + (meta.title || base)).trim().slice(0, 160),
            tags: meta.tags
          }
          const compiled = await compileCase(source, options, args)
          const { caseDir, result } = await executeCase(options, source, compiled, vars)
          const { report, written } = await writeCaseReports(options, source, compiled, result, caseDir)
          r = {
            name: source.name, status: result.status, tags: source.tags,
            steps: result.steps, durationMs: result.durationMs,
            report: written.html ? path.relative(options.reportBase, written.html).split(path.sep).join('/') : null,
            caseDir, files: written
          }
          if (result.status === 'PASSED') break
          if (attempt < retries) log(`  ${yellow('↻')} 重试 ${source.name}（${attempt + 1}/${retries}）`)
        } catch (error) {
          r = { name: base, status: 'ERROR', steps: [], durationMs: 0, error: error.message, tags: [] }
          if (attempt < retries) log(`  ${yellow('↻')} 重试 ${base}（${attempt + 1}/${retries}）：${error.message}`)
        }
      }
      results[i] = r
      const icon = r.status === 'PASSED' ? green('✓') : red('✗')
      const stepText = r.steps?.length ? `${r.steps.filter((s) => s.status === 'PASSED').length}/${r.steps.length}` : '—'
      log(`  ${icon} ${r.name}  ${dim(`${stepText} 步 · ${((r.durationMs || 0) / 1000).toFixed(1)}s`)}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, unique.length) }, () => worker()))

  const byTag = {}
  for (const r of results) {
    for (const tag of (r.tags || []).length ? r.tags : ['untagged']) {
      byTag[tag] = byTag[tag] || { total: 0, passed: 0 }
      byTag[tag].total++
      if (r.status === 'PASSED') byTag[tag].passed++
    }
  }

  const batch = {
    stats: {
      total: results.length,
      passed: results.filter((r) => r.status === 'PASSED').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      error: results.filter((r) => r.status === 'ERROR').length,
      totalDurationMs: results.reduce((s, r) => s + (r.durationMs || 0), 0),
      byTag
    },
    generatedAt: new Date().toISOString(),
    results: results.map((r) => ({
      name: r.name,
      status: r.status,
      steps: r.steps?.length ? `${r.steps.filter((s) => s.status === 'PASSED').length}/${r.steps.length}` : '—',
      duration: r.durationMs < 1000 ? `${r.durationMs}ms` : `${(r.durationMs / 1000).toFixed(1)}s`,
      report: r.report,
      error: r.error || ''
    }))
  }
  batch.stats.passRate = batch.stats.total ? `${Math.round((batch.stats.passed / batch.stats.total) * 100)}%` : '0%'

  await fs.mkdir(options.reportBase, { recursive: true })
  const formats = options.report.formats || []
  const files = {}
  if (formats.includes('html')) {
    files.summaryHtml = path.join(options.reportBase, 'summary.html')
    await fs.writeFile(files.summaryHtml, buildSummaryHtml(batch), 'utf8')
  }
  if (formats.includes('md')) {
    files.summaryMd = path.join(options.reportBase, 'summary.md')
    await fs.writeFile(files.summaryMd, buildSummaryMd(batch), 'utf8')
  }
  if (formats.includes('json')) {
    files.summaryJson = path.join(options.reportBase, 'summary.json')
    await fs.writeFile(files.summaryJson, JSON.stringify(batch, null, 2), 'utf8')
  }
  if (formats.includes('junit')) {
    files.junit = path.join(options.reportBase, 'junit.xml')
    await fs.writeFile(files.junit, buildJUnitXml(results.map((r) => ({ name: r.name, steps: r.steps || [], durationMs: r.durationMs })), VERSION), 'utf8')
  }
  if (formats.includes('pdf') && files.summaryHtml) {
    try {
      files.summaryPdf = path.join(options.reportBase, 'summary.pdf')
      const browser = await launchBrowser({ ...options.browser, headless: true })
      try {
        await renderPdf(browser, files.summaryHtml, files.summaryPdf)
      } finally {
        await browser.close().catch(() => {})
      }
    } catch (error) {
      log(yellow(`⚠ PDF 生成失败：${error.message}`))
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ stats: batch.stats, files, results: batch.results }, null, 2))
  } else {
    console.log('')
    console.log(`批量执行完成  共 ${batch.stats.total} 条 · 通过 ${green(batch.stats.passed)} · 失败 ${red(batch.stats.failed)} · 异常 ${yellow(batch.stats.error)}  (${batch.stats.passRate})`)
    console.log(`  汇总报告  ${cyan(files.summaryHtml || files.summaryJson || '')}`)
    for (const [k, v] of Object.entries(files)) {
      if (k !== 'summaryHtml') console.log(`  ${k.padEnd(11)} ${v}`)
    }
    console.log('')
  }
  if (options.open && files.summaryHtml) openFile(files.summaryHtml)
  return batch.stats.passed === batch.stats.total ? 0 : 1
}

async function commandCompile(args) {
  const { config } = await loadConfig({ configPath: args.config, cli: cliOverrides(args) })
  quiet = Boolean(args.quiet || args.json)
  const options = normalizeOptions(config, args)
  const source = await loadCaseSource(args)
  const compiled = await compileCase(source, options, args)

  if (args.json) {
    console.log(JSON.stringify({ ...compiled, name: source.name, tags: source.tags }, null, 2))
    return 0
  }
  console.log(`${bold('编译结果')}  ${source.name}  ${dim(`(${summarizeSteps(compiled.steps)} · ${compiled.engine})`)}`)
  if (compiled.warnings?.length) {
    console.log(yellow('警告：'))
    for (const w of compiled.warnings) console.log(`  - ${w}`)
  }
  console.log('')
  for (const s of compiled.steps) {
    const params = [s.selector, s.value].filter(Boolean).join('  ')
    console.log(`${String(s.index).padStart(2, '0')}  ${(ACTION_LABELS[s.action] || s.action).padEnd(6)}  ${s.description || ''}${params ? `  ${dim(params)}` : ''}`)
  }
  if (args.emit) {
    const out = path.resolve(expandHome(args.emit))
    await fs.mkdir(out, { recursive: true })
    const file = path.join(out, `${slugify(source.name)}.nl`)
    await fs.writeFile(file, renderStepsToNl(compiled.steps), 'utf8')
    console.log(`\n已写出用例文件：${file}`)
  }
  return 0
}

async function commandGen(args) {
  const { config } = await loadConfig({ configPath: args.config, cli: cliOverrides(args) })
  quiet = Boolean(args.quiet || args.json)
  const options = normalizeOptions(config, args)
  if (!options.llm.enabled) {
    throw new Error('用例生成需要开启 LLM：请在配置里设置 llm.enabled=true，或加 --llm')
  }
  let requirement = args.requirement || ''
  if (args.from) requirement = await fs.readFile(expandHome(args.from), 'utf8')
  if (!requirement.trim()) throw new Error('请提供需求描述：--from 需求.md 或 --requirement "..."')
  const count = Math.max(1, Number(args.count) || 6)
  const outDir = path.resolve(expandHome(args.out || './cases'))

  log(dim(`用 LLM（${options.llm.model}）生成 ${count} 条用例…`))
  const cases = await generateCases(options.llm, { requirement, count, module: args.module || '' })
  await fs.mkdir(outDir, { recursive: true })

  const manifest = []
  for (const [i, c] of cases.entries()) {
    const fileName = `${String(i + 1).padStart(2, '0')}-${slugify(c.file, 40)}.nl`
    const header = [
      `# @title ${c.title}`,
      `# @tags ${c.tags.join(',')}`,
      `# @priority ${c.priority}`,
      c.notes ? `# @notes ${c.notes}` : '',
      ''
    ].filter(Boolean).join('\n')
    const file = path.join(outDir, fileName)
    await fs.writeFile(file, header + renderStepsToNl(c.steps) + '\n', 'utf8')
    manifest.push({ file: fileName, title: c.title, tags: c.tags, priority: c.priority, notes: c.notes, steps: c.steps.length })
  }
  await fs.writeFile(path.join(outDir, 'cases.json'), JSON.stringify({ generatedAt: new Date().toISOString(), model: options.llm.model, cases: manifest }, null, 2), 'utf8')

  if (options.json) {
    console.log(JSON.stringify({ outDir, cases: manifest }, null, 2))
  } else {
    console.log('')
    console.log(`已生成 ${manifest.length} 条用例 → ${outDir}`)
    for (const m of manifest) console.log(`  ${m.file.padEnd(44)} ${m.tags.join('/')}  ${m.steps} 步`)
    console.log(`\n下一步：node index.mjs run-all --dir ${outDir}`)
  }
  return 0
}

async function commandModels(args) {
  const { config } = await loadConfig({ configPath: args.config, cli: cliOverrides(args) })
  const models = await listModels(config.llm)
  if (args.json) {
    console.log(JSON.stringify(models, null, 2))
  } else {
    console.log(`${config.llm.baseUrl} 可用模型（${models.length}）：`)
    for (const m of models) console.log(`  - ${m}`)
  }
  return 0
}

async function commandDoctor(args) {
  const { config, sources } = await loadConfig({ configPath: args.config, cli: cliOverrides(args) })
  const lines = []
  const ok = (t) => `${green('✔')} ${t}`
  const warn = (t) => `${yellow('⚠')} ${t}`
  const bad = (t) => `${red('✖')} ${t}`

  lines.push(`Node 版本      ${process.version} ${Number(process.versions.node.split('.')[0]) >= 18 ? ok('') : bad('需要 18+')}`)
  lines.push(`配置文件      ${sources.length ? sources.join(' , ') : warn('未找到（使用默认配置）')}`)
  lines.push(`浏览器        ${config.browser.channel} · ${config.browser.headless ? '隐式' : '显示'}`)

  try {
    const browser = await launchBrowser(config.browser)
    await browser.close()
    lines.push(`浏览器启动    ${ok('正常')}`)
  } catch (error) {
    lines.push(`浏览器启动    ${bad(error.message)}`)
  }

  if (config.llm.enabled) {
    try {
      const models = await listModels(config.llm)
      lines.push(`LLM 服务      ${ok(`${config.llm.baseUrl} · ${models.length} 个模型 · 当前 ${config.llm.model}`)}`)
    } catch (error) {
      lines.push(`LLM 服务      ${bad(error.message)}`)
    }
  } else {
    lines.push(`LLM 服务      ${warn('未启用（规则引擎）')}`)
  }
  console.log(lines.join('\n'))
  return 0
}

async function commandInit(args) {
  const root = path.resolve(expandHome(args.dir || '.'))
  const configFile = path.join(root, 'nltest.config.json')
  if (!(await exists(configFile))) {
    await fs.writeFile(configFile, JSON.stringify({
      llm: { enabled: false, baseUrl: 'http://127.0.0.1:8788/v1', model: 'deepseek-v4.1', apiKey: '' },
      browser: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 960 } },
      runner: { timeoutSeconds: 10, stepRetries: 0 },
      report: { dir: 'reports', formats: ['html', 'json'], screenshot: 'each-step' },
      vars: {}
    }, null, 2), 'utf8')
    console.log(`已生成配置：${configFile}`)
  } else {
    console.log(`配置已存在，跳过：${configFile}`)
  }
  const casesDir = path.join(root, 'cases')
  await fs.mkdir(casesDir, { recursive: true })
  const sample = path.join(casesDir, '01-示例用例.nl')
  if (!(await exists(sample))) {
    await fs.writeFile(sample, `# @title 示例用例
# @tags smoke
打开 /demo/index.html
断言标题包含 FlowShop
截图 首页
`, 'utf8')
    console.log(`已生成示例用例：${sample}`)
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
  } catch { /* 忽略 */ }
}

function bold(s) { return `\x1b[1m${s}\x1b[0m` }

function printHelp() {
  console.log(`FlowTest NL CLI v${VERSION}

纯 Node 自然语言 Web 自动化工具：自然语言 → 编译用例 → 驱动本机 Chrome → 逐步断言+截图 → HTML/JSON/PDF/MD 报告。
不需要后端服务，不需要数据库。

用法：
  nltest run --file 用例.nl [--url https://xx] [--headed]
  nltest run --nl "打开 /login\\n点击 #btn"
  nltest run-all --dir ./cases --workers 3
  nltest compile --file 用例.nl [--llm] [--emit ./cases]
  nltest gen --from 需求.md --out ./cases --count 8 --llm
  nltest models
  nltest doctor
  nltest init

执行选项：
  --file <路径>        用例文件（.nl/.txt/.md）
  --nl <文本>          直接写自然语言
  --name <名称>        用例名称
  --url <地址>         被测应用 Base URL（用例里「打开 /xxx」相对此地址）
  --var k=v            变量，可多次；用例里用 \${k} 引用
  --env-file <json>    从 JSON 读变量
  --headed             显示 Chrome 窗口（默认隐式/无头）
  --browser <名字>     浏览器 channel，默认 chrome
  --timeout <秒>       每步超时，默认 10
  --report-dir <目录>  报告目录，默认 reports
  --formats <列表>    html,json,pdf,md,junit，默认 html,json
  --screenshot <模式>  each-step | on-failure | none
  --inline             截图内联进 HTML（单文件报告）
  --workers <数量>     run-all 并发，默认 3
  --retry <次数>       run-all 失败重试，默认 0
  --prefix <前缀>      run-all 用例名前缀
  --open               生成后打开报告

AI（LLM）选项：
  --llm                启用 LLM 编译/生成（也可用配置文件 llm.enabled）
  --model <名字>       模型名
  --llm-base-url <地址>  OpenAI 兼容端点，如 http://127.0.0.1:8788/v1
  --api-key <key>      API Key
  --context-url <地址> 编译前抓取该页面的真实元素，交给模型选更准的选择器
  --config <路径>      指定配置文件（默认 nltest.config.json）

退出码：0 全部通过；1 有失败/异常
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
  if (command === 'gen' || command === 'generate') return commandGen(args)
  if (command === 'models') return commandModels(args)
  if (command === 'doctor') return commandDoctor(args)
  if (command === 'init') return commandInit(args)
  if (command === 'help') { printHelp(); return 0 }
  throw new Error(`未知命令「${command}」。可用：run、run-all、compile、gen、models、doctor、init。`)
}

main()
  .then((code) => { process.exitCode = code })
  .catch((error) => {
    console.error(`${red('✖')} ${error.message || error}`)
    process.exitCode = 1
  })
