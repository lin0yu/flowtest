<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import {
  Calendar,
  Delete,
  Edit,
  MoreFilled,
  Plus,
  Refresh,
  SwitchButton,
  Timer
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { caseApi, environmentApi, projectApi, taskApi } from '@/api'
import { formatDate, timeAgo } from '@/utils/format'
import type { CaseSummary, Environment, Project, Task } from '@/types'

const router = useRouter()
const loading = ref(true)
const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const environments = ref<Environment[]>([])
const projectCases = ref<CaseSummary[]>([])
const dialogVisible = ref(false)
const saving = ref(false)
const editing = ref<Task | null>(null)
const triggering = ref<number>()
const casesLoading = ref(false)
const form = reactive({
  projectId: undefined as number | undefined,
  environmentId: undefined as number | undefined,
  name: '',
  description: '',
  caseIds: [] as number[],
  cronExpression: '',
  enabled: true,
  retryCount: 0,
  timeoutSeconds: 60,
  webhookUrl: ''
})

const dialogTitle = computed(() => (editing.value ? '编辑调度任务' : '新建调度任务'))
const enabledCount = computed(() => tasks.value.filter((task) => task.enabled).length)
const scheduledCount = computed(() => tasks.value.filter((task) => task.cronExpression).length)
const errorCount = computed(() =>
  tasks.value.filter((task) => ['FAILED', 'ERROR'].includes(task.lastRunStatus || '')).length
)

const cronPresets = [
  { label: '每天 09:00', value: '0 0 9 * * *' },
  { label: '每天 18:00', value: '0 0 18 * * *' },
  { label: '每小时', value: '0 0 * * * *' },
  { label: '工作日 09:00', value: '0 0 9 ? * MON-FRI' }
]

async function load() {
  loading.value = true
  try {
    const [tasksRes, projectsRes] = await Promise.allSettled([taskApi.list(), projectApi.list()])
    if (tasksRes.status === 'fulfilled') tasks.value = tasksRes.value.data
    if (projectsRes.status === 'fulfilled') {
      projects.value = projectsRes.value.data
      if (!form.projectId) form.projectId = projects.value[0]?.id
    }
  } finally {
    loading.value = false
  }
}

async function loadEnvironments() {
  environments.value = []
  form.environmentId = undefined
  if (!form.projectId) return
  const { data } = await environmentApi.list(form.projectId)
  environments.value = data
  form.environmentId = (data.find((env) => env.defaultEnv) || data[0])?.id
}

async function loadProjectCases() {
  projectCases.value = []
  form.caseIds = []
  if (!form.projectId) return
  casesLoading.value = true
  try {
    const { data } = await caseApi.list({ projectId: form.projectId, page: 1, size: 100 })
    projectCases.value = data.content
  } finally {
    casesLoading.value = false
  }
}

async function onProjectChange() {
  await Promise.all([loadEnvironments(), loadProjectCases()])
}

function resetForm() {
  form.projectId = projects.value[0]?.id
  form.environmentId = undefined
  form.name = ''
  form.description = ''
  form.caseIds = []
  form.cronExpression = ''
  form.enabled = true
  form.retryCount = 0
  form.timeoutSeconds = 60
  form.webhookUrl = ''
}

async function openCreate() {
  editing.value = null
  resetForm()
  dialogVisible.value = true
  await Promise.all([loadEnvironments(), loadProjectCases()])
}

async function openEdit(task: Task) {
  editing.value = task
  form.projectId = task.projectId
  form.environmentId = task.environmentId
  form.name = task.name
  form.description = task.description || ''
  form.caseIds = [...task.caseIds]
  form.cronExpression = task.cronExpression || ''
  form.enabled = task.enabled
  form.retryCount = task.retryCount
  form.timeoutSeconds = task.timeoutSeconds
  form.webhookUrl = task.webhookUrl || ''
  dialogVisible.value = true
  await Promise.all([loadEnvironments(), loadProjectCases()])
  form.environmentId = task.environmentId
  form.caseIds = [...task.caseIds]
}

async function save() {
  if (!form.projectId) {
    ElMessage.warning('请选择项目')
    return
  }
  if (!form.name.trim()) {
    ElMessage.warning('请输入任务名称')
    return
  }
  if (!form.caseIds.length) {
    ElMessage.warning('请选择至少一个用例')
    return
  }
  saving.value = true
  try {
    const payload = {
      projectId: form.projectId,
      environmentId: form.environmentId,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      caseIds: form.caseIds,
      cronExpression: form.cronExpression.trim() || undefined,
      enabled: form.enabled,
      retryCount: form.retryCount,
      timeoutSeconds: form.timeoutSeconds,
      webhookUrl: form.webhookUrl.trim() || undefined
    }
    if (editing.value) {
      await taskApi.update(editing.value.id, payload)
      ElMessage.success('任务已更新，下次调度已重新计算')
    } else {
      await taskApi.create(payload)
      ElMessage.success('任务已创建')
    }
    dialogVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(task: Task, value: boolean) {
  try {
    await taskApi.update(task.id, {
      projectId: task.projectId,
      environmentId: task.environmentId,
      name: task.name,
      description: task.description,
      caseIds: task.caseIds,
      cronExpression: task.cronExpression,
      enabled: value,
      retryCount: task.retryCount,
      timeoutSeconds: task.timeoutSeconds,
      webhookUrl: task.webhookUrl
    })
    ElMessage.success(value ? '任务已启用' : '任务已停用')
  } catch {
    task.enabled = !value
  }
}

async function triggerTask(task: Task) {
  triggering.value = task.id
  try {
    const { data } = await taskApi.trigger(task.id)
    const runIds = data.runIds || []
    ElNotification({
      title: '任务已触发',
      type: 'success',
      duration: 6000,
      message: `批次 ${data.batchId.slice(0, 8)} · 创建 ${data.runCount} 条执行${
        runIds.length ? ` · #${runIds.join(', #')}` : ''
      }`,
      onClick: () => router.push('/runs')
    })
    await load()
    if (runIds.length === 1) {
      router.push(`/runs/${runIds[0]}`)
    } else {
      router.push('/runs')
    }
  } finally {
    triggering.value = undefined
  }
}

async function removeTask(task: Task) {
  try {
    await ElMessageBox.confirm(
      `确定删除任务「${task.name}」吗？已产生的执行记录仍会保留。`,
      '删除任务',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await taskApi.remove(task.id)
  ElMessage.success('任务已删除')
  await load()
}

function cronSummary(cron?: string) {
  if (!cron) return '手动触发'
  const preset = cronPresets.find((item) => item.value === cron)
  return preset?.label || cron
}

function caseLabel(item: CaseSummary) {
  return item.name
}

onMounted(load)
</script>

<template>
  <div class="page tasks-page" v-loading="loading">
    <PageHeader
      title="任务调度"
      subtitle="把用例编成批次，按 Cron 自动运行，并支持重试、超时与 Webhook 回调。"
      eyebrow="SCHEDULER"
    >
      <template #actions>
        <el-button @click="router.push('/runs')">
          <el-icon><Refresh /></el-icon>
          执行记录
        </el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新建任务
        </el-button>
      </template>
    </PageHeader>

    <section class="task-overview">
      <div class="overview-card">
        <span class="overview-icon"><el-icon><SwitchButton /></el-icon></span>
        <div>
          <b>{{ enabledCount }}</b>
          <span>启用中的任务</span>
        </div>
        <small>共 {{ tasks.length }} 个任务</small>
      </div>
      <div class="overview-card">
        <span class="overview-icon violet"><el-icon><Calendar /></el-icon></span>
        <div>
          <b>{{ scheduledCount }}</b>
          <span>配置了 Cron</span>
        </div>
        <small>自动扫描间隔 15 秒</small>
      </div>
      <div class="overview-card">
        <span class="overview-icon red"><el-icon><Timer /></el-icon></span>
        <div>
          <b>{{ errorCount }}</b>
          <span>最近失败任务</span>
        </div>
        <small>失败后按配置自动重试</small>
      </div>
    </section>

    <div v-if="tasks.length" class="table-card">
      <el-table :data="tasks">
        <el-table-column label="任务" min-width="240">
          <template #default="{ row }">
            <div class="task-cell">
              <span class="task-mark" :class="{ off: !row.enabled }">
                <el-icon><Timer /></el-icon>
              </span>
              <div class="task-copy">
                <b>{{ row.name }}</b>
                <span>{{ row.projectName }} · {{ row.environmentName || '默认环境' }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="关联用例" min-width="220">
          <template #default="{ row }">
            <div class="case-chips">
              <span v-for="name in row.caseNames.slice(0, 2)" :key="name" class="case-chip">{{ name }}</span>
              <span v-if="row.caseNames.length > 2" class="case-chip more">+{{ row.caseNames.length - 2 }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="调度" width="170">
          <template #default="{ row }">
            <div class="schedule-cell">
              <b>{{ cronSummary(row.cronExpression) }}</b>
              <code v-if="row.cronExpression">{{ row.cronExpression }}</code>
              <span v-if="row.nextRunAt">下次 {{ formatDate(row.nextRunAt, 'MM-DD HH:mm') }}</span>
              <span v-else>等待手动触发</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="最近执行" width="142">
          <template #default="{ row }">
            <div class="last-cell">
              <StatusTag v-if="row.lastRunStatus" :status="row.lastRunStatus" />
              <span v-if="!row.lastRunStatus" class="muted-2 text-xs">尚未执行</span>
              <small v-if="row.lastRunAt">{{ timeAgo(row.lastRunAt) }}</small>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="启用" width="70" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              size="small"
              @change="(value) => toggleEnabled(row, value)"
            />
          </template>
        </el-table-column>

        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button
                link
                type="primary"
                size="small"
                :loading="triggering === row.id"
                @click="triggerTask(row)"
              >
                <el-icon><Refresh /></el-icon>触发
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
                    <el-dropdown-item @click="router.push(`/runs`)">查看执行</el-dropdown-item>
                    <el-dropdown-item divided @click="removeTask(row)">
                      <el-icon><Delete /></el-icon>删除任务
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-foot">
        <span>定时任务由后端调度器扫描执行；时间使用本机时区。</span>
        <span>共 {{ tasks.length }} 个任务</span>
      </div>
    </div>

    <EmptyState
      v-else-if="!loading"
      title="还没有调度任务"
      description="把多条用例编成一个批次，按每天、每小时或 Cron 表达式自动执行，并保留完整报告。"
      icon="◷"
    >
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>
        创建第一个任务
      </el-button>
    </EmptyState>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" destroy-on-close>
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="所属项目" required>
            <el-select v-model="form.projectId" placeholder="选择项目" @change="onProjectChange">
              <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="执行环境">
            <el-select v-model="form.environmentId" placeholder="默认环境" clearable>
              <el-option v-for="env in environments" :key="env.id" :label="env.name" :value="env.id" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="任务名称" required>
          <el-input v-model="form.name" maxlength="160" placeholder="例如：每日回归 · 登录与购物车" />
        </el-form-item>

        <el-form-item label="任务描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            resize="none"
            maxlength="1000"
            placeholder="这个任务覆盖哪些业务链路？"
          />
        </el-form-item>

        <el-form-item label="选择用例" required>
          <el-select
            v-model="form.caseIds"
            multiple
            filterable
            :loading="casesLoading"
            placeholder="至少选择一条用例"
            style="width: 100%"
          >
            <el-option
              v-for="item in projectCases"
              :key="item.id"
              :label="caseLabel(item)"
              :value="item.id"
            >
              <span>{{ item.name }}</span>
              <span class="option-meta">{{ item.stepCount }} 步</span>
            </el-option>
          </el-select>
        </el-form-item>

        <div class="form-grid">
          <el-form-item label="Cron 表达式">
            <el-input v-model="form.cronExpression" placeholder="留空则仅手动触发，例如 0 0 9 * * *" />
            <div class="cron-presets">
              <button
                v-for="preset in cronPresets"
                :key="preset.value"
                type="button"
                @click="form.cronExpression = preset.value"
              >
                {{ preset.label }}
              </button>
            </div>
          </el-form-item>
          <el-form-item label="执行选项">
            <div class="option-row">
              <el-input-number v-model="form.retryCount" :min="0" :max="5" controls-position="right" />
              <span>失败重试</span>
            </div>
            <div class="option-row">
              <el-input-number v-model="form.timeoutSeconds" :min="5" :max="300" controls-position="right" />
              <span>单次超时（秒）</span>
            </div>
          </el-form-item>
        </div>

        <el-form-item label="Webhook 地址（可选）">
          <el-input v-model="form.webhookUrl" placeholder="https://example.com/hooks/flowtest" />
          <div class="field-hint">执行结束后，FlowTest 会向该地址 POST 执行结果 JSON。</div>
        </el-form-item>

        <div class="enabled-row">
          <div>
            <b>启用任务</b>
            <span>停用后不再按 Cron 调度，但仍可手动触发。</span>
          </div>
          <el-switch v-model="form.enabled" />
        </div>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ editing ? '保存修改' : '创建任务' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.task-overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.overview-card {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 15px 17px;
  border-radius: 14px;
  border: 1px solid var(--ft-line);
  background: #fff;
  box-shadow: var(--ft-shadow-sm);
}

.overview-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #eefbf4;
  color: #0d9488;
  font-size: 15px;
}

.overview-icon.violet {
  background: #f3f0ff;
  color: #7c3aed;
}

.overview-icon.red {
  background: #fef2f2;
  color: #dc2626;
}

.overview-card > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.overview-card b {
  font-size: 20px;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.overview-card span:not(.overview-icon) {
  font-size: 9px;
  color: #9a9dae;
}

.overview-card small {
  margin-left: auto;
  font-size: 8.5px;
  color: #b0b3c1;
  text-align: right;
}

.task-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.task-mark {
  flex: 0 0 31px;
  width: 31px;
  height: 31px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 13px;
}

.task-mark.off {
  background: #f5f5f8;
  color: #b0b3c1;
}

.task-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-copy b {
  font-size: 11.5px;
  color: #2f3242;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-copy span {
  font-size: 9px;
  color: #9a9dae;
}

.case-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.case-chip {
  display: inline-flex;
  max-width: 132px;
  padding: 2px 6px;
  border-radius: 5px;
  background: #f5f5fa;
  color: #6f7385;
  font-size: 8.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-chip.more {
  background: #efefff;
  color: var(--ft-primary);
}

.schedule-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.schedule-cell b {
  font-size: 10px;
  color: #3f4252;
}

.schedule-cell code {
  font-size: 8px;
  color: #8b8e9f;
}

.schedule-cell span {
  font-size: 8.5px;
  color: #b0b3c1;
}

.last-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.last-cell small {
  font-size: 8.5px;
  color: #a0a3b1;
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

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}

.option-row span {
  font-size: 9.5px;
  color: #9a9dae;
}

.option-row :deep(.el-input-number) {
  width: 105px;
}

.cron-presets {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 7px;
}

.cron-presets button {
  border: 1px solid #ececf4;
  border-radius: 999px;
  background: #fafafd;
  color: #7b7f91;
  font-size: 8.5px;
  padding: 3px 7px;
  cursor: pointer;
}

.cron-presets button:hover {
  border-color: #cfcff3;
  color: var(--ft-primary);
}

.field-hint {
  margin-top: 4px;
  font-size: 9px;
  color: #a0a3b1;
}

.enabled-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px;
  border-radius: 10px;
  background: #fafafd;
  border: 1px solid var(--ft-line);
}

.enabled-row b {
  display: block;
  font-size: 11px;
}

.enabled-row span {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: #a0a3b1;
}

.option-meta {
  float: right;
  color: #a0a3b1;
  font-size: 9px;
}

@media (max-width: 900px) {
  .task-overview {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
