// Playwright 执行器：驱动本机 Chrome，逐步执行 + 断言 + 截图
import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launchBrowser({ channel = 'chrome', headless = true } = {}) {
  return chromium.launch({
    channel,
    headless: headless ? true : false,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
}

export function replaceVars(value, vars = {}) {
  return String(value ?? '').replace(/\$\{([^}]+)\}/g, (whole, key) => {
    if (key in vars) return vars[key]
    if (process.env[key] !== undefined) return process.env[key]
    return whole
  })
}

function toLocator(page, selector) {
  const s = String(selector).trim()
  if (s.startsWith('text=')) return page.getByText(s.slice(5)).first()
  if (s.startsWith('placeholder=')) return page.getByPlaceholder(s.slice('placeholder='.length)).first()
  if (s.startsWith('data-testid=')) return page.locator(`[data-testid="${attr(s.slice('data-testid='.length))}"]`).first()
  if (s.startsWith('id=')) return page.locator(`#${cssId(s.slice(3))}`).first()
  if (s.startsWith('name=')) return page.locator(`[name="${attr(s.slice(5))}"]`).first()
  if (s.startsWith('css=')) return page.locator(s.slice(4)).first()
  if (s.startsWith('xpath=')) return page.locator(s.slice(6)).first()
  if (s.startsWith('//') || s.startsWith('(//')) return page.locator(s).first()
  if (s.startsWith('#') || s.startsWith('.') || s.startsWith('[') || s.includes('>') || /\s/.test(s)) {
    return page.locator(s).first()
  }
  return page.getByText(s).first()
}

function attr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
function cssId(value) {
  // 简单 id 直接返回；含特殊字符用 CSS.escape（Node 环境可用）
  return String(value)
}

function rootMessage(error) {
  let msg = error && error.message ? error.message : String(error)
  if (msg) {
    msg = msg.split('\n')[0]
    if (msg.length > 300) msg = msg.slice(0, 300) + '…'
  }
  return msg || '未知错误'
}

async function saveShot(page, index, shot) {
  if (!shot) return null
  try {
    const buffer = await page.screenshot()
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
    steps, vars = {}, baseUrl = '', timeoutSeconds = 10,
    screenshotEachStep = true, reportDir = '', inline = false
  } = options

  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  page.setDefaultTimeout(timeoutSeconds * 1000)
  const results = []
  const startedAt = Date.now()

  try {
    for (const step of steps) {
      const t0 = Date.now()
      const result = {
        index: step.index, action: step.action, description: step.description,
        selector: step.selector, value: step.value, status: 'PASSED', message: '',
        expectedValue: null, actualValue: null, durationMs: 0,
        screenshotPath: null, screenshotBase64: null
      }
      try {
        result.message = await execStep(page, step, { vars, baseUrl, timeoutSeconds })
      } catch (error) {
        result.status = step.action.startsWith('assert') ? 'FAILED' : 'ERROR'
        result.message = rootMessage(error)
        if (error && error.expected !== undefined) result.expectedValue = error.expected
        if (error && error.actual !== undefined) result.actualValue = error.actual
      }
      const needShot = screenshotEachStep || step.action === 'screenshot'
      if (needShot) {
        const shot = await saveShot(page, result.index, { reportDir, inline })
        if (shot) Object.assign(result, shot)
      }
      result.durationMs = Date.now() - t0
      results.push(result)
    }
  } finally {
    await context.close()
  }

  const status = results.some((r) => r.status === 'ERROR') ? 'ERROR'
    : results.some((r) => r.status === 'FAILED') ? 'FAILED'
      : 'PASSED'
  return { status, steps: results, durationMs: Date.now() - startedAt }
}

async function execStep(page, step, ctx) {
  const { vars, baseUrl, timeoutSeconds } = ctx
  const selector = replaceVars(step.selector, vars)
  const value = replaceVars(step.value, vars)
  const t = timeoutSeconds * 1000

  switch (step.action) {
    case 'goto': {
      const url = resolveUrl(value, baseUrl)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(t, 15000) })
      return `页面已打开：${url}（${(await page.title()) || ''}）`
    }
    case 'click': {
      await toLocator(page, selector).click({ timeout: t })
      return `已点击 ${selector}`
    }
    case 'fill': {
      await toLocator(page, selector).fill(value, { timeout: t })
      return `已在 ${selector} 输入内容`
    }
    case 'press': {
      if (selector) await toLocator(page, selector).press(value, { timeout: t })
      else await page.keyboard.press(value)
      return `已按键 ${value}`
    }
    case 'select': {
      const locator = toLocator(page, selector)
      try {
        await locator.selectOption({ label: value }, { timeout: t })
      } catch {
        await locator.selectOption(value, { timeout: t })
      }
      return `已选择 ${value}`
    }
    case 'hover':
      await toLocator(page, selector).hover({ timeout: t })
      return `已悬停 ${selector}`
    case 'check':
      await toLocator(page, selector).check({ timeout: t })
      return `已勾选 ${selector}`
    case 'uncheck':
      await toLocator(page, selector).uncheck({ timeout: t })
      return `已取消勾选 ${selector}`
    case 'scroll':
      await toLocator(page, selector).scrollIntoViewIfNeeded({ timeout: t })
      return `已滚动到 ${selector}`
    case 'wait':
      await sleep(Math.max(0, Number(value) || 0))
      return `已等待 ${value} 毫秒`
    case 'waitFor': {
      const locator = toLocator(page, selector)
      if (value === 'hidden') {
        await waitHidden(locator, t)
        return `元素已消失：${selector}`
      }
      await locator.waitFor({ state: 'visible', timeout: t })
      return `元素已出现：${selector}`
    }
    case 'upload': {
      await toLocator(page, selector).setInputFiles(value, { timeout: t })
      return `已上传文件 ${value}`
    }
    case 'screenshot':
      return '已截图' + (value ? `：${value}` : '')

    // ---- 断言 ----
    case 'assertText': {
      try {
        await page.waitForFunction(
          (exp) => document.body && document.body.innerText.includes(exp),
          value, { timeout: t }
        )
      } catch {
        const actual = (await page.evaluate(() => document.body ? document.body.innerText : '')).slice(0, 500)
        throw assertError(`页面文本未包含「${value}」`, value, actual)
      }
      return `断言通过：页面文本包含 ${value}`
    }
    case 'assertTitle': {
      const actual = await waitContains(async () => page.title(), value, t)
      return `断言通过：页面标题包含 ${value}`
    }
    case 'assertUrl': {
      const actual = await waitContains(async () => page.url(), value, t)
      return `断言通过：当前地址包含 ${value}`
    }
    case 'assertVisible': {
      await toLocator(page, selector).waitFor({ state: 'visible', timeout: t })
      return `断言通过：元素可见 ${selector}`
    }
    case 'assertHidden': {
      await waitHidden(toLocator(page, selector), t)
      return `断言通过：元素隐藏 ${selector}`
    }
    case 'assertValue': {
      const locator = toLocator(page, selector)
      const actual = await waitContains(async () => {
        try {
          const el = locator.first()
          const v = await el.inputValue().catch(() => null)
          if (v !== null && v !== undefined) return v
          const txt = await el.textContent().catch(() => '')
          return (txt || '').trim()
        } catch {
          return ''
        }
      }, value, t)
      return `断言通过：${selector} 的值包含 ${value}`
    }
    case 'assertCount': {
      const locator = toLocator(page, selector)
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
      if (actual.includes(expected)) return actual
    } catch {
      // 忽略瞬时异常
    }
    await sleep(200)
  }
  throw assertError(`等待超时，未包含「${expected}」`, expected, actual.slice(0, 500))
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
