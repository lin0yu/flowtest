// 自然语言 → 步骤 编译器（本地规则，离线可用）
// 规则引擎是 LLM 的兜底：LLM 不可用/超时/输出不合法时，自动回退这里

export const ACTION_LABELS = {
  goto: '打开页面',
  click: '点击',
  fill: '输入',
  press: '按键',
  select: '选择',
  selectDropdown: '选择下拉',
  pickDate: '选择日期',
  hoverClick: '悬停后点击',
  assertDropdownContains: '断言下拉',
  hover: '悬停',
  check: '勾选',
  uncheck: '取消勾选',
  scroll: '滚动',
  wait: '等待',
  waitFor: '等待元素',
  upload: '上传文件',
  download: '下载',
  dblclick: '双击',
  drag: '拖拽',
  iframe: '切换 iframe',
  switchFrame: '切换 iframe',
  switchTab: '切换标签页',
  newTab: '新开标签页',
  closeTab: '关闭标签页',
  refresh: '刷新页面',
  goBack: '后退',
  goForward: '前进',
  extract: '取值存变量',
  screenshot: '截图',
  assertText: '断言文本',
  assertTitle: '断言标题',
  assertUrl: '断言地址',
  assertVisible: '断言可见',
  assertHidden: '断言隐藏',
  assertValue: '断言值',
  assertCount: '断言数量',
  assertAttribute: '断言属性',
  assertNetwork: '断言接口'
}

export const SUPPORTED_ACTIONS = Object.keys(ACTION_LABELS)

export const NEEDS_SELECTOR = new Set([
  'click', 'fill', 'press', 'select', 'selectDropdown', 'pickDate', 'hoverClick',
  'check', 'uncheck', 'scroll', 'waitFor',
  'upload', 'download', 'dblclick', 'drag', 'iframe', 'switchFrame', 'extract',
  'assertVisible', 'assertHidden', 'assertValue', 'assertCount', 'assertAttribute', 'assertNetwork'
])

export const NEEDS_VALUE = new Set([
  'goto', 'fill', 'press', 'select', 'selectDropdown', 'pickDate', 'hoverClick', 'assertDropdownContains',
  'wait', 'upload', 'download', 'drag',
  'switchTab', 'newTab', 'extract',
  'assertText', 'assertTitle', 'assertUrl', 'assertValue', 'assertCount', 'assertAttribute', 'assertNetwork'
])

// ---------- 规则 ----------

function matchLine(line) {
  let m

  // ===== 断言（放最前）=====
  m = line.match(/^断言\s*(?:标题|title)\s*(?:包含|等于|为)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertTitle', selector: null, value: m[1].trim() }

  m = line.match(/^断言\s*(?:文本|text)\s*(?:包含|等于|为)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertText', selector: null, value: m[1].trim() }

  m = line.match(/^断言\s*(?:地址|url|网址)\s*(?:包含|等于|为)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertUrl', selector: null, value: m[1].trim() }

  m = line.match(/^断言\s*(?:接口|api|request)\s*(.+?)\s*(?:返回|状态码|状态)\s*[:：]?\s*(\d{3})$/i)
  if (m) return { action: 'assertNetwork', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^断言元素\s*(.+?)\s*(?:的)?(?:属性|attr)\s*(\S+)\s*(?:包含|为|是|等于)\s*[:：]?\s*(.+)$/i)
  if (m) return { action: 'assertAttribute', selector: m[1].trim(), value: `${m[2].trim()}|${m[3].trim()}` }

  m = line.match(/^断言元素\s*(.+?)\s*可见$/)
  if (m) return { action: 'assertVisible', selector: m[1].trim(), value: null }

  m = line.match(/^断言元素\s*(.+?)\s*(?:隐藏|消失|不存在)$/)
  if (m) return { action: 'assertHidden', selector: m[1].trim(), value: null }

  m = line.match(/^断言元素\s*(.+?)\s*(?:的)?数量\s*(?:为|是|等于|不少于|不小于|>=|>=)?\s*(\d+)\s*(?:以上|及以上)?$/)
  if (m) return { action: 'assertCount', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^断言元素\s*(.+?)\s*(?:的)?(?:值|文本|内容)\s*(?:应|需要|必须)?\s*(?:包含|为|是|等于)\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertValue', selector: m[1].trim(), value: m[2].trim() }

  // ===== 表格行列 =====
  m = line.match(/^(?:点击|单击|双击|按下)\s*表格行\s*(.+?)\s*的\s*(.+?)\s*(?:按钮|链接|操作)?$/)
  if (m) return { action: 'click', selector: `row=${m[1].trim()} | text=${m[2].trim()}`, value: null }

  m = line.match(/^断言元素\s*表格行\s*(.+?)\s*的\s*(.+?)\s*列\s*(?:的)?(?:值|文本)\s*(?:包含|为|是)\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'assertValue', selector: `row=${m[1].trim()} | col=${m[2].trim()}`, value: m[3].trim() }

  // ===== 浏览器/页面结构 =====
  m = line.match(/^(?:切换到|进入)\s*iframe\s*(.+)$/i)
  if (m) return { action: 'switchFrame', selector: m[1].trim(), value: null }

  m = line.match(/^(?:切换到|选择)\s*标签页\s*(.+)$/)
  if (m) return { action: 'switchTab', selector: null, value: m[1].trim() }

  m = line.match(/^(?:新开|打开新)\s*标签页\s*(.*)$/)
  if (m) return { action: 'newTab', selector: null, value: (m[1] || '').trim() || null }

  m = line.match(/^(?:关闭|关掉)\s*(?:当前)?标签页$/)
  if (m) return { action: 'closeTab', selector: null, value: null }

  m = line.match(/^(?:刷新页面|刷新)$/)
  if (m) return { action: 'refresh', selector: null, value: null }

  m = line.match(/^(?:后退|返回上一页)$/)
  if (m) return { action: 'goBack', selector: null, value: null }

  m = line.match(/^(?:前进|下一页页面)$/)
  if (m) return { action: 'goForward', selector: null, value: null }

  // ===== 取值 =====
  m = line.match(/^(?:取出|提取|获取)\s*(.+?)\s*(?:的值|文本)?\s*存为\s*([\w.-]+)$/)
  if (m) return { action: 'extract', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^把\s*(.+?)\s*的(?:值|文本)\s*存为\s*([\w.-]+)$/)
  if (m) return { action: 'extract', selector: m[1].trim(), value: m[2].trim() }

  // ===== 交互 =====
  m = line.match(/^打开\s*(?:页面|网址)?\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'goto', selector: null, value: m[1].trim() }

  m = line.match(/^(?:等待|暂停)\s*(\d+(?:\.\d+)?)\s*(秒|s|毫秒|ms)?$/)
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

  // ===== Element Plus 复合组件（必须早于通用 select 规则）=====
  m = line.match(/^选择下拉\s*(.+?)\s*为\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'selectDropdown', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^选择日期\s*(.+?)\s*为\s*[:：]?\s*(.+)$/)
  if (m) return { action: 'pickDate', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^悬停后点击\s*(.+?)\s+(.+)$/)
  if (m) return { action: 'hoverClick', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^断言下拉\s*(?:包含|含有|有)\s*(.+)$/)
  if (m) return { action: 'assertDropdownContains', selector: null, value: m[1].trim() }

  m = line.match(/^(?:选择|select)\s*(?:下拉(?:框|列表)?\s*)?(.+?)\s*(?:为|选择|选)\s*[:：]?\s*(.+)$/i)
  if (m) return { action: 'select', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^(?:上传|upload)\s*(.+?)\s*(?:文件)?\s*[:：]?\s*((?:[a-zA-Z]:)?[\\/][^\s]+)$/i)
  if (m) return { action: 'upload', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^(?:下载)\s*(.+)$/)
  if (m) return { action: 'download', selector: m[1].trim(), value: null }

  m = line.match(/^(?:拖拽|拖动)\s*(.+?)\s*到\s*(.+)$/)
  if (m) return { action: 'drag', selector: m[1].trim(), value: m[2].trim() }

  m = line.match(/^(?:双击)\s*(.+)$/)
  if (m) return { action: 'dblclick', selector: m[1].trim(), value: null }

  m = line.match(/^(?:点击|单击|点|click|tap)\s+(.+)$/i)
  if (m) return { action: 'click', selector: m[1].trim(), value: null }

  m = line.match(/^(?:悬停|hover)\s*(?:在)?\s*(.+)$/i)
  if (m) return { action: 'hover', selector: m[1].trim(), value: null }

  m = line.match(/^(?:勾选|选中|check)\s+(.+)$/i)
  if (m) return { action: 'check', selector: m[1].trim(), value: null }

  m = line.match(/^(?:取消勾选|uncheck)\s+(.+)$/i)
  if (m) return { action: 'uncheck', selector: m[1].trim(), value: null }

  m = line.match(/^(?:滚动到|滚动|scroll(?:\s*to)?)\s*(.+)$/i)
  if (m) return { action: 'scroll', selector: m[1].trim(), value: null }

  m = line.match(/^(?:按键|按下|press)\s+(.+)$/i)
  if (m) return { action: 'press', selector: null, value: m[1].trim() }

  m = line.match(/^(?:截图|screenshot)\s*(.*)$/i)
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
    if (!line || line.startsWith('//') || /^#(\s|$)/.test(line)) continue

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
  return { steps, warnings, title: null, tags: [], engine: '规则引擎' }
}

export function summarizeSteps(steps) {
  const assertions = steps.filter((s) => s.action.startsWith('assert')).length
  return `${steps.length} 个步骤 · ${assertions} 个断言`
}

/** 把结构化步骤反向渲染为自然语言文本（便于生成 .nl 用例文件、便于版本管理） */
export function renderStepsToNl(steps) {
  return steps.map((s) => {
    const sel = s.selector || ''
    const val = s.value || ''
    switch (s.action) {
      case 'goto': return `打开 ${val}`
      case 'click': return `点击 ${sel}`
      case 'dblclick': return `双击 ${sel}`
      case 'fill': return `在 ${sel} 输入 ${val}`
      case 'press': return `按键 ${val}`
      case 'select': return `选择 ${sel} 为 ${val}`
      case 'selectDropdown': return `选择下拉 ${sel} 为 ${val}`
      case 'pickDate': return `选择日期 ${sel} 为 ${val}`
      case 'hoverClick': return `悬停后点击 ${sel} ${val}`
      case 'assertDropdownContains': return `断言下拉包含 ${val}`
      case 'hover': return `悬停 ${sel}`
      case 'check': return `勾选 ${sel}`
      case 'uncheck': return `取消勾选 ${sel}`
      case 'scroll': return `滚动到 ${sel}`
      case 'wait': return `等待 ${Number(val) / 1000} 秒`
      case 'waitFor': return `等待元素 ${sel} ${val === 'hidden' ? '消失' : '出现'}`
      case 'upload': return `上传 ${sel} ${val}`
      case 'download': return `下载 ${sel}`
      case 'drag': return `拖拽 ${sel} 到 ${val}`
      case 'iframe':
      case 'switchFrame': return `切换到 iframe ${sel}`
      case 'switchTab': return `切换到标签页 ${val}`
      case 'newTab': return `新开标签页 ${val || ''}`.trim()
      case 'closeTab': return '关闭当前标签页'
      case 'refresh': return '刷新页面'
      case 'goBack': return '后退'
      case 'goForward': return '前进'
      case 'extract': return `取出 ${sel} 存为 ${val}`
      case 'screenshot': return `截图 ${val || ''}`.trim()
      case 'assertText': return `断言文本包含 ${val}`
      case 'assertTitle': return `断言标题包含 ${val}`
      case 'assertUrl': return `断言地址包含 ${val}`
      case 'assertVisible': return `断言元素 ${sel} 可见`
      case 'assertHidden': return `断言元素 ${sel} 隐藏`
      case 'assertValue': return `断言元素 ${sel} 的值为 ${val}`
      case 'assertCount': return `断言元素 ${sel} 的数量为 ${val}`
      case 'assertAttribute': {
        const [attr, expected] = String(val).split('|')
        return `断言元素 ${sel} 的 ${attr} 包含 ${expected}`
      }
      case 'assertNetwork': return `断言接口 ${sel} 返回 ${val}`
      default: return s.description || s.action
    }
  }).join('\n')
}
