// 模拟业务系统的本地数据层（localStorage 持久化，模拟「后端」）
import { reactive } from 'vue'

export interface MockTask {
  id: number
  name: string
  model: string
  stage: string
  certType: string
  deadline: string
  status: string
  remark: string
  fileName: string
  createdAt: string
}

const TASK_KEY = 'flowtest_mock_tasks'
const TOKEN_KEY = 'flowtest_mock_token'
const USER_KEY = 'flowtest_mock_user'

function seed(): MockTask[] {
  return [
    {
      id: 101, name: 'SAR 认证辐射测试', model: 'Greenland-01', stage: '样机阶段',
      certType: '型号核准', deadline: '2026-12-20', status: '待审核',
      remark: '首批样机辐射测试', fileName: 'sar-plan.pdf', createdAt: '2026-11-02 09:20'
    },
    {
      id: 102, name: '射频天线一致性测试', model: 'Greenland-02', stage: '设计阶段',
      certType: '技术审查', deadline: '2026-12-05', status: '已审核',
      remark: '天线一致性验证', fileName: 'antenna-report.docx', createdAt: '2026-11-05 14:03'
    },
    {
      id: 103, name: '整机电磁兼容摸底', model: 'Greenland-03', stage: '量产阶段',
      certType: '型式核准', deadline: '2026-11-30', status: '已驳回',
      remark: '摸底测试待整改', fileName: 'emc-draft.xlsx', createdAt: '2026-11-08 17:41'
    }
  ]
}

function loadTasks(): MockTask[] {
  try {
    const raw = localStorage.getItem(TASK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch {
    // 忽略损坏数据
  }
  const initial = seed()
  localStorage.setItem(TASK_KEY, JSON.stringify(initial))
  return initial
}

export const mockStore = reactive({
  tasks: loadTasks() as MockTask[],
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: JSON.parse(localStorage.getItem(USER_KEY) || 'null') as { username: string } | null
})

export function persistTasks() {
  localStorage.setItem(TASK_KEY, JSON.stringify(mockStore.tasks))
}

export function mockLogin(username: string, password: string): boolean {
  if (username === 'admin' && password === 'admin123') {
    mockStore.user = { username }
    mockStore.token = `mock-token-${Date.now()}`
    localStorage.setItem(TOKEN_KEY, mockStore.token)
    localStorage.setItem(USER_KEY, JSON.stringify(mockStore.user))
    return true
  }
  return false
}

export function mockLogout() {
  mockStore.user = null
  mockStore.token = ''
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function addTask(payload: Omit<MockTask, 'id' | 'createdAt' | 'status'>): MockTask {
  const task: MockTask = {
    ...payload,
    id: Math.max(100, ...mockStore.tasks.map((t) => t.id)) + 1,
    status: '待审核',
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false })
  }
  mockStore.tasks.unshift(task)
  persistTasks()
  return task
}

export function updateTask(id: number, payload: Partial<MockTask>) {
  const task = mockStore.tasks.find((t) => t.id === id)
  if (task) {
    Object.assign(task, payload)
    persistTasks()
  }
}

export function removeTask(id: number) {
  mockStore.tasks = mockStore.tasks.filter((t) => t.id !== id)
  persistTasks()
}

export function findTask(id: number) {
  return mockStore.tasks.find((t) => t.id === id)
}

export function resetMockData() {
  mockStore.tasks = seed()
  persistTasks()
}
