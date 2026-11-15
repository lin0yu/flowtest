// OpenAI 兼容的 LLM 客户端 + 自然语言编译 + 用例批量生成
// 端点全部来自配置（llm.baseUrl / llm.model / llm.apiKey），连不上时由调用方回退规则引擎
import { SUPPORTED_ACTIONS, NEEDS_SELECTOR, NEEDS_VALUE } from './compiler.mjs'

export async function listModels(llm) {
  const url = `${trimSlash(llm.baseUrl)}/models`
  let res
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(llm)
    })
  } catch (error) {
    throw new Error(`无法连接 LLM 服务 ${llm.baseUrl}（${error.message}）。请确认服务已启动，并检查配置 llm.baseUrl。`)
  }
  if (!res.ok) {
    throw new Error(`获取模型列表失败（HTTP ${res.status}）：${(await res.text()).slice(0, 200)}`)
  }
  const json = await res.json()
  const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : [])
  return list.map((m) => m.id || m.name).filter(Boolean)
}

export async function chatCompletion(llm, messages, { temperature, maxTokens, jsonMode } = {}) {
  const url = `${trimSlash(llm.baseUrl)}/chat/completions`
  const body = {
    model: llm.model,
    messages,
    temperature: temperature ?? llm.temperature ?? 0.2,
    max_tokens: maxTokens ?? llm.maxTokens ?? 4000,
    stream: false
  }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), llm.timeoutMs ?? 60000)
  try {
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(llm, true),
        body: JSON.stringify(body),
        signal: controller.signal
      })
    } catch (error) {
      if (error.name === 'AbortError') throw error
      throw new Error(`无法连接 LLM 服务 ${llm.baseUrl}（${error.message}）。请确认服务已启动，并检查配置 llm.baseUrl。`)
    }
    if (!res.ok) {
      throw new Error(`LLM 调用失败（HTTP ${res.status}）：${(await res.text()).slice(0, 300)}`)
    }
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
      ?? json?.choices?.[0]?.text
      ?? ''
    if (!content) throw new Error('LLM 返回内容为空')
    return String(content)
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`LLM 调用超时（${llm.timeoutMs}ms）`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function buildHeaders(llm, withJson = false) {
  const headers = { 'Content-Type': 'application/json', ...(llm.headers || {}) }
  if (withJson) headers['Content-Type'] = 'application/json'
  if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`
  return headers
}

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '')
}

export function extractJson(text) {
  let raw = String(text || '').trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) raw = fence[1].trim()
  const firstObj = raw.indexOf('{')
  const firstArr = raw.indexOf('[')
  let start = -1
  if (firstObj >= 0 && firstArr >= 0) start = Math.min(firstObj, firstArr)
  else start = Math.max(firstObj, firstArr)
  if (start < 0) throw new Error('LLM 输出中找不到 JSON')
  const open = raw[start]
  const close = open === '{' ? '}' : ']'
  const end = raw.lastIndexOf(close)
  if (end <= start) throw new Error('LLM 输出 JSON 不完整')
  return JSON.parse(raw.slice(start, end + 1))
}

export function validateSteps(steps) {
  const errors = []
  const list = Array.isArray(steps) ? steps : []
  if (!list.length) errors.push('步骤为空')
  list.forEach((step, i) => {
    const action = String(step.action || '').trim()
    if (!SUPPORTED_ACTIONS.includes(action)) {
      errors.push(`第 ${i + 1} 步 action 不支持：${action || '(空)'}`)
      return
    }
    if (NEEDS_SELECTOR.has(action) && !String(step.selector || '').trim()) {
      errors.push(`第 ${i + 1} 步 ${action} 缺少 selector`)
    }
    if (NEEDS_VALUE.has(action) && step.value !== undefined && step.value !== null && !String(step.value).trim() && action !== 'waitFor') {
      errors.push(`第 ${i + 1} 步 ${action} 缺少 value`)
    }
  })
  return { valid: errors.length === 0, errors, steps: list }
}

const COMPILE_SYSTEM = `你是资深 Web 自动化测试工程师，负责把中文测试场景编译成可执行的浏览器操作步骤。

只输出 JSON，不要任何解释文字或 markdown 代码块，格式：
{
  "title": "简短用例标题",
  "tags": ["smoke", "login"],
  "steps": [
    {"action": "goto", "selector": null, "value": "/login", "description": "打开登录页"},
    {"action": "fill", "selector": "#username", "value": "\${user}", "description": "输入用户名"},
    {"action": "click", "selector": "#submit", "value": null, "description": "点击登录"},
    {"action": "assertVisible", "selector": ".toast", "value": null, "description": "断言出现成功提示"}
  ]
}

可用 action：
goto click fill press select hover check uncheck scroll wait waitFor upload download
dblclick drag iframe switchFrame switchTab newTab closeTab refresh goBack goForward
extract screenshot
assertText assertTitle assertUrl assertVisible assertHidden assertValue assertCount assertAttribute assertNetwork

规则：
1. selector 优先用稳定的 CSS / id / data-testid；没有稳定标识时用 text=可见文字（按钮、菜单、选项都可以）。
2. goto 的 value 写相对路径或完整 URL；相对路径不要带域名。
3. 需要 selector 的动作必须给 selector；需要参数的动作把参数放 value。
4. extract 用于把某个元素的值取出来存成变量：{"action":"extract","selector":"#orderNo","value":"orderNo","description":"取出订单号"}，
   后续步骤用 \${orderNo} 引用。
5. 账号密码等用 \${变量} 占位，不要写明文。
6. 关键业务结果必须补断言（assertVisible / assertText / assertValue）。
7. 不要编造页面元素；信息不足时用最通用的选择器，并在 description 里写明假设。
${contextBlock}`

function contextBlock(context) {
  if (!context) return ''
  const lines = []
  lines.push('')
  lines.push('8. 当前页面的真实元素清单如下（来自浏览器实测），请优先复用其中的可见文字或 id 作为 selector：')
  lines.push(`   当前地址：${context.url}`)
  lines.push(`   页面标题：${context.title}`)
  for (const el of context.elements.slice(0, 60)) {
    const parts = []
    if (el.text) parts.push(`文字「${el.text}」`)
    if (el.id) parts.push(`id=${el.id}`)
    if (el.name) parts.push(`name=${el.name}`)
    if (el.placeholder) parts.push(`placeholder=${el.placeholder}`)
    if (el.ariaLabel) parts.push(`aria-label=${el.ariaLabel}`)
    if (el.testId) parts.push(`data-testid=${el.testId}`)
    if (el.cls) parts.push(`class=${el.cls}`)
    lines.push(`   - <${el.tag}> ${parts.join(' ')}`)
  }
  return lines.join('\n')
}

/**
 * 用 LLM 把自然语言编译成步骤；失败抛出异常，由调用方回退规则引擎
 */
export async function compileWithLlm(llm, { nl, title, context }) {
  const userMsg = `测试场景描述：\n${nl}${title ? `\n\n期望标题：${title}` : ''}`
  let content = await chatCompletion(llm, [
    { role: 'system', content: COMPILE_SYSTEM },
    { role: 'user', content: userMsg }
  ])
  let parsed = extractJson(content)
  let check = validateSteps(parsed.steps)

  if (!check.valid) {
    // 让模型修一次
    const fix = await chatCompletion(llm, [
      { role: 'system', content: COMPILE_SYSTEM },
      { role: 'user', content: userMsg },
      { role: 'assistant', content: content },
      { role: 'user', content: `上一步存在问题：${check.errors.join('；')}。请修正后重新输出完整 JSON。` }
    ])
    parsed = extractJson(fix)
    check = validateSteps(parsed.steps)
  }
  if (!check.valid) {
    throw new Error(`LLM 编译结果不合法：${check.errors.join('；')}`)
  }
  const steps = check.steps.map((step, i) => ({
    action: String(step.action).trim(),
    selector: step.selector ? String(step.selector).trim() : null,
    value: step.value === undefined || step.value === null ? null : String(step.value).trim(),
    description: step.description ? String(step.description).trim() : `${step.action}`,
    index: i + 1
  }))
  return {
    title: parsed.title || title || '自然语言用例',
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    steps,
    warnings: [],
    engine: `LLM（${llm.model}）`
  }
}

const GENERATE_SYSTEM = `你是资深测试设计专家。根据用户给出的需求/功能描述，设计一批可执行的 Web 自动化测试用例。

只输出 JSON 数组，不要解释或 markdown：
[
  {
    "file": "01-登录成功",
    "title": "用例标题",
    "tags": ["smoke"],
    "priority": "HIGH",
    "notes": "覆盖点说明",
    "steps": [
      {"action": "goto", "selector": null, "value": "/login", "description": "打开登录页"},
      {"action": "assertVisible", "selector": ".toast", "value": null, "description": "断言登录成功"}
    ]
  }
]

要求：
1. 覆盖维度要多样：正向主流程、异常/边界输入、权限/角色、数据一致性、状态流转。
2. 每条用例步骤控制在 15 步以内，必须可执行（不能是"检查系统是否正常"这种空话）。
3. selector 用稳定 CSS 或 text=可见文字；账号密码用 \${变量} 占位。
4. 关键结果要有断言。
5. file 用简短英文/中文短语，不要空格。`

export async function generateCases(llm, { requirement, count = 6, module = '' }) {
  const userMsg = `需求/功能描述：\n${requirement}\n\n请设计 ${count} 条自动化测试用例${module ? `，聚焦模块「${module}」` : ''}。`
  const content = await chatCompletion(llm, [
    { role: 'system', content: GENERATE_SYSTEM },
    { role: 'user', content: userMsg }
  ], { temperature: 0.6 })
  const parsed = extractJson(content)
  const list = Array.isArray(parsed) ? parsed : (parsed.cases || [])
  if (!Array.isArray(list) || !list.length) throw new Error('LLM 未返回有效用例数组')

  const cases = []
  for (const [i, item] of list.entries()) {
    const check = validateSteps(item.steps)
    if (!check.valid) continue
    const steps = check.steps.map((step, index) => ({
      action: String(step.action).trim(),
      selector: step.selector ? String(step.selector).trim() : null,
      value: step.value === undefined || step.value === null ? null : String(step.value).trim(),
      description: step.description ? String(step.description).trim() : `${step.action}`,
      index: index + 1
    }))
    cases.push({
      file: String(item.file || item.title || `case-${i + 1}`).replace(/\s+/g, '-').slice(0, 60),
      title: String(item.title || item.file || `用例 ${i + 1}`),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      priority: item.priority || 'MEDIUM',
      notes: item.notes || '',
      steps
    })
  }
  if (!cases.length) throw new Error('LLM 生成的用例均不合法')
  return cases
}

/**
 * 抓取当前页面的可交互元素清单，供 LLM 选择更准的选择器
 */
export async function capturePageContext(browser, url, { timeoutSeconds = 30, limit = 60 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutSeconds * 1000 })
    await page.waitForTimeout(500)
    const elements = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll(
        'a,button,input,textarea,select,option,[role=button],[role=tab],[role=menuitem],[data-testid],[contenteditable=true],h1,h2,h3,label'
      ))
      const seen = new Set()
      const out = []
      for (const el of nodes) {
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60)
        const id = el.id || ''
        const name = el.getAttribute('name') || ''
        const placeholder = el.getAttribute('placeholder') || ''
        const ariaLabel = el.getAttribute('aria-label') || ''
        const testId = el.getAttribute('data-testid') || ''
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')
        const key = `${el.tagName}|${text}|${id}|${name}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ tag: el.tagName.toLowerCase(), text, id, name, placeholder, ariaLabel, testId, cls })
        if (out.length > 200) break
      }
      return out
    })
    return {
      url: page.url(),
      title: await page.title(),
      elements: elements.slice(0, limit)
    }
  } finally {
    await context.close()
  }
}
