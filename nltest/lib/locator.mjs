// 定位解析：多候选降级、表格行列、iframe、失败自诊断
// 前端无法埋点时，定位主要依赖「可见文字 / placeholder / aria-label / 结构」，
// 因此这里支持多候选（| 分隔）与近似文本建议。

export function splitCandidates(selector) {
  return String(selector || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 把候选表达式解析成 Playwright locator
 * @returns {{ locator: any, candidate: string } | null}
 */
export function resolveLocator(page, selector, scope) {
  const root = scope || page
  for (const candidate of splitCandidates(selector)) {
    try {
      const locator = buildLocator(root, candidate)
      if (locator) return { locator, candidate }
    } catch {
      // 换下一个候选
    }
  }
  return null
}

function buildLocator(root, candidate) {
  // 表格行内元素：row=关键字 | text=按钮文字
  const rowText = candidate.match(/^row=(.+?)\s*\|\s*text=(.+)$/i)
  if (rowText) {
    const row = root.locator('tr').filter({ hasText: rowText[1].trim() }).first()
    return row.getByText(rowText[2].trim())
  }
  // 表格行列取值：row=关键字 | col=列名
  const rowCol = candidate.match(/^row=(.+?)\s*\|\s*col=(.+)$/i)
  if (rowCol) return null // 需要异步求列索引，由 resolveRowColumn 单独处理

  if (candidate.startsWith('text=')) return root.getByText(candidate.slice(5).trim())
  if (candidate.startsWith('placeholder=')) return root.getByPlaceholder(candidate.slice('placeholder='.length).trim())
  if (candidate.startsWith('aria=')) return root.locator(`[aria-label*=${cssQuote(candidate.slice(5).trim())}]`)
  if (candidate.startsWith('title=')) return root.locator(`[title*=${cssQuote(candidate.slice(6).trim())}]`)
  if (candidate.startsWith('data-testid=')) return root.locator(`[data-testid=${cssQuote(candidate.slice('data-testid='.length).trim())}]`).first()
  if (candidate.startsWith('id=')) return root.locator(`#${candidate.slice(3).trim()}`).first()
  if (candidate.startsWith('name=')) return root.locator(`[name=${cssQuote(candidate.slice(5).trim())}]`).first()
  if (candidate.startsWith('css=')) return root.locator(candidate.slice(4).trim()).first()
  if (candidate.startsWith('xpath=')) return root.locator(candidate.slice(6).trim()).first()
  if (candidate.startsWith('//') || candidate.startsWith('(//')) return root.locator(candidate).first()
  if (candidate.startsWith('#') || candidate.startsWith('.') || candidate.startsWith('[')
    || candidate.includes('>') || /\s/.test(candidate)) {
    return root.locator(candidate).first()
  }
  // 纯文字兜底
  return root.getByText(candidate)
}

function cssQuote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

/** 解析 frame= 选择器前缀，返回 frameLocator */
export function resolveFrame(page, frameSelector) {
  if (!frameSelector) return null
  const candidates = splitCandidates(frameSelector)
  for (const candidate of candidates) {
    const locator = buildLocator(page, candidate)
    if (locator) return page.frameLocator(candidate.startsWith('css=') ? candidate.slice(4) : candidate)
  }
  return null
}

/**
 * 表格行列定位：row=关键字 | col=列名
 * 需要先根据表头文字找到列索引，再取该行对应单元格
 */
export async function resolveRowColumn(page, selector) {
  const candidates = splitCandidates(selector)
  const target = candidates.find((c) => /^row=/i.test(c) && /\|\s*col=/i.test(c))
  if (!target) return null
  const [, rowKeyword, colName] = target.match(/^row=(.+?)\s*\|\s*col=(.+)$/i)
  const row = page.locator('tr').filter({ hasText: rowKeyword.trim() }).first()
  if (await row.count() === 0) return null

  const colIndex = await page.evaluate((name) => {
    const headers = Array.from(document.querySelectorAll('th'))
    const idx = headers.findIndex((th) => (th.innerText || '').trim().includes(name))
    return idx
  }, colName.trim())
  if (colIndex === undefined || colIndex < 0) return null
  return row.locator('td').nth(colIndex).first()
}

/**
 * 定位失败时，收集当前页面的可交互元素清单，供使用者直接复制为选择器
 */
export async function collectDiagnostics(page, { limit = 80 } = {}) {
  return page.evaluate((max) => {
    const nodes = Array.from(document.querySelectorAll(
      'a,button,input,textarea,select,option,[role=button],[role=tab],[role=menuitem],[role=option],[data-testid],[contenteditable=true],th,td,label'
    ))
    const seen = new Set()
    const out = []
    for (const el of nodes) {
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60)
      const id = el.id || ''
      const name = el.getAttribute('name') || ''
      const placeholder = el.getAttribute('placeholder') || ''
      const ariaLabel = el.getAttribute('aria-label') || ''
      const title = el.getAttribute('title') || ''
      const testId = el.getAttribute('data-testid') || ''
      const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      const key = `${el.tagName}|${text}|${id}|${name}`
      if (seen.has(key)) continue
      seen.add(key)

      let suggest = ''
      if (testId) suggest = `data-testid=${testId}`
      else if (id) suggest = `#${id}`
      else if (ariaLabel) suggest = `aria=${ariaLabel}`
      else if (placeholder) suggest = `placeholder=${placeholder}`
      else if (title) suggest = `title=${title}`
      else if (text && text.length <= 24) suggest = `text=${text}`
      else if (cls) suggest = `css=${el.tagName.toLowerCase()}.${cls}`

      out.push({
        tag: el.tagName.toLowerCase(),
        text,
        id,
        name,
        placeholder,
        ariaLabel,
        title,
        testId,
        cls,
        suggest
      })
      if (out.length >= max) break
    }
    return out
  }, limit)
}

/** 近似文本匹配：给出与目标最接近的页面元素（用于诊断「是不是文案变了」） */
export function similarity(a, b) {
  const s1 = String(a || '')
  const s2 = String(b || '')
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1
  const dist = levenshtein(s1, s2)
  const max = Math.max(s1.length, s2.length)
  return max === 0 ? 1 : 1 - dist / max
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[m][n]
}

export function closestMatches(diagnostics, target, topN = 5) {
  const t = String(target || '').trim()
  if (!t) return []
  return diagnostics
    .map((d) => ({
      ...d,
      score: Math.max(
        similarity(d.text, t),
        similarity(d.placeholder, t),
        similarity(d.ariaLabel, t),
        d.text && t.includes(d.text) ? 0.8 : 0,
        d.text && d.text.includes(t) ? 0.8 : 0
      )
    }))
    .filter((d) => d.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}
