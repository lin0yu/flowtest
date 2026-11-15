// Playwright 执行器：驱动本机 Chrome，逐步执行 / 断言 / 截图 / 取证
import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveLocator, resolveRowColumn, resolveFrame, collectDiagnostics, closestMatches, splitCandidates } from './locator.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launchBrowser(browserCfg = {}) {
  const {
    channel = 'chrome', headless = true, viewport = { width: 1440, height: 960 },
    slowMo = 0, ignoreHttpsErrors = false, args = []
  } = browserCfg
  return chromium.launch({
    channel,
    headless: headless ? true : false,
    slowMo: slowMo || 0,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(args || [])],
    ignoreHTTPSErrors: ignoreHttpsErrors
  })
}

export function replaceVars(value, vars = {}) {
  return String(value ?? '').replace(/\$\{([^}]+)\}/g, (whole, key) => {
    if (key in vars) return vars[key]
    if (process.env[key] !== undefined) return process.env[key]
    return whole
  })
}

function pickVisible(locator) {
  return (async () => {
    try {
      const count = Math.min(await locator.count(), 25)
      for (let i = 0; i < count; i++) {
        const el = locator.nth(i)
        if (await el.isVisible().catch(() => false)) return el
      }
    } catch {
      // 忽略
    }
    return locator.first()
  })()
}

async function saveShot(page, index, shot) {
  if (!shot) return null
  try {
    const buffer = await page.screenshot({ fullPage: false })
    if (shot.inline) return { screenshotBase64: buffer.toString('base64') }
    const dir = path.join(shot.reportDir, 'screenshots')
    await fs.mkdir(dir, { recursive: true })
    const fileName = `step-${String(index).padStart(2, '0')}.png`
    await fs.writeFile(path.join(dir, fileName), buffer)
    return { screenshotPath: `screenshots/${fileName}` }
  } catch {
    return null
  }
}

export async function runCase(browser, options) {
  const {
    steps, vars = {}, baseUrl = '',
    timeoutSeconds = 10, navigationTimeoutSeconds = 30,
    screenshotMode = 'each-step', reportDir = '', inline = false,
    stepRetries = 0, failFast = false, storageState = null,
    acceptDownloads = true, browserViewport = { width: 1440, height: 960 }
  } = options

  const context = await browser.newContext({
    viewport: browserViewport,
    acceptDownloads,
    ...(storageState ? { storageState } : {})
  })

  const state = {
    vars: { ...vars },
    baseUrl,
    pages: [],
    current: null,
    frame: null,
    network: [],
    consoleErrors: [],
    downloads: []
  }

  const page = await context.newPage()
  state.pages.push(page)
  state.current = page
  page.setDefaultTimeout(timeoutSeconds * 1000)
  page.setDefaultNavigationTimeout(navigationTimeoutSeconds * 1000)

  page.on('console', (msg) => {
    if (msg.type() === 'error') state.consoleErrors.push(msg.text().slice(0, 500))
  })
  page.on('pageerror', (err) => {
    state.consoleErrors.push(String(err?.message || err).slice(0, 500))
  })
  page.on('response', (res) => {
    state.network.push({ url: res.url(), method: res.request().method(), status: res.status(), ok: res.ok() })
    if (state.network.length > 500) state.network.shift()
  })
  page.on('dialog', async (dialog) => {
    state.consoleErrors.push(`[dialog] ${dialog.type()}: ${dialog.message()}`)
    await dialog.accept().catch(() => {})
  })

  const results = []
  const startedAt = Date.now()
  let traceStarted = false
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
    traceStarted = true
  } catch {
    traceStarted = false
  }

  const artifactsDir = path.join(reportDir, 'artifacts')
  await fs.mkdir(artifactsDir, { recursive: true }).catch(() => {})

  try {
    for (const step of steps) {
      const result = await runStep(state, step, {
        timeoutSeconds, navigationTimeoutSeconds, artifactsDir,
        stepRetries, screenshotMode, reportDir, inline
      })
      results.push(result)
      if (result.status !== 'PASSED') {
        if (failFast) {
          for (const rest of steps.slice(step.index)) {
            results.push({
              index: rest.index, action: rest.action, description: rest.description,
              selector: rest.selector, value: rest.value, status: 'SKIPPED',
              message: '前序步骤失败，已跳过', expectedValue: null, actualValue: null,
              durationMs: 0, screenshotPath: null, screenshotBase64: null
            })
          }
          break
        }
      }
    }
  } finally {
    const status = results.some((r) => r.status === 'ERROR') ? 'ERROR'
      : results.some((r) => r.status === 'FAILED') ? 'FAILED'
        : results.some((r) => r.status === 'SKIPPED') ? 'FAILED'
          : 'PASSED'
    if (traceStarted) {
      const tracePath = path.join(artifactsDir, 'trace.zip')
      await context.tracing.stop({ path: tracePath }).catch(() => {})
    }
    await context.close().catch(() => {})
    return {
      status,
      steps: results,
      durationMs: Date.now() - startedAt,
      vars: state.vars,
      network: state.network,
      consoleErrors: state.consoleErrors,
      downloads: state.downloads
    }
  }
}

async function runStep(state, step, ctx) {
  const startedAt = Date.now()
  const result = {
    index: step.index, action: step.action, description: step.description,
    selector: step.selector, value: step.value,
    status: 'PASSED', message: '', expectedValue: null, actualValue: null,
    durationMs: 0, screenshotPath: null, screenshotBase64: null,
    extracted: null, diagnostics: null
  }

  let attempts = ctx.stepRetries + 1
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      result.message = await execStep(state, step, ctx)
      result.status = 'PASSED'
      lastError = null
      break
    } catch (error) {
      lastError = error
      if (error && error.expected !== undefined) result.expectedValue = error.expected
      if (error && error.actual !== undefined) result.actualValue = error.actual
      if (attempt < attempts - 1) await sleep(ctx.retryBackoffMs ?? 500)
    }
  }

  if (lastError) {
    result.status = step.action.startsWith('assert') ? 'FAILED' : 'ERROR'
    result.message = rootMessage(lastError)
    // 失败取证：DOM 快照 + 可交互元素清单
    try {
      const page = state.current
      if (page && !page.isClosed()) {
        const dom = await page.content().catch(() => '')
        if (dom) {
          const domFile = path.join(ctx.artifactsDir, `dom-step-${String(step.index).padStart(2, '0')}.html`)
          await fs.writeFile(domFile, dom, 'utf8').catch(() => {})
          result.domSnapshot = path.relative(ctx.reportDir, domFile).split(path.sep).join('/')
        }
        const diag = await collectDiagnostics(page).catch(() => [])
        if (diag.length) {
          result.pageElements = diag.slice(0, 30)
          result.suggestions = closestMatches(diag, stripSelector(step.selector)).slice(0, 5)
        }
      }
    } catch {
      // 取证失败不影响结果
    }
  }

  // 每步截图（成功、失败都截）
  const wantShot = ctx.screenshotMode === 'each-step'
    || (ctx.screenshotMode === 'on-failure' && result.status !== 'PASSED')
    || step.action === 'screenshot'
  if (wantShot) {
    const page = state.current
    if (page && !page.isClosed()) {
      const shot = await saveShot(page, result.index, { reportDir: ctx.reportDir, inline: ctx.inline })
      if (shot) Object.assign(result, shot)
    }
  }
  result.durationMs = Date.now() - startedAt
  return result
}

function stripSelector(selector) {
  const parts = splitCandidates(selector)
  for (const part of parts) {
    const m = part.match(/^(?:text|placeholder|aria|title)=(.+)$/)
    if (m) return m[1]
  }
  return parts[0] || ''
}

async function execStep(state, step, ctx) {
  const page = state.current
  const selector = replaceVars(step.selector, state.vars)
  const value = replaceVars(step.value, state.vars)
  const t = ctx.timeoutSeconds * 1000
  const nav = ctx.navigationTimeoutSeconds * 1000
  const scope = state.frame || page

  const locate = async () => {
    if (/\|\s*col=/i.test(selector)) {
      const loc = await resolveRowColumn(page, selector)
      if (loc) return { locator: loc, candidate: selector }
    }
    const found = resolveLocator(scope, selector)
    if (!found) throw new Error(`无法解析选择器：${selector}`)
    return { locator: await pickVisible(found.locator), candidate: found.candidate }
  }

  switch (step.action) {
    case 'goto': {
      const url = resolveUrl(value, state.baseUrl)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: nav })
      return `页面已打开：${url}（${(await page.title()) || ''}）`
    }
    case 'click': {
      const { locator } = await locate()
      await locator.click({ timeout: t })
      return `已点击 ${selector}`
    }
    case 'dblclick': {
      const { locator } = await locate()
      await locator.dblclick({ timeout: t })
      return `已双击 ${selector}`
    }
    case 'fill': {
      const { locator } = await locate()
      await locator.fill(value, { timeout: t })
      return `已在 ${selector} 输入内容`
    }
    case 'press': {
      if (selector) {
        const { locator } = await locate()
        await locator.press(value, { timeout: t })
      } else {
        await page.keyboard.press(value)
      }
      return `已按键 ${value}`
    }
    case 'select': {
      const { locator } = await locate()
      try {
        await locator.selectOption({ label: value }, { timeout: t })
      } catch {
        await locator.selectOption(value, { timeout: t })
      }
      return `已选择 ${value}`
    }
    case 'hover': {
      const { locator } = await locate()
      await locator.hover({ timeout: t })
      return `已悬停 ${selector}`
    }
    case 'check': {
      const { locator } = await locate()
      await locator.check({ timeout: t })
      return `已勾选 ${selector}`
    }
    case 'uncheck': {
      const { locator } = await locate()
      await locator.uncheck({ timeout: t })
      return `已取消勾选 ${selector}`
    }
    case 'scroll': {
      const { locator } = await locate()
      await locator.scrollIntoViewIfNeeded({ timeout: t })
      return `已滚动到 ${selector}`
    }
    case 'wait':
      await sleep(Math.max(0, Number(value) || 0))
      return `已等待 ${value} 毫秒`
    case 'waitFor': {
      const { locator } = await locate()
      if (value === 'hidden') {
        await waitHidden(locator, t)
        return `元素已消失：${selector}`
      }
      await locator.waitFor({ state: 'visible', timeout: t })
      return `元素已出现：${selector}`
    }
    case 'upload': {
      const { locator } = await locate()
      await locator.setInputFiles(value, { timeout: t })
      return `已上传文件 ${value}`
    }
    case 'download': {
      const { locator } = await locate()
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: t }),
        locator.click({ timeout: t })
      ])
      const suggested = download.suggestedFilename()
      const target = path.join(ctx.artifactsDir, `download-${state.downloads.length + 1}-${suggested}`)
      await download.saveAs(target).catch(() => {})
      state.downloads.push({ fileName: suggested, path: path.relative(ctx.reportDir, target).split(path.sep).join('/') })
      return `已下载文件 ${suggested}`
    }
    case 'drag': {
      const source = await locate()
      const targetFound = resolveLocator(scope, value)
      if (!targetFound) throw new Error(`无法解析拖拽目标：${value}`)
      await source.locator.dragTo(await pickVisible(targetFound.locator), { timeout: t })
      return `已拖拽 ${selector} 到 ${value}`
    }
    case 'iframe':
    case 'switchFrame': {
      const frame = resolveFrame(page, selector)
      if (!frame) throw new Error(`未找到 iframe：${selector}`)
      state.frame = frame
      return `已切换到 iframe ${selector}`
    }
    case 'switchTab': {
      const pages = state.pages.filter((p) => !p.isClosed())
      let target = null
      if (/^\d+$/.test(String(value).trim())) {
        target = pages[Number(value.trim()) - 1]
      } else {
        target = pages.find((p) => (p.url() || '').includes(value.trim()))
      }
      if (!target) throw new Error(`未找到标签页：${value}`)
      state.current = target
      state.frame = null
      await target.bringToFront()
      return `已切换到标签页 ${value}`
    }
    case 'newTab': {
      const target = await state.current.context.newPage()
      state.pages.push(target)
      state.current = target
      state.frame = null
      if (value) await target.goto(resolveUrl(value, state.baseUrl), { waitUntil: 'domcontentloaded', timeout: nav })
      return `已新开标签页${value ? '：' + value : ''}`
    }
    case 'closeTab': {
      const current = state.current
      await current.close().catch(() => {})
      const rest = state.pages.filter((p) => !p.isClosed() && p !== current)
      state.current = rest[0] || null
      state.frame = null
      return '已关闭当前标签页'
    }
    case 'refresh':
      await page.reload({ waitUntil: 'domcontentloaded', timeout: nav })
      return '页面已刷新'
    case 'goBack':
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: nav }).catch(() => {})
      return '已后退'
    case 'goForward':
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: nav }).catch(() => {})
      return '已前进'
    case 'extract': {
      const { locator } = await locate()
      let text = ''
      try {
        const inputValue = await locator.inputValue({ timeout: 2000 })
        text = inputValue ?? ''
      } catch {
        text = (await locator.textContent({ timeout: 2000 }).catch(() => '')) || ''
      }
      text = text.trim()
      if (!text) throw new Error(`未能从 ${selector} 取到值`)
      state.vars[value] = text
      return `已取出 ${selector} 的值并存为 ${value}（${truncate(text, 60)}）`
    }
    case 'screenshot':
      return '已截图' + (value ? `：${value}` : '')

    // ===== 断言 =====
    case 'assertText': {
      const actual = await waitContains(async () => page.evaluate(() => document.body ? document.body.innerText : ''), value, t)
      return `断言通过：页面文本包含 ${value}`
    }
    case 'assertTitle': {
      await waitContains(async () => page.title(), value, t)
      return `断言通过：页面标题包含 ${value}`
    }
    case 'assertUrl': {
      await waitContains(async () => page.url(), value, t)
      return `断言通过：当前地址包含 ${value}`
    }
    case 'assertVisible': {
      const { locator } = await locate()
      await locator.waitFor({ state: 'visible', timeout: t })
      return `断言通过：元素可见 ${selector}`
    }
    case 'assertHidden': {
      const { locator } = await locate()
      await waitHidden(locator, t)
      return `断言通过：元素隐藏 ${selector}`
    }
    case 'assertValue': {
      const { locator } = await locate()
      await waitContains(async () => {
        const inputValue = await locator.inputValue().catch(() => null)
        if (inputValue !== null && inputValue !== undefined) return inputValue
        return (await locator.textContent().catch(() => '')) || ''
      }, value, t)
      return `断言通过：${selector} 的值包含 ${value}`
    }
    case 'assertCount': {
      const { locator } = await locate()
      const expected = Number(value)
      const deadline = Date.now() + t
      let actual = -1
      while (Date.now() < deadline) {
        actual = await locator.count()
        if (actual === expected) return `断言通过：${selector} 的数量为 ${expected}`
        await sleep(200)
      }
      throw assertError(`${selector} 的数量期望 ${expected}`, String(expected), String(actual))
    }
    case 'assertAttribute': {
      const [attrName, expected] = String(value).split('|')
      const { locator } = await locate()
      await waitContains(async () => (await locator.getAttribute(attrName).catch(() => null)) || '', expected, t)
      return `断言通过：${selector} 的 ${attrName} 包含 ${expected}`
    }
    case 'assertNetwork': {
      const expected = Number(value)
      const deadline = Date.now() + t
      let matched = null
      while (Date.now() < deadline) {
        matched = state.network
          .filter((r) => r.url.includes(selector))
          .reverse()
          .find((r) => r.status === expected)
        if (matched) break
        await sleep(200)
      }
      if (!matched) {
        const last = state.network.filter((r) => r.url.includes(selector)).slice(-1)[0]
        throw assertError(
          `接口 ${selector} 未出现状态码 ${expected}`,
          String(expected),
          last ? `${last.method} ${last.url} → ${last.status}` : '未捕获到该请求'
        )
      }
      return `断言通过：接口 ${matched.method} ${matched.url} 返回 ${matched.status}`
    }
    default:
      throw new Error(`不支持的动作：${step.action}`)
  }
}

function assertError(message, expected, actual) {
  const error = new Error(message)
  error.expected = expected
  error.actual = actual
  return error
}

async function waitContains(fn, expected, timeout) {
  const deadline = Date.now() + timeout
  let actual = ''
  while (Date.now() < deadline) {
    try {
      actual = (await fn()) || ''
      if (String(actual).includes(expected)) return actual
    } catch {
      // 忽略瞬时异常
    }
    await sleep(200)
  }
  throw assertError(`等待超时，未包含「${expected}」`, expected, truncate(actual, 500))
}

async function waitHidden(locator, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const count = await locator.count()
      let visible = false
      if (count > 0) visible = await locator.first().isVisible().catch(() => false)
      if (!visible) return
    } catch {
      return
    }
    await sleep(200)
  }
  throw assertError('元素在超时时间内仍然可见', 'hidden', 'visible')
}

function resolveUrl(raw, baseUrl) {
  const url = String(raw).trim()
  if (/^https?:\/\//i.test(url)) return url
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error(`当前未配置 Base URL，无法访问相对地址：${url}`)
  if (url.startsWith('/')) return base + url
  return base + '/' + url
}

function truncate(value, max) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function rootMessage(error) {
  let msg = error && error.message ? error.message : String(error)
  if (!msg) return '未知错误'
  // 去掉 Playwright 超时日志里的噪声行，只保留关键信息
  const lines = String(msg).split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^Call log:/i.test(l) && !/^=/.test(l) && !/^-\s/.test(l) && !/^waiting for/i.test(l))
  msg = lines.slice(0, 2).join(' ')
  if (msg.length > 240) msg = msg.slice(0, 240) + '…'
  return msg || '未知错误'
}
