<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import {
  Delete,
  Download,
  Edit,
  Files,
  MagicStick,
  MoreFilled,
  Paperclip,
  VideoPlay,
  Plus,
  Upload
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { caseApi, environmentApi, projectApi } from '@/api'
import { actionLabel, formatBytes, formatDate, priorityMeta, timeAgo } from '@/utils/format'
import type { Attachment, CaseDetail, CaseSummary, CompileResult, Environment, Project, StepDef } from '@/types'

const route = useRoute()
const router = useRouter()

const projects = ref<Project[]>([])
const cases = ref<CaseSummary[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const size = ref(10)
const filters = reactive({
  projectId: route.query.projectId ? Number(route.query.projectId) : undefined as number | undefined,
  keyword: '',
  status: '',
  priority: ''
})

const drawerVisible = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const editingCase = ref<CaseDetail | null>(null)
const form = reactive({
  projectId: undefined as number | undefined,
  name: '',
  description: '',
  nlInput: '',
  steps: [] as StepDef[],
  tags: [] as string[],
  priority: 'MEDIUM',
  status: 'READY',
  timeoutSeconds: 20,
  headless: true,
  screenshotEachStep: true
})
const compileLoading = ref(false)
const compileWarnings = ref<string[]>([])
const compileEngine = ref('')
const useLlm = ref(false)
const attachments = ref<Attachment[]>([])
const uploading = ref(false)

const runDialogVisible = ref(false)
const runTarget = ref<CaseSummary | CaseDetail | null>(null)
const runEnvironments = ref<Environment[]>([])
const runEnvId = ref<number>()
const runHeadless = ref(true)
const running = ref(false)

const importVisible = ref(false)
const importProjectId = ref<number>()
const importFile = ref<File | null>(null)
const importing = ref(false)
const importResult = ref<{ imported: number; warnings: string[] } | null>(null)

const tagOptions = ['smoke', 'regression', 'login', 'cart', 'search', 'api', 'critical', 'demo']
const actionOptions = [
  'goto', 'click', 'fill', 'press', 'select', 'hover', 'check', 'uncheck', 'scroll',
  'wait', 'waitFor', 'upload', 'screenshot', 'assertText', 'assertTitle', 'assertUrl',
  'assertVisible', 'assertHidden', 'assertValue', 'assertCount'
]
const priorityOptions = [
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '紧急' }
]
const statusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'READY', label: '就绪' },
  { value: 'DISABLED', label: '停用' }
]

const drawerTitle = computed(() => (drawerMode.value === 'create' ? '新建测试用例' : '编辑测试用例'))
const stepCount = computed(() => form.steps.length)
const canUpload = computed(() => drawerMode.value === 'edit' && !!editingCase.value)

async function loadProjects() {
  const { data } = await projectApi.list()
  projects.value = data
  if (!form.projectId) form.projectId = filters.projectId || data[0]?.id
  if (!importProjectId.value) importProjectId.value = filters.projectId || data[0]?.id
}

async function loadCases() {
  loading.value = true
  try {
    const { data } = await caseApi.list({
      projectId: filters.projectId,
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      page: page.value,
      size: size.value
    })
    cases.value = data.content
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  loadCases()
}

function resetFilters() {
  filters.projectId = undefined
  filters.keyword = ''
  filters.status = ''
  filters.priority = ''
  page.value = 1
  loadCases()
}

function resetForm() {
  form.projectId = filters.projectId || projects.value[0]?.id
  form.name = ''
  form.description = ''
  form.nlInput = ''
  form.steps = []
  form.tags = []
  form.priority = 'MEDIUM'
  form.status = 'READY'
  form.timeoutSeconds = 20
  form.headless = true
  form.screenshotEachStep = true
  compileWarnings.value = []
  compileEngine.value = ''
  attachments.value = []
  editingCase.value = null
}

function openCreate() {
  drawerMode.value = 'create'
  resetForm()
  drawerVisible.value = true
}

async function openEdit(row: CaseSummary) {
  drawerMode.value = 'edit'
  resetForm()
  drawerVisible.value = true
  const { data } = await caseApi.get(row.id)
  editingCase.value = data
  form.projectId = data.projectId
  form.name = data.name
  form.description = data.description || ''
  form.nlInput = data.nlInput || ''
  form.steps = (data.steps || []).map((step, index) => ({ ...step, index: index + 1 }))
  form.tags = data.tags || []
  form.priority = data.priority
  form.status = data.status
  form.timeoutSeconds = data.timeoutSeconds
  form.headless = data.headless
  form.screenshotEachStep = data.screenshotEachStep
  attachments.value = data.attachments || []
}

async function compileNl() {
  if (!form.nlInput.trim()) {
    ElMessage.warning('请先输入自然语言测试描述')
    return
  }
  compileLoading.value = true
  try {
    const { data } = await caseApi.compile({
      nl: form.nlInput,
      title: form.name || undefined,
      useLlm: useLlm.value
    })
    applyCompileResult(data)
    ElMessage.success(`已生成 ${data.steps.length} 个步骤`)
  } finally {
    compileLoading.value = false
  }
}

function applyCompileResult(result: CompileResult) {
  form.steps = result.steps.map((step, index) => ({ ...step, index: index + 1 }))
  if (!form.name.trim() && result.title) form.name = result.title
  compileWarnings.value = result.warnings || []
  compileEngine.value = result.engine
}

function addStep() {
  form.steps.push({
    index: form.steps.length + 1,
    action: 'click',
    selector: '',
    value: '',
    description: '点击元素'
  })
}

function removeStep(index: number) {
  form.steps.splice(index, 1)
  form.steps.forEach((step, i) => (step.index = i + 1))
}

function moveStep(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= form.steps.length) return
  const [item] = form.steps.splice(index, 1)
  form.steps.splice(target, 0, item)
  form.steps.forEach((step, i) => (step.index = i + 1))
}

async function saveCase(runAfter = false) {
  if (!form.projectId) {
    ElMessage.warning('请选择项目')
    return
  }
  if (!form.name.trim()) {
    ElMessage.warning('请输入用例名称')
    return
  }
  if (!form.steps.length && !form.nlInput.trim()) {
    ElMessage.warning('请添加步骤，或输入自然语言描述后生成步骤')
    return
  }
  saving.value = true
  try {
    const payload = {
      projectId: form.projectId,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      nlInput: form.nlInput.trim() || undefined,
      steps: form.steps.length ? form.steps.map((step, index) => ({ ...step, index: index + 1 })) : undefined,
      tags: form.tags,
      priority: form.priority,
      status: form.status,
      timeoutSeconds: form.timeoutSeconds,
      headless: form.headless,
      screenshotEachStep: form.screenshotEachStep
    }
    let saved: CaseDetail
    if (drawerMode.value === 'edit' && editingCase.value) {
      const { data } = await caseApi.update(editingCase.value.id, payload)
      saved = data
      ElMessage.success('用例已保存，版本已递增')
    } else {
      const { data } = await caseApi.create(payload)
      saved = data
      ElMessage.success('用例已创建')
    }
    drawerVisible.value = false
    await loadCases()
    if (runAfter) {
      await openRunDialog(saved)
    }
  } finally {
    saving.value = false
  }
}

async function duplicateCase(row: CaseSummary) {
  await caseApi.duplicate(row.id)
  ElMessage.success('已复制用例')
  await loadCases()
}

async function removeCase(row: CaseSummary) {
  try {
    await ElMessageBox.confirm(
      `确定删除用例「${row.name}」吗？执行历史仍会保留快照。`,
      '删除用例',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await caseApi.remove(row.id)
  ElMessage.success('用例已删除')
  await loadCases()
}

async function openRunDialog(row: CaseSummary | CaseDetail) {
  runTarget.value = row
  runEnvId.value = undefined
  runHeadless.value = (row as CaseDetail).headless ?? true
  runDialogVisible.value = true
  const { data } = await environmentApi.list(row.projectId)
  runEnvironments.value = data
  const defaultEnv = data.find((env) => env.defaultEnv) || data[0]
  runEnvId.value = defaultEnv?.id
}

async function confirmRun() {
  if (!runTarget.value) return
  running.value = true
  try {
    const { data } = await caseApi.run(runTarget.value.id, {
      environmentId: runEnvId.value,
      headless: runHeadless.value
    })
    ElMessage.success('执行已进入队列')
    runDialogVisible.value = false
    router.push(`/runs/${data.id}`)
  } finally {
    running.value = false
  }
}

async function uploadAttachment(options: any) {
  if (!editingCase.value) return
  uploading.value = true
  try {
    const { data } = await caseApi.uploadAttachment(editingCase.value.id, options.file)
    attachments.value = [data, ...attachments.value]
    ElMessage.success('附件已上传')
  } finally {
    uploading.value = false
  }
}

async function downloadAttachment(attachment: Attachment) {
  await caseApi.downloadAttachment(attachment.id, attachment.fileName)
}

async function removeAttachment(attachment: Attachment) {
  await ElMessageBox.confirm(`确定删除附件「${attachment.fileName}」吗？`, '删除附件', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  await caseApi.deleteAttachment(attachment.id)
  attachments.value = attachments.value.filter((item) => item.id !== attachment.id)
  ElMessage.success('附件已删除')
}

async function exportCases() {
  if (!filters.projectId) {
    ElMessage.warning('请先选择要导出的项目')
    return
  }
  await caseApi.exportCases(filters.projectId)
  ElMessage.success('用例包已导出')
}

function openImport() {
  importResult.value = null
  importFile.value = null
  importProjectId.value = filters.projectId || projects.value[0]?.id
  importVisible.value = true
}

function onImportChange(file: any) {
  importFile.value = file.raw
  importResult.value = null
}

async function confirmImport() {
  if (!importProjectId.value) {
    ElMessage.warning('请选择导入目标项目')
    return
  }
  if (!importFile.value) {
    ElMessage.warning('请选择 JSON 用例包')
    return
  }
  importing.value = true
  try {
    const { data } = await caseApi.importCases(importProjectId.value, importFile.value)
    importResult.value = data
    if (data.imported > 0) {
      ElMessage.success(`成功导入 ${data.imported} 条用例`)
      await loadCases()
    }
  } finally {
    importing.value = false
  }
}

function goRuns() {
  router.push('/runs')
}

onMounted(async () => {
  await loadProjects()
  await loadCases()
})
</script>

<template>
  <div class="page cases-page">
    <PageHeader
      title="测试用例"
      subtitle="管理可复用的测试资产：自然语言、步骤、断言与附件都在同一个版本里。"
      eyebrow="TEST ASSETS"
    >
      <template #actions>
        <el-button @click="openImport">
          <el-icon><Upload /></el-icon>
          导入
        </el-button>
        <el-button @click="exportCases">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新建用例
        </el-button>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <el-select v-model="filters.projectId" placeholder="全部项目" clearable @change="search">
        <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
      </el-select>
      <el-input
        v-model="filters.keyword"
        class="search-wide"
        placeholder="搜索用例名称、描述或标签"
        clearable
        @keyup.enter="search"
        @clear="search"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="filters.status" placeholder="全部状态" clearable @change="search">
        <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-model="filters.priority" placeholder="全部优先级" clearable @change="search">
        <el-option v-for="item in priorityOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-button type="primary" plain @click="search">查询</el-button>
      <el-button text @click="resetFilters">重置</el-button>
      <span class="grow" />
      <span class="muted text-xs">共 {{ total }} 条用例</span>
    </div>

    <div v-if="cases.length" class="table-card">
      <el-table v-loading="loading" :data="cases" @row-dblclick="openEdit">
        <el-table-column label="用例" min-width="290">
          <template #default="{ row }">
            <div class="case-cell">
              <span class="case-mark">FT</span>
              <div class="case-copy">
                <b>{{ row.name }}</b>
                <span>{{ row.projectName }} · v{{ row.version }} · {{ row.stepCount }} 个步骤</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="160">
          <template #default="{ row }">
            <div class="tag-list">
              <span v-for="tag in row.tags.slice(0, 3)" :key="tag" class="soft-tag">{{ tag }}</span>
              <span v-if="row.tags.length > 3" class="soft-tag">+{{ row.tags.length - 3 }}</span>
              <span v-if="!row.tags.length" class="muted-2 text-xs">—</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="82">
          <template #default="{ row }">
            <span class="priority-pill" :class="priorityMeta(row.priority).tone">
              {{ priorityMeta(row.priority).label }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="更新" width="118">
          <template #default="{ row }">
            <span class="muted text-xs">{{ timeAgo(row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="196" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" size="small" @click="openRunDialog(row)">
                <el-icon><VideoPlay /></el-icon>运行
              </el-button>
              <el-button link size="small" @click="openEdit(row)">
                <el-icon><Edit /></el-icon>编辑
              </el-button>
              <el-dropdown trigger="click">
                <el-button link size="small">
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="duplicateCase(row)">
                      <el-icon><Files /></el-icon>复制用例
                    </el-dropdown-item>
                    <el-dropdown-item @click="goRuns">
                      <el-icon><VideoPlay /></el-icon>查看执行
                    </el-dropdown-item>
                    <el-dropdown-item divided @click="removeCase(row)">
                      <el-icon><Delete /></el-icon>删除用例
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-foot">
        <span>双击行可快速打开编辑器</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @size-change="search"
          @current-change="loadCases"
        />
      </div>
    </div>

    <EmptyState
      v-else-if="!loading"
      title="还没有测试用例"
      description="用自然语言描述一条业务流程，AI 工坊会帮你编译成可执行步骤与断言。"
      icon="▤"
    >
      <el-button type="primary" @click="openCreate">新建用例</el-button>
      <el-button @click="router.push('/studio')">去 AI 工坊</el-button>
    </EmptyState>

    <!-- 用例编辑器 -->
    <el-drawer v-model="drawerVisible" :title="drawerTitle" size="820px" destroy-on-close>
      <template #header>
        <div class="drawer-head">
          <div>
            <div class="eyebrow">CASE EDITOR</div>
            <h2>{{ drawerTitle }}</h2>
          </div>
          <StatusTag :status="form.status" />
        </div>
      </template>

      <div class="editor">
        <div class="meta-grid">
          <el-form-item label="所属项目" required>
            <el-select v-model="form.projectId" placeholder="选择项目">
              <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="优先级">
            <el-select v-model="form.priority">
              <el-option v-for="item in priorityOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="超时（秒）">
            <el-input-number v-model="form.timeoutSeconds" :min="5" :max="300" controls-position="right" />
          </el-form-item>
        </div>

        <el-form-item label="用例名称" required>
          <el-input v-model="form.name" maxlength="160" placeholder="例如：登录 · 搜索 · 加购全链路" />
        </el-form-item>
        <el-form-item label="用例描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            resize="none"
            maxlength="1200"
            placeholder="这条用例验证什么业务目标？"
          />
        </el-form-item>

        <div class="section-head">
          <div>
            <h3>自然语言</h3>
            <p>一句话一行，FlowTest 会自动编译为步骤；也可以直接维护下方步骤。</p>
          </div>
          <div class="compile-actions">
            <el-checkbox v-model="useLlm" size="small">优先使用 LLM</el-checkbox>
            <el-button type="primary" size="small" :loading="compileLoading" @click="compileNl">
              <el-icon><MagicStick /></el-icon>
              生成步骤
            </el-button>
          </div>
        </div>
        <el-input
          v-model="form.nlInput"
          type="textarea"
          :rows="6"
          resize="vertical"
          placeholder="打开 /demo/index.html&#10;在 #username 输入 ${demoUser}&#10;点击 #login-btn&#10;断言文本包含 欢迎回来"
        />
        <div class="compile-meta">
          <span v-if="compileEngine">编译引擎：{{ compileEngine }}</span>
          <span v-else>支持「打开 / 点击 / 输入 / 断言文本包含 / 断言元素可见 / 截图」等动作</span>
        </div>
        <el-alert
          v-for="warning in compileWarnings"
          :key="warning"
          class="compile-warning"
          :title="warning"
          type="warning"
          show-icon
          :closable="false"
        />

        <div class="section-head steps-head">
          <div>
            <h3>执行步骤 <span class="count-badge">{{ stepCount }}</span></h3>
            <p>索引会自动重排。断言失败时，后续步骤会被标记为跳过。</p>
          </div>
          <el-button size="small" @click="addStep">
            <el-icon><Plus /></el-icon>
            添加步骤
          </el-button>
        </div>

        <div v-if="form.steps.length" class="steps-editor">
          <div v-for="(step, index) in form.steps" :key="index" class="step-edit-row">
            <div class="step-edit-index">{{ index + 1 }}</div>
            <div class="step-edit-fields">
              <el-select v-model="step.action" size="small" class="action-select">
                <el-option v-for="action in actionOptions" :key="action" :label="actionLabel(action)" :value="action" />
              </el-select>
              <el-input v-model="step.selector" size="small" placeholder="选择器，例如 #login-btn" />
              <el-input v-model="step.value" size="small" placeholder="参数值，例如 ${demoUser}" />
              <el-input v-model="step.description" size="small" placeholder="步骤描述" />
            </div>
            <div class="step-edit-actions">
              <button type="button" title="上移" @click="moveStep(index, -1)">↑</button>
              <button type="button" title="下移" @click="moveStep(index, 1)">↓</button>
              <button type="button" class="danger" title="删除" @click="removeStep(index)">×</button>
            </div>
          </div>
        </div>
        <div v-else class="steps-empty">
          还没有步骤。输入自然语言后点击「生成步骤」，或手动添加。
        </div>

        <div class="section-head">
          <div>
            <h3>标签与执行选项</h3>
            <p>标签用于快速筛选，执行选项会影响每次运行。</p>
          </div>
        </div>
        <el-form-item label="标签">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入标签"
            style="width: 100%"
          >
            <el-option v-for="tag in tagOptions" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
        <div class="switch-row">
          <div>
            <b>无头模式</b>
            <span>后台启动 Chrome，适合 CI 与定时任务</span>
          </div>
          <el-switch v-model="form.headless" />
        </div>
        <div class="switch-row">
          <div>
            <b>每步截图</b>
            <span>保存每一步的页面截图，失败时一定会截图</span>
          </div>
          <el-switch v-model="form.screenshotEachStep" />
        </div>

        <div class="section-head attachment-head">
          <div>
            <h3>附件 <span class="count-badge">{{ attachments.length }}</span></h3>
            <p>上传测试数据、图片等文件，步骤中可通过文件名引用。</p>
          </div>
          <el-upload
            v-if="canUpload"
            :show-file-list="false"
            :http-request="uploadAttachment"
            :disabled="uploading"
          >
            <el-button size="small" :loading="uploading">
              <el-icon><Paperclip /></el-icon>
              上传附件
            </el-button>
          </el-upload>
        </div>
        <div v-if="canUpload" class="attachments">
          <div v-for="attachment in attachments" :key="attachment.id" class="attachment-row">
            <span class="attachment-icon"><el-icon><Paperclip /></el-icon></span>
            <div class="attachment-copy">
              <b>{{ attachment.fileName }}</b>
              <span>{{ formatBytes(attachment.size) }} · {{ formatDate(attachment.createdAt) }}</span>
            </div>
            <el-button link size="small" @click="downloadAttachment(attachment)">
              <el-icon><Download /></el-icon>
            </el-button>
            <el-button link type="danger" size="small" @click="removeAttachment(attachment)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div v-if="!attachments.length" class="muted text-xs attachment-empty">
            暂无附件。上传后可在「上传文件」步骤中使用文件名。
          </div>
        </div>
        <div v-else class="attachment-locked">
          <el-icon><Paperclip /></el-icon>
          保存用例后即可上传附件
        </div>

        <div class="editor-tip">
          <span>变量格式</span>
          <code>${demoUser}</code>
          <span>会在执行时从环境变量中替换。</span>
        </div>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <div class="footer-hint">版本 v{{ editingCase?.version || 1 }} · 保存后自动递增</div>
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" plain :loading="saving" @click="saveCase(true)">保存并运行</el-button>
          <el-button type="primary" :loading="saving" @click="saveCase(false)">保存用例</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 运行配置 -->
    <el-dialog v-model="runDialogVisible" title="运行用例" width="440px">
      <div class="run-dialog-case">
        <span class="run-dialog-mark">▶</span>
        <div>
          <b>{{ runTarget?.name }}</b>
          <p>{{ runTarget?.projectName }}</p>
        </div>
      </div>
      <el-form label-position="top">
        <el-form-item label="执行环境">
          <el-select v-model="runEnvId" placeholder="选择环境" style="width: 100%">
            <el-option v-for="env in runEnvironments" :key="env.id" :label="env.name" :value="env.id">
              <span>{{ env.name }}</span>
              <span class="env-default" v-if="env.defaultEnv">默认</span>
            </el-option>
          </el-select>
        </el-form-item>
        <div class="switch-row compact">
          <div>
            <b>无头模式</b>
            <span>不显示浏览器窗口</span>
          </div>
          <el-switch v-model="runHeadless" />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="runDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="running" @click="confirmRun">
          <el-icon><VideoPlay /></el-icon>
          开始执行
        </el-button>
      </template>
    </el-dialog>

    <!-- 导入用例 -->
    <el-dialog v-model="importVisible" title="导入用例包" width="520px">
      <el-form label-position="top">
        <el-form-item label="导入到项目">
          <el-select v-model="importProjectId" placeholder="选择目标项目" style="width: 100%">
            <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-upload
        drag
        action="#"
        accept=".json,application/json"
        :auto-upload="false"
        :limit="1"
        :on-change="onImportChange"
        :on-exceed="() => ElMessage.warning('一次只能导入一个文件')"
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">把 JSON 用例包拖到这里，或 <em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 FlowTest 导出的用例包，导入后状态为「就绪」。</div>
        </template>
      </el-upload>

      <el-alert
        v-if="importResult"
        class="mt-16"
        :title="`成功导入 ${importResult.imported} 条用例`"
        :type="importResult.warnings.length ? 'warning' : 'success'"
        show-icon
        :closable="false"
      >
        <div v-if="importResult.warnings.length" class="import-warnings">
          <p v-for="warning in importResult.warnings" :key="warning">{{ warning }}</p>
        </div>
      </el-alert>

      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button type="primary" :loading="importing" :disabled="!!importResult" @click="confirmImport">
          开始导入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.case-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.case-mark {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #f0f0ff, #e4e2ff);
  color: var(--ft-primary);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.03em;
}

.case-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.case-copy b {
  font-size: 12px;
  color: #2f3242;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-copy span {
  font-size: 9.5px;
  color: #9a9dae;
}

.tag-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.soft-tag {
  display: inline-flex;
  padding: 2px 7px;
  border-radius: 5px;
  background: #f5f5fa;
  color: #7b7f91;
  font-size: 9px;
  font-weight: 600;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.row-actions :deep(.el-button) {
  padding: 2px 5px;
  font-size: 10.5px;
}

.drawer-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.drawer-head h2 {
  margin: 3px 0 0;
  font-size: 19px;
  letter-spacing: -0.03em;
}

.editor {
  padding-bottom: 10px;
}

.meta-grid {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 0.8fr 0.8fr;
  gap: 0 12px;
}

.meta-grid :deep(.el-form-item) {
  margin-bottom: 14px;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 24px 0 10px;
}

.section-head h3 {
  margin: 0;
  font-size: 13px;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 7px;
}

.section-head p {
  margin: 4px 0 0;
  color: var(--ft-muted);
  font-size: 10px;
  line-height: 1.5;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 9px;
}

.compile-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.compile-meta {
  margin-top: 6px;
  color: #a0a3b1;
  font-size: 9.5px;
}

.compile-warning {
  margin-top: 8px;
}

.steps-head {
  margin-top: 26px;
}

.steps-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-edit-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 1px solid var(--ft-line);
  border-radius: 10px;
  background: #fbfbfd;
}

.step-edit-index {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 9px;
  font-weight: 800;
}

.step-edit-fields {
  flex: 1;
  display: grid;
  grid-template-columns: 120px 1.2fr 1fr 1.1fr;
  gap: 6px;
  min-width: 0;
}

.step-edit-actions {
  display: flex;
  gap: 2px;
}

.step-edit-actions button {
  width: 22px;
  height: 25px;
  border-radius: 6px;
  border: 1px solid var(--ft-line);
  background: #fff;
  color: #8b8e9f;
  font-size: 11px;
  cursor: pointer;
}

.step-edit-actions button:hover {
  border-color: #c9caf0;
  color: var(--ft-primary);
}

.step-edit-actions button.danger:hover {
  border-color: #fecaca;
  color: var(--ft-danger);
}

.steps-empty {
  padding: 22px;
  text-align: center;
  border: 1px dashed var(--ft-line-strong);
  border-radius: 10px;
  color: #a0a3b1;
  font-size: 10.5px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 11px 0;
  border-top: 1px dashed #eef0f5;
}

.switch-row b {
  display: block;
  font-size: 11px;
  color: #3f4252;
}

.switch-row span {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: #a0a3b1;
}

.switch-row.compact {
  border-top: 0;
  padding: 6px 0;
}

.attachment-head {
  border-top: 1px solid var(--ft-line);
  padding-top: 20px;
}

.attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.attachment-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid var(--ft-line);
  border-radius: 9px;
  background: #fbfbfd;
}

.attachment-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 11px;
}

.attachment-copy {
  flex: 1;
  min-width: 0;
}

.attachment-copy b {
  display: block;
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-copy span {
  display: block;
  margin-top: 2px;
  color: #a0a3b1;
  font-size: 8.5px;
}

.attachment-empty {
  padding: 10px 0;
}

.attachment-locked {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a0a3b1;
  font-size: 10px;
  padding: 12px;
  border-radius: 9px;
  background: #fafafd;
}

.editor-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 18px;
  font-size: 9.5px;
  color: #9a9dae;
}

.editor-tip code {
  background: #f1f1ff;
  color: var(--ft-primary);
  border-radius: 4px;
  padding: 2px 5px;
}

.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.footer-hint {
  margin-right: auto;
  color: #a0a3b1;
  font-size: 9.5px;
}

.run-dialog-case {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: #fafafd;
  border: 1px solid var(--ft-line);
  margin-bottom: 16px;
}

.run-dialog-mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 10px;
}

.run-dialog-case b {
  display: block;
  font-size: 11.5px;
}

.run-dialog-case p {
  margin: 2px 0 0;
  color: #a0a3b1;
  font-size: 9.5px;
}

.env-default {
  float: right;
  font-size: 9px;
  color: var(--ft-primary);
  background: #efefff;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 8px;
}

.import-warnings {
  margin-top: 6px;
}

.import-warnings p {
  margin: 2px 0;
  font-size: 10.5px;
}

@media (max-width: 720px) {
  .meta-grid {
    grid-template-columns: 1fr 1fr;
  }

  .step-edit-fields {
    grid-template-columns: 1fr;
  }

  .step-edit-row {
    align-items: flex-start;
  }

  .section-head {
    align-items: flex-start;
  }
}
</style>
