<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowRight,
  Close,
  MagicStick,
  Refresh,
  RefreshRight,
  VideoPlay
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { projectApi, runApi, statsApi } from '@/api'
import { formatDuration, timeAgo, triggerLabel } from '@/utils/format'
import type { Project, Run, StatsOverview } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const refreshing = ref(false)
const runs = ref<Run[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const projects = ref<Project[]>([])
const overview = ref<StatsOverview | null>(null)
const acting = ref<number>()
let timer: number | undefined

const filters = reactive({
  projectId: route.query.projectId ? Number(route.query.projectId) : undefined as number | undefined,
  status: typeof route.query.status === 'string' ? route.query.status : '',
  triggerType: ''
})

const statusOptions = [
  { value: 'QUEUED', label: '排队中' },
  { value: 'RUNNING', label: '执行中' },
  { value: 'PASSED', label: '通过' },
  { value: 'FAILED', label: '失败' },
  { value: 'ERROR', label: '异常' },
  { value: 'CANCELLED', label: '已取消' }
]
const triggerOptions = [
  { value: 'MANUAL', label: '手动' },
  { value: 'SCHEDULE', label: '定时' },
  { value: 'API', label: 'API' },
  { value: 'RETRY', label: '重试' }
]

const hasActive = computed(() =>
  runs.value.some((run) => ['QUEUED', 'RUNNING'].includes(run.status))
)
const statusCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const run of runs.value) counts[run.status] = (counts[run.status] || 0) + 1
  return counts
})

async function load(silent = false) {
  if (silent) refreshing.value = true
  else loading.value = true
  try {
    const { data } = await runApi.list({
      projectId: filters.projectId,
      status: filters.status || undefined,
      triggerType: filters.triggerType || undefined,
      page: page.value,
      size: size.value
    })
    runs.value = data.content
    total.value = data.total
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function loadMeta() {
  const [projectsRes, statsRes] = await Promise.allSettled([projectApi.list(), statsApi.overview()])
  if (projectsRes.status === 'fulfilled') projects.value = projectsRes.value.data
  if (statsRes.status === 'fulfilled') overview.value = statsRes.value.data
}

function search() {
  page.value = 1
  load()
}

function resetFilters() {
  filters.projectId = undefined
  filters.status = ''
  filters.triggerType = ''
  page.value = 1
  load()
}

function openRun(run: Run) {
  router.push(`/runs/${run.id}`)
}

async function rerun(run: Run) {
  acting.value = run.id
  try {
    const { data } = await runApi.rerun(run.id)
    ElMessage.success('已创建新的执行')
    router.push(`/runs/${data.id}`)
  } finally {
    acting.value = undefined
  }
}

async function cancelRun(run: Run) {
  try {
    await ElMessageBox.confirm(
      `确定取消执行 #${run.id} 吗？当前步骤结束后会停止。`,
      '取消执行',
      { type: 'warning', confirmButtonText: '取消执行', cancelButtonText: '继续等待' }
    )
  } catch {
    return
  }
  acting.value = run.id
  try {
    await runApi.cancel(run.id)
    ElMessage.success('已发送取消请求')
    await load(true)
  } finally {
    acting.value = undefined
  }
}

function rowClass({ row }: { row: Run }) {
  return ['QUEUED', 'RUNNING'].includes(row.status) ? 'active-row' : ''
}

onMounted(async () => {
  await Promise.all([load(), loadMeta()])
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && hasActive.value) load(true)
  }, 5000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="page runs-page">
    <PageHeader
      title="执行记录"
      subtitle="每一次运行都有快照、步骤、截图和控制台日志，失败也能快速定位。"
      eyebrow="EXECUTION HISTORY"
    >
      <template #actions>
        <el-button :loading="refreshing" @click="load(true)">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="primary" @click="router.push('/studio')">
          <el-icon><MagicStick /></el-icon>
          发起新执行
        </el-button>
      </template>
    </PageHeader>

    <section class="run-stats">
      <div class="run-stat">
        <span class="run-stat-icon"><el-icon><VideoPlay /></el-icon></span>
        <div>
          <b>{{ overview?.runCount ?? '—' }}</b>
          <span>累计执行</span>
        </div>
        <small>近 7 天 {{ overview?.runs7d ?? 0 }} 次</small>
      </div>
      <div class="run-stat">
        <span class="run-stat-icon green">✓</span>
        <div>
          <b>{{ overview?.passRate ?? '—' }}<em v-if="overview">%</em></b>
          <span>近 7 天通过率</span>
        </div>
        <small>平均 {{ overview ? formatDuration(overview.avgDurationMs) : '—' }}</small>
      </div>
      <div class="run-stat">
        <span class="run-stat-icon violet">◉</span>
        <div>
          <b>{{ overview?.activeRuns ?? 0 }}</b>
          <span>当前活跃</span>
        </div>
        <small class="live-note" :class="{ on: hasActive }">
          <i />{{ hasActive ? '列表自动刷新中' : '队列空闲' }}
        </small>
      </div>
    </section>

    <div class="filter-bar">
      <el-select v-model="filters.projectId" placeholder="全部项目" clearable @change="search">
        <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
      </el-select>
      <el-select v-model="filters.status" placeholder="全部状态" clearable @change="search">
        <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-model="filters.triggerType" placeholder="全部触发方式" clearable @change="search">
        <el-option v-for="item in triggerOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-button type="primary" plain @click="search">查询</el-button>
      <el-button text @click="resetFilters">重置</el-button>
      <span class="grow" />
      <div class="quick-status">
        <button
          v-for="item in statusOptions.slice(2, 5)"
          :key="item.value"
          type="button"
          :class="{ active: filters.status === item.value }"
          @click="filters.status = filters.status === item.value ? '' : item.value; search()"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <div v-if="runs.length" class="table-card">
      <el-table
        v-loading="loading"
        :data="runs"
        :row-class-name="rowClass"
        @row-click="openRun"
      >
        <el-table-column label="执行 / 用例" min-width="260">
          <template #default="{ row }">
            <div class="run-cell">
              <span class="run-id" :class="{ live: ['QUEUED', 'RUNNING'].includes(row.status) }">
                #{{ row.id }}
              </span>
              <div class="run-copy">
                <b>{{ row.caseName }}</b>
                <span>
                  {{ row.projectName }} · {{ row.environmentName || '默认环境' }}
                  <template v-if="row.batchId"> · 批次 {{ row.batchId.slice(0, 8) }}</template>
                </span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="触发" width="92">
          <template #default="{ row }">
            <span class="trigger-chip" :class="row.triggerType?.toLowerCase()">
              {{ triggerLabel(row.triggerType) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="步骤" width="132">
          <template #default="{ row }">
            <div class="steps-cell">
              <div class="steps-bar">
                <span class="ok" :style="{ width: `${row.totalSteps ? (row.passedSteps / row.totalSteps) * 100 : 0}%` }" />
                <span class="bad" :style="{ width: `${row.totalSteps ? (row.failedSteps / row.totalSteps) * 100 : 0}%` }" />
              </div>
              <span>{{ row.passedSteps }}/{{ row.totalSteps }} 通过</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="96">
          <template #default="{ row }">
            <StatusTag :status="row.status" :pulse="row.status === 'RUNNING'" />
          </template>
        </el-table-column>

        <el-table-column label="耗时" width="90">
          <template #default="{ row }">
            <span class="mono muted text-xs">{{ formatDuration(row.durationMs) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="发起人" width="92">
          <template #default="{ row }">
            <span class="requester">{{ row.requestedBy || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="时间" width="112">
          <template #default="{ row }">
            <span class="muted text-xs">{{ timeAgo(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="176" fixed="right">
          <template #default="{ row }">
            <div class="row-actions" @click.stop>
              <el-button link type="primary" size="small" @click="openRun(row)">
                报告<el-icon><ArrowRight /></el-icon>
              </el-button>
              <el-button
                v-if="['QUEUED', 'RUNNING'].includes(row.status)"
                link
                type="danger"
                size="small"
                :loading="acting === row.id"
                @click="cancelRun(row)"
              >
                <el-icon><Close /></el-icon>取消
              </el-button>
              <el-button
                v-else
                link
                size="small"
                :loading="acting === row.id"
                @click="rerun(row)"
              >
                <el-icon><RefreshRight /></el-icon>重跑
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-foot">
        <span>
          <template v-if="Object.keys(statusCounts).length">
            当前页：通过 {{ statusCounts.PASSED || 0 }} · 失败 {{ statusCounts.FAILED || 0 }} ·
            执行中 {{ statusCounts.RUNNING || 0 }}
          </template>
          <template v-else>点击行可打开执行报告</template>
        </span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="sizes, prev, pager, next"
          @size-change="search"
          @current-change="load"
        />
      </div>
    </div>

    <EmptyState
      v-else-if="!loading"
      title="没有匹配的执行记录"
      description="调整筛选条件，或者从 AI 工坊发起一次新的执行。"
      icon="▶"
    >
      <el-button @click="resetFilters">重置筛选</el-button>
      <el-button type="primary" @click="router.push('/studio')">发起执行</el-button>
    </EmptyState>
  </div>
</template>

<style scoped>
.run-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.run-stat {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 15px 17px;
  border-radius: 14px;
  border: 1px solid var(--ft-line);
  background: #fff;
  box-shadow: var(--ft-shadow-sm);
}

.run-stat-icon {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 14px;
  font-weight: 800;
}

.run-stat-icon.green {
  background: #eefbf4;
  color: #15803d;
  font-size: 17px;
}

.run-stat-icon.violet {
  background: #f5f0ff;
  color: #7c3aed;
  font-size: 16px;
}

.run-stat > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.run-stat b {
  font-size: 20px;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.run-stat b em {
  font-style: normal;
  font-size: 10px;
  color: #9a9dae;
  margin-left: 1px;
}

.run-stat span:not(.run-stat-icon) {
  font-size: 9px;
  color: #9a9dae;
}

.run-stat small {
  margin-left: auto;
  font-size: 8.5px;
  color: #b0b3c1;
  text-align: right;
}

.live-note {
  display: flex;
  align-items: center;
  gap: 4px;
}

.live-note i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #cbd5e1;
}

.live-note.on {
  color: #15803d;
}

.live-note.on i {
  background: #22c55e;
  animation: ft-pulse 1.4s infinite;
}

.quick-status {
  display: flex;
  gap: 3px;
}

.quick-status button {
  border: 1px solid #ececf4;
  background: #fafafd;
  color: #8b8e9f;
  border-radius: 7px;
  font-size: 9px;
  font-weight: 600;
  padding: 5px 8px;
  cursor: pointer;
}

.quick-status button.active {
  background: #efefff;
  border-color: #d8d8fa;
  color: var(--ft-primary);
}

.run-cell {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.run-id {
  flex: 0 0 auto;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 8.5px;
  font-weight: 800;
  color: #8b8e9f;
  background: #f4f4f9;
  border-radius: 5px;
  padding: 3px 5px;
}

.run-id.live {
  color: var(--ft-primary);
  background: #efefff;
}

.run-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.run-copy b {
  font-size: 11.5px;
  color: #2f3242;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-copy span {
  font-size: 8.5px;
  color: #9a9dae;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-chip {
  display: inline-flex;
  padding: 3px 7px;
  border-radius: 5px;
  background: #f5f5fa;
  color: #6f7385;
  font-size: 8.5px;
  font-weight: 700;
}

.trigger-chip.api {
  background: #f0f9ff;
  color: #0369a1;
}

.trigger-chip.schedule {
  background: #fffbeb;
  color: #b45309;
}

.trigger-chip.retry {
  background: #fef2f2;
  color: #b91c1c;
}

.steps-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.steps-bar {
  display: flex;
  width: 76px;
  height: 4px;
  border-radius: 99px;
  background: #f1f2f7;
  overflow: hidden;
}

.steps-bar span.ok {
  background: #22c55e;
}

.steps-bar span.bad {
  background: #ef4444;
}

.steps-cell > span {
  font-size: 8.5px;
  color: #9a9dae;
}

.requester {
  font-size: 9.5px;
  color: #7b7f91;
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

:deep(.el-table .active-row) {
  background: linear-gradient(90deg, rgba(91, 91, 214, 0.035), transparent 55%);
}

@media (max-width: 900px) {
  .run-stats {
    grid-template-columns: 1fr;
  }

  .run-stat small {
    display: none;
  }

  .quick-status {
    display: none;
  }
}
</style>
