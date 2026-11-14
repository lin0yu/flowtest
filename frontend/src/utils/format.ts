import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

export function formatDate(value?: string | null, format = 'YYYY-MM-DD HH:mm'): string {
  if (!value) return '—'
  return dayjs(value).format(format)
}

export function timeAgo(value?: string | null): string {
  if (!value) return '—'
  return dayjs(value).fromNow()
}

export function formatDuration(ms?: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export interface StatusMeta {
  label: string
  tone: 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'neutral'
}

const STATUS_MAP: Record<string, StatusMeta> = {
  QUEUED: { label: '排队中', tone: 'info' },
  RUNNING: { label: '执行中', tone: 'primary' },
  PASSED: { label: '通过', tone: 'success' },
  FAILED: { label: '失败', tone: 'danger' },
  ERROR: { label: '异常', tone: 'warning' },
  CANCELLED: { label: '已取消', tone: 'neutral' },
  SKIPPED: { label: '跳过', tone: 'neutral' },
  PENDING: { label: '待执行', tone: 'neutral' },
  DRAFT: { label: '草稿', tone: 'neutral' },
  READY: { label: '就绪', tone: 'success' },
  DISABLED: { label: '停用', tone: 'info' },
  TRIGGERED: { label: '已触发', tone: 'primary' }
}

export function statusMeta(status?: string | null): StatusMeta {
  if (!status) return { label: '—', tone: 'neutral' }
  return STATUS_MAP[status] || { label: status, tone: 'info' }
}

export function priorityMeta(priority?: string): { label: string; tone: string } {
  const map: Record<string, { label: string; tone: string }> = {
    LOW: { label: '低', tone: 'low' },
    MEDIUM: { label: '中', tone: 'medium' },
    HIGH: { label: '高', tone: 'high' },
    CRITICAL: { label: '紧急', tone: 'critical' }
  }
  return map[priority || 'MEDIUM'] || { label: priority || '中', tone: 'medium' }
}

export function triggerLabel(trigger?: string): string {
  const map: Record<string, string> = {
    MANUAL: '手动',
    SCHEDULE: '定时',
    API: 'API',
    RETRY: '重试'
  }
  return map[trigger || ''] || trigger || '—'
}

export function actionLabel(action: string): string {
  const map: Record<string, string> = {
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
    upload: '上传',
    screenshot: '截图',
    assertText: '断言文本',
    assertTitle: '断言标题',
    assertUrl: '断言地址',
    assertVisible: '断言可见',
    assertHidden: '断言隐藏',
    assertValue: '断言值',
    assertCount: '断言数量'
  }
  return map[action] || action
}

export function shortId(id?: number | string): string {
  if (id === undefined || id === null) return '—'
  return `#${id}`
}

export function percent(part: number, total: number): number {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}
