// 配置加载与合并：默认 < 全局配置 < 项目配置 < 环境变量 < CLI 参数
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_CONFIG = {
  app: {
    baseUrl: ''
  },
  llm: {
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
    timeoutMs: 60000,
    temperature: 0.2,
    maxTokens: 4000,
    retry: 1,
    headers: {}
  },
  browser: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 960 },
    slowMo: 0,
    ignoreHttpsErrors: false,
    acceptDownloads: true,
    userDataDir: '',
    args: []
  },
  runner: {
    timeoutSeconds: 10,
    navigationTimeoutSeconds: 30,
    stepRetries: 0,
    retryBackoffMs: 500,
    failFast: false
  },
  report: {
    dir: 'reports',
    formats: ['html', 'json'],
    inline: false,
    screenshot: 'each-step', // each-step | on-failure | none
    redact: ['password', 'pwd', 'passwd', 'token', 'secret', 'apikey']
  },
  vars: {}
}

const ENV_MAP = [
  ['NLTEST_APP_URL', 'app.baseUrl', 'string'],
  ['NLTEST_LLM_ENABLED', 'llm.enabled', 'bool'],
  ['NLTEST_LLM_BASE_URL', 'llm.baseUrl', 'string'],
  ['NLTEST_LLM_MODEL', 'llm.model', 'string'],
  ['NLTEST_LLM_API_KEY', 'llm.apiKey', 'string'],
  ['NLTEST_LLM_TIMEOUT_MS', 'llm.timeoutMs', 'number'],
  ['NLTEST_BROWSER_CHANNEL', 'browser.channel', 'string'],
  ['NLTEST_HEADLESS', 'browser.headless', 'bool'],
  ['NLTEST_SLOWMO', 'browser.slowMo', 'number'],
  ['NLTEST_TIMEOUT', 'runner.timeoutSeconds', 'number'],
  ['NLTEST_STEP_RETRIES', 'runner.stepRetries', 'number'],
  ['NLTEST_REPORT_DIR', 'report.dir', 'string'],
  ['NLTEST_REPORT_FORMATS', 'report.formats', 'list'],
  ['NLTEST_SCREENSHOT', 'report.screenshot', 'string']
]

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch
  const out = isPlainObject(base) ? { ...base } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    out[key] = isPlainObject(value) ? deepMerge(out[key], value) : value
  }
  return out
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function setPath(obj, dotted, value) {
  const parts = dotted.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = value
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function findProjectConfig(startDir) {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'nltest.config.json')
    const data = await readJson(candidate)
    if (data) return { file: candidate, data }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * @param {object} opts
 * @param {string} [opts.configPath]  显式指定配置文件
 * @param {object} [opts.cli]         CLI 覆盖项（形如 { 'llm.model': 'xxx' }）
 * @param {string} [opts.cwd]
 */
export async function loadConfig(opts = {}) {
  const cli = opts.cli || {}
  const cwd = opts.cwd || process.cwd()
  let config = deepMerge({}, DEFAULT_CONFIG)
  const sources = []

  const globalFile = path.join(os.homedir(), '.nltest', 'config.json')
  const globalData = await readJson(globalFile)
  if (globalData) {
    config = deepMerge(config, globalData)
    sources.push(globalFile)
  }

  let projectFile = ''
  if (opts.configPath) {
    const data = await readJson(path.resolve(opts.configPath))
    if (!data) throw new Error(`配置文件无法解析：${opts.configPath}`)
    config = deepMerge(config, data)
    projectFile = path.resolve(opts.configPath)
  } else {
    const found = await findProjectConfig(cwd)
    if (found) {
      config = deepMerge(config, found.data)
      projectFile = found.file
    }
  }
  if (projectFile) sources.push(projectFile)

  // 环境变量
  for (const [envKey, dotted, type] of ENV_MAP) {
    const raw = process.env[envKey]
    if (raw === undefined || raw === '') continue
    let value = raw
    if (type === 'bool') value = /^(1|true|yes|on)$/i.test(raw)
    else if (type === 'number') value = Number(raw)
    else if (type === 'list') value = raw.split(',').map((s) => s.trim()).filter(Boolean)
    setPath(config, dotted, value)
  }
  if (process.env.NLTEST_VARS) {
    try {
      config.vars = deepMerge(config.vars, JSON.parse(process.env.NLTEST_VARS))
    } catch {
      /* 忽略非法 JSON */
    }
  }

  // CLI 覆盖
  for (const [dotted, value] of Object.entries(cli)) {
    if (value === undefined) continue
    setPath(config, dotted, value)
  }

  return { config, sources, projectFile }
}

export function redactValue(value, patterns = []) {
  let text = String(value ?? '')
  for (const pattern of patterns) {
    const re = new RegExp(`(\\$\\{${escapeRegExp(pattern)}\\})`, 'gi')
    text = text.replace(re, '${***}')
  }
  return text
}

export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
