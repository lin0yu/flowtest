export interface User {
  id: number
  username: string
  displayName: string
  role: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface PageResult<T> {
  content: T[]
  total: number
  page: number
  size: number
}

export interface Project {
  id: number
  name: string
  key: string
  description?: string
  color: string
  caseCount: number
  envCount: number
  taskCount: number
  createdAt: string
  updatedAt: string
}

export interface Environment {
  id: number
  projectId: number
  name: string
  baseUrl?: string
  variables: Record<string, string>
  defaultEnv: boolean
  createdAt: string
}

export interface StepDef {
  index: number
  action: string
  selector?: string | null
  value?: string | null
  description: string
}

export interface Attachment {
  id: number
  fileName: string
  contentType?: string
  size: number
  createdAt: string
}

export interface CaseSummary {
  id: number
  projectId: number
  projectName: string
  name: string
  description?: string
  stepCount: number
  tags: string[]
  priority: string
  status: string
  version: number
  updatedAt: string
}

export interface CaseDetail extends CaseSummary {
  nlInput?: string
  steps: StepDef[]
  timeoutSeconds: number
  headless: boolean
  screenshotEachStep: boolean
  createdBy?: string
  attachments: Attachment[]
  createdAt: string
}

export interface CompileResult {
  title: string
  summary: string
  steps: StepDef[]
  warnings: string[]
  engine: string
}

export interface Task {
  id: number
  projectId: number
  projectName: string
  environmentId?: number
  environmentName?: string
  name: string
  description?: string
  caseIds: number[]
  caseNames: string[]
  cronExpression?: string
  enabled: boolean
  retryCount: number
  timeoutSeconds: number
  webhookUrl?: string
  lastRunAt?: string
  nextRunAt?: string
  lastRunStatus?: string
  createdAt: string
  updatedAt: string
}

export interface Run {
  id: number
  batchId?: string
  taskId?: number
  taskName?: string
  projectId: number
  projectName: string
  caseId?: number
  caseName: string
  environmentId?: number
  environmentName?: string
  triggerType: string
  status: string
  attempt: number
  maxAttempts: number
  totalSteps: number
  passedSteps: number
  failedSteps: number
  skippedSteps: number
  durationMs?: number
  startedAt?: string
  finishedAt?: string
  createdAt: string
  requestedBy?: string
  errorMessage?: string
  headless: boolean
}

export interface RunStep {
  id: number
  stepIndex: number
  action: string
  selector?: string
  value?: string
  description: string
  status: string
  message?: string
  expectedValue?: string
  actualValue?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  screenshotArtifactId?: number
}

export interface Artifact {
  id: number
  runId: number
  stepIndex?: number
  type: string
  fileName: string
  contentType?: string
  size: number
  createdAt: string
}

export interface RunDetail {
  run: Run
  steps: RunStep[]
  artifacts: Artifact[]
  consoleLog: string
}

export interface TrendPoint {
  date: string
  total: number
  passed: number
  failed: number
}

export interface FailingCase {
  caseName: string
  failures: number
}

export interface StatsOverview {
  projectCount: number
  caseCount: number
  taskCount: number
  runCount: number
  runs7d: number
  passRate: number
  avgDurationMs: number
  activeRuns: number
  trend: TrendPoint[]
  recentRuns: Run[]
  failingCases: FailingCase[]
}

export interface SystemStatus {
  engineReady: boolean
  browser: string
  browserVersion?: string
  llmEnabled: boolean
  llmModel?: string
  maxParallel: number
  queuedRuns: number
  activeRuns: number
  storageRoot: string
  demoUrl: string
  version: string
  uptimeSeconds: number
}

export interface ApiKey {
  id: number
  name: string
  prefix: string
  enabled: boolean
  createdAt: string
  lastUsedAt?: string
}

export interface ApiKeyCreated {
  plainKey: string
  key: ApiKey
}
