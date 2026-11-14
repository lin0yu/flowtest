import http, { getBlob } from './http'
import type {
  ApiKey,
  ApiKeyCreated,
  Attachment,
  CaseDetail,
  CaseSummary,
  CompileResult,
  Environment,
  PageResult,
  Project,
  Run,
  RunDetail,
  StatsOverview,
  StepDef,
  SystemStatus,
  Task,
  User
} from '@/types'

export const authApi = {
  login: (data: { username: string; password: string }) =>
    http.post<{ token: string; user: User }>('/auth/login', data),
  me: () => http.get<User>('/auth/me'),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    http.post('/auth/password', data)
}

export const projectApi = {
  list: () => http.get<Project[]>('/projects'),
  get: (id: number) => http.get<Project>(`/projects/${id}`),
  create: (data: Partial<Project>) => http.post<Project>('/projects', data),
  update: (id: number, data: Partial<Project>) => http.put<Project>(`/projects/${id}`, data),
  remove: (id: number) => http.delete(`/projects/${id}`)
}

export const environmentApi = {
  list: (projectId: number) => http.get<Environment[]>('/environments', { params: { projectId } }),
  create: (data: Partial<Environment>) => http.post<Environment>('/environments', data),
  update: (id: number, data: Partial<Environment>) => http.put<Environment>(`/environments/${id}`, data),
  remove: (id: number) => http.delete(`/environments/${id}`)
}

export interface CasePayload {
  projectId: number
  name: string
  description?: string
  nlInput?: string
  steps?: StepDef[]
  tags?: string[]
  priority?: string
  status?: string
  timeoutSeconds?: number
  headless?: boolean
  screenshotEachStep?: boolean
}

export const caseApi = {
  list: (params: Record<string, any>) => http.get<PageResult<CaseSummary>>('/cases', { params }),
  get: (id: number) => http.get<CaseDetail>(`/cases/${id}`),
  create: (data: CasePayload) => http.post<CaseDetail>('/cases', data),
  update: (id: number, data: CasePayload) => http.put<CaseDetail>(`/cases/${id}`, data),
  remove: (id: number) => http.delete(`/cases/${id}`),
  duplicate: (id: number) => http.post<CaseDetail>(`/cases/${id}/duplicate`),
  compile: (data: { nl: string; title?: string; useLlm?: boolean }) =>
    http.post<CompileResult>('/cases/compile', data),
  run: (id: number, data: { environmentId?: number; headless?: boolean }) =>
    http.post<Run>(`/cases/${id}/run`, data),
  attachments: (id: number) => http.get<Attachment[]>(`/cases/${id}/attachments`),
  uploadAttachment: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<Attachment>(`/cases/${id}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  deleteAttachment: (id: number) => http.delete(`/attachments/${id}`),
  downloadAttachment: async (id: number, filename: string) => {
    const blob = await getBlob(`/attachments/${id}/download`)
    const { downloadBlob } = await import('./http')
    downloadBlob(blob, filename)
  },
  exportCases: async (projectId: number) => {
    const blob = await getBlob('/cases/export', { params: { projectId } })
    const { downloadBlob } = await import('./http')
    downloadBlob(blob, `flowtest-cases-${projectId}.json`)
  },
  importCases: (projectId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.post<{ imported: number; warnings: string[] }>('/cases/import', form, {
      params: { projectId },
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}

export interface TaskPayload {
  projectId: number
  environmentId?: number
  name: string
  description?: string
  caseIds: number[]
  cronExpression?: string
  enabled?: boolean
  retryCount?: number
  timeoutSeconds?: number
  webhookUrl?: string
}

export const taskApi = {
  list: () => http.get<Task[]>('/tasks'),
  create: (data: TaskPayload) => http.post<Task>('/tasks', data),
  update: (id: number, data: TaskPayload) => http.put<Task>(`/tasks/${id}`, data),
  remove: (id: number) => http.delete(`/tasks/${id}`),
  trigger: (id: number) => http.post<{ batchId: string; runCount: number; runIds: number[] }>(`/tasks/${id}/trigger`)
}

export const runApi = {
  list: (params: Record<string, any>) => http.get<PageResult<Run>>('/runs', { params }),
  detail: (id: number) => http.get<RunDetail>(`/runs/${id}`),
  cancel: (id: number) => http.post<Run>(`/runs/${id}/cancel`),
  rerun: (id: number) => http.post<Run>(`/runs/${id}/rerun`),
  downloadZip: async (id: number) => {
    const blob = await getBlob(`/runs/${id}/download`)
    const { downloadBlob } = await import('./http')
    downloadBlob(blob, `flowtest-run-${id}.zip`)
  },
  downloadArtifact: async (runId: number, artifactId: number, filename: string) => {
    const blob = await getBlob(`/runs/${runId}/artifacts/${artifactId}/download`)
    const { downloadBlob } = await import('./http')
    downloadBlob(blob, filename)
  }
}

export const statsApi = {
  overview: () => http.get<StatsOverview>('/stats/overview')
}

export const systemApi = {
  status: () => http.get<SystemStatus>('/system/status'),
  health: () => http.get('/public/health')
}

export const apiKeyApi = {
  list: () => http.get<ApiKey[]>('/api-keys'),
  create: (name: string) => http.post<ApiKeyCreated>('/api-keys', { name }),
  remove: (id: number) => http.delete(`/api-keys/${id}`)
}

export const quickApi = {
  run: (data: {
    projectId: number
    environmentId?: number
    nl?: string
    title?: string
    steps?: StepDef[]
    headless?: boolean
    screenshotEachStep?: boolean
  }) => http.post<Run>('/runs/quick', data)
}
