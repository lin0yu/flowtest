// 自然语言 → 步骤 编译器（纯本地规则，离线，零外部依赖）
// 支持的动词与断言与 FlowTest 一致：打开/点击/输入/选择/悬停/勾选/等待/上传/截图/断言...

export const ACTION_LABELS = {
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

// 返回 { action, selector, value, description }
function matchLine(line) {
  // ---- 断言（放前面，避免被 click/fill 抢占）----
  let m
  m = line.match(/^断言\s*(?:标题|title)\s*(?:包含|等于|为)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertTitle', selector: null, value: m[1].trim() }
  m = line.match(/^断言\s*(?:文本|text)\s*(?:包含|等于|为)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertText', selector: null, value: m[1].trim() }
  m = line.match(/^断言\s*(?:地址|url|网址)\s*(?:包含|等于|为)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertUrl', selector: null, value: m[1].trim() }
  m = line.match(/^断言元素\s*(.+?)\s*可见$/)
  if (m) return { action: 'assertVisible', selector: m[1].trim(), value: null }
  m = line.match(/^断言元素\s*(.+?)\s*(?:隐藏|消失|不存在)$/)
  if (m) return { action: 'assertHidden', selector: m[1].trim(), value: null }
  m = line.match(/^断言元素\s*(.+?)\s*(?:的)?数量\s*(?:为|是|等于)?\s*(\d+)$/)
  if (m) return { action: 'assertCount', selector: m[1].trim(), value: m[2] }
  m = line.match(/^断言元素\s*(.+?)\s*(?:的)?(?:值|文本|内容)\s*(?:应|需要|必须)?\s*(?:包含|为|是|等于)\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertValue', selector: m[1].trim(), value: m[2].trim() }

  // ---- 动作 ----
  m = line.match(/^(?:打开|访问|进入|goto|open)\s*(?:页面|网址|url)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'goto', selector: null, value: m[1].trim() }
  m = line.match(/^(?:等待|暂停|wait)\s*(\d+(?:\.\d+)?)\s*(秒|s|毫秒|ms)?$/)
  if (m) {
    let ms = Number(m[1])
    if (!m[2] || m[2] === '秒' || m[2] === 's') ms = ms * 1000
    return { action: 'wait', selector: null, value: String(Math.round(ms)) }
  }
  m = line.match(/^(?:等待|等)\s*(?:元素)?\s*(.+?)\s*(?:出现|可见|显示|消失|隐藏|不存在)$/)
  if (m) {
    const state = /(消失|隐藏|不存在)$/.test(line) ? 'hidden' : 'visible'
    return { action: 'waitFor', selector: m[1].trim(), value: state }
  }
  m = line.match(/^在\s*(.+?)\s*(?:输入|填写|键入)\s*(.+)$/)
  if (m) return { action: 'fill', selector: m[1].trim(), value: m[2].trim() }
  m = line.match(/^(?:选择|select)\s*(?:下拉(?:框|列表)?\s*)?(.+?)\s*(?:为|选择|选)\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'select', selector: m[1].trim(), value: m[2].trim() }
  m = line.match(/^(?:上传|upload)\s*(.+?)\s*(?:文件)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'upload', selector: m[1].trim(), value: m[2].trim() }
  m = line.match(/^(?:点击|单击|点|click|tap)\s+(.+)$/)
  if (m) return { action: 'click', selector: m[1].trim(), value: null }
  m = line.match(/^(?:悬停|hover)\s*(?:在)?\s*(.+)$/)
  if (m) return { action: 'hover', selector: m[1].trim(), value: null }
  m = line.match(/^(?:勾选|选中|check)\s+(.+)$/)
  if (m) return { action: 'check', selector: m[1].trim(), value: null }
  m = line.match(/^(?:取消勾选|uncheck)\s+(.+)$/)
  if (m) return { action: 'uncheck', selector: m[1].trim(), value: null }
  m = line.match(/^(?:滚动到|滚动|scroll(?:\s*to)?)\s*(.+)$/)
  if (m) return { action: 'scroll', selector: m[1].trim(), value: null }
  m = line.match(/^(?:按键|按下|press)\s+(.+)$/)
  if (m) return { action: 'press', selector: null, value: m[1].trim() }
  m = line.match(/^(?:截图|screenshot)\s*(.*)$/)
  if (m) return { action: 'screenshot', selector: null, value: (m[1] || '').trim() || null }

  return null
}

export function compile(nlText) {
  const steps = []
  const warnings = []
  const lines = String(nlText || '').replace(/\r\n/g, '\n').split(/\n|;|；/)
  let lineNo = 0
  for (let raw of lines) {
    lineNo++
    let line = raw.trim()
    line = line.replace(/^\s*(?:步骤\s*)?\d+\s*[.、):：]\s*/, '')
    line = line.replace(/^\s*[-*•]\s*/, '').trim()
    if (!line || line.startsWith('//') || line.startsWith('#')) continue

    const parsed = matchLine(line)
    if (!parsed) {
      warnings.push(`第 ${lineNo} 行无法识别，已跳过：${line}`)
      continue
    }
    parsed.description = line
    parsed.index = steps.length + 1
    steps.push(parsed)
  }
  if (!steps.length) {
    throw new Error('没有识别出可执行步骤。请使用「打开 /xxx」「点击 #btn」「断言文本包含 成功」等表述。')
  }
  return { steps, warnings }
}

export function summarizeSteps(steps) {
  const assertions = steps.filter((s) => s.action.startsWith('assert')).length
  return `${steps.length} 个步骤 · ${assertions} 个断言`
}
