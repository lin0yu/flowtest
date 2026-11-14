<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  CircleCheck,
  Document,
  MagicStick,
  Monitor,
  Timer,
  VideoPlay
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TrendChart from '@/components/TrendChart.vue'
import { projectApi, statsApi, systemApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import {
  formatDuration,
  greeting,
  timeAgo
} from '@/utils/format'
import type { Project, Run, StatsOverview, SystemStatus } from '@/types'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(true)
const stats = ref<StatsOverview | null>(null)
const status = ref<SystemStatus | null>(null)
const projects = ref<Project[]>([])
const quickNl = ref('')
const quickProjectId = ref<number>()

const cards = computed(() => {
  const data = stats.value
  return [
    {
      label: '用例资产',
      value: data?.caseCount ?? '—',
      unit: '条',
      sub: `${data?.projectCount ?? 0} 个项目 · ${data?.taskCount ?? 0} 个任务`,
      icon: Document,
      tone: 'indigo',
      progress: 0
    },
    {
      label: '近 7 天通过率',
      value: data ? `${data.passRate}%` : '—',
      unit: '',
      sub: `共执行 ${data?.runs7d ?? 0} 次`,
      icon: CircleCheck,
      tone: 'dark',
      progress: data?.passRate ?? 0
    },
    {
      label: '执行总量',
      value: data?.runCount ?? '—',
      unit: '次',
      sub: `当前活跃 ${data?.activeRuns ?? 0} 条`,
      icon: VideoPlay,
      tone: 'violet',
      progress: 0
    },
    {
      label: '平均耗时',
      value: data ? formatDuration(data.avgDurationMs) : '—',
      unit: '',
      sub: '近 7 天已完成执行',
      icon: Timer,
      tone: 'mint',
      progress: 0
    }
  ]
})

const recentRuns = computed<Run[]>(() => stats.value?.recentRuns || [])
const failingCases = computed(() => stats.value?.failingCases || [])
const trend = computed(() => stats.value?.trend || [])
const maxFailure = computed(() =>
  Math.max(1, ...failingCases.value.map((item) => item.failures))
)

async function load() {
  loading.value = true
  try {
    const [overviewRes, statusRes, projectsRes] = await Promise.allSettled([
      statsApi.overview(),
      systemApi.status(),
      projectApi.list()
    ])
    if (overviewRes.status === 'fulfilled') stats.value = overviewRes.value.data
    if (statusRes.status === 'fulfilled') status.value = statusRes.value.data
    if (projectsRes.status === 'fulfilled') {
      projects.value = projectsRes.value.data
      quickProjectId.value = quickProjectId.value || projects.value[0]?.id
    }
  } finally {
    loading.value = false
  }
}

function viewRun(run: Run) {
  router.push(`/runs/${run.id}`)
}

function goStudio() {
  router.push({
    path: '/studio',
    query: {
      nl: quickNl.value.trim() || undefined,
      projectId: quickProjectId.value || undefined
    }
  })
}

function fillQuick(text: string) {
  quickNl.value = text
}

function openDemo() {
  window.open('/demo/index.html', '_blank')
}

onMounted(load)
</script>

<template>
  <div class="page dashboard" v-loading="loading">
    <PageHeader
      :title="`${greeting()}，${auth.displayName}`"
      subtitle="今天也把重复的点击交给 FlowTest，把注意力留给真正重要的问题。"
      eyebrow="WORKSPACE OVERVIEW"
    >
      <template #actions>
        <el-button @click="router.push('/runs')">
          <el-icon><VideoPlay /></el-icon>
          执行记录
        </el-button>
        <el-button type="primary" @click="router.push('/studio')">
          <el-icon><MagicStick /></el-icon>
          进入 AI 工坊
        </el-button>
      </template>
    </PageHeader>

    <section class="stat-grid">
      <div
        v-for="card in cards"
        :key="card.label"
        class="stat-card"
        :class="`tone-${card.tone}`"
      >
        <div class="stat-top">
          <span class="stat-icon"><el-icon><component :is="card.icon" /></el-icon></span>
          <span class="stat-label">{{ card.label }}</span>
        </div>
        <div class="stat-value">{{ card.value }}<small>{{ card.unit }}</small></div>
        <div class="stat-sub">{{ card.sub }}</div>
        <div v-if="card.tone === 'dark'" class="stat-progress">
          <span :style="{ width: `${Math.min(100, card.progress)}%` }" />
        </div>
      </div>
    </section>

    <div class="dash-grid">
      <div class="dash-left">
        <section class="ft-card trend-card">
          <div class="ft-card-head">
            <div>
              <h3>执行趋势</h3>
              <p>近 7 天执行次数、通过数与失败数</p>
            </div>
            <span class="head-chip">LAST 7 DAYS</span>
          </div>
          <div class="trend-body">
            <TrendChart :points="trend" />
          </div>
        </section>

        <section class="ft-card recent-card">
          <div class="ft-card-head">
            <div>
              <h3>最近执行</h3>
              <p>实时掌握每一次运行的最终结果</p>
            </div>
            <el-button text size="small" @click="router.push('/runs')">
              查看全部 <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
          <el-table
            v-if="recentRuns.length"
            :data="recentRuns"
            class="recent-table"
            @row-click="viewRun"
          >
            <el-table-column label="用例" min-width="220">
              <template #default="{ row }">
                <div class="run-case">
                  <span class="run-id">#{{ row.id }}</span>
                  <div class="run-case-copy">
                    <b>{{ row.caseName }}</b>
                    <span>{{ row.projectName }} · {{ row.environmentName || '默认环境' }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <StatusTag :status="row.status" :pulse="row.status === 'RUNNING'" />
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="88">
              <template #default="{ row }">
                <span class="mono muted">{{ formatDuration(row.durationMs) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="112">
              <template #default="{ row }">
                <span class="muted text-xs">{{ timeAgo(row.createdAt) }}</span>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="recent-empty">
            <div class="recent-empty-icon">▶</div>
            <b>还没有执行记录</b>
            <p>从 AI 工坊生成第一条用例，或运行内置的 FlowShop 演示用例。</p>
            <el-button size="small" type="primary" @click="router.push('/studio')">立即开始</el-button>
          </div>
        </section>
      </div>

      <div class="dash-right">
        <section class="quick-card">
          <div class="quick-kicker">QUICK START</div>
          <h2>一句话，<br />生成一条测试。</h2>
          <p>描述你要验证的业务流程，FlowTest 会编译步骤、断言并启动 Chrome。</p>
          <el-input
            v-model="quickNl"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="例如：登录后搜索机械键盘并加入购物车"
            @keydown.meta.enter="goStudio"
          />
          <div class="quick-chips">
            <button type="button" @click="fillQuick('登录后搜索机械键盘并加入购物车')">登录 + 搜索 + 加购</button>
            <button type="button" @click="fillQuick('打开首页并断言标题包含 FlowShop')">首页标题断言</button>
          </div>
          <div class="quick-foot">
            <el-select v-model="quickProjectId" size="small" placeholder="选择项目">
              <el-option v-for="item in projects" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-button type="primary" size="small" @click="goStudio">
              去生成
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </section>

        <section class="ft-card engine-card">
          <div class="engine-head">
            <div>
              <h3>执行引擎</h3>
              <p>本机 Chrome · Selenium 4</p>
            </div>
            <span class="engine-live" :class="{ ok: status?.engineReady }">
              <i />{{ status?.engineReady ? '就绪' : '检查中' }}
            </span>
          </div>
          <div class="engine-rows">
            <div class="engine-row">
              <span>浏览器</span>
              <b>{{ status?.browserVersion || status?.browser || 'Google Chrome' }}</b>
            </div>
            <div class="engine-row">
              <span>最大并发</span>
              <b>{{ status?.maxParallel ?? 3 }} 个会话</b>
            </div>
            <div class="engine-row">
              <span>AI 编译</span>
              <b :class="{ accent: status?.llmEnabled }">
                {{ status?.llmEnabled ? status.llmModel : '本地规则引擎' }}
              </b>
            </div>
            <div class="engine-row">
              <span>当前队列</span>
              <b>{{ status?.queuedRuns ?? 0 }} 排队 · {{ status?.activeRuns ?? 0 }} 执行中</b>
            </div>
          </div>
          <button class="engine-demo" type="button" @click="openDemo">
            <span class="engine-demo-icon"><el-icon><Monitor /></el-icon></span>
            <span>
              <b>打开 FlowShop 演示站点</b>
              <small>登录 · 搜索 · 加购 · 可断言 DOM</small>
            </span>
            <span class="engine-demo-arrow">↗</span>
          </button>
        </section>

        <section class="ft-card failing-card">
          <div class="failing-head">
            <h3>高频失败用例</h3>
            <button type="button" @click="router.push('/runs?status=FAILED')">全部 →</button>
          </div>
          <div v-if="failingCases.length" class="failing-list">
            <div v-for="item in failingCases" :key="item.caseName" class="failing-item">
              <div class="failing-line">
                <span>{{ item.caseName }}</span>
                <b>{{ item.failures }} 次</b>
              </div>
              <div class="failing-bar">
                <span :style="{ width: `${(item.failures / maxFailure) * 100}%` }" />
              </div>
            </div>
          </div>
          <div v-else class="failing-empty">
            <span>✓</span>
            <div>
              <b>没有失败堆积</b>
              <p>近期的执行都保持在健康状态。</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  padding-bottom: 10px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.stat-card {
  position: relative;
  overflow: hidden;
  padding: 18px;
  border-radius: 15px;
  border: 1px solid var(--ft-line);
  background: #fff;
  box-shadow: var(--ft-shadow-sm);
}

.stat-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  width: 27px;
  height: 27px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 13px;
  background: #f1f1fc;
  color: var(--ft-primary);
}

.stat-label {
  font-size: 10.5px;
  color: #8b8e9f;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.stat-value {
  margin-top: 15px;
  font-size: 30px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.045em;
}

.stat-value small {
  font-size: 11px;
  font-weight: 700;
  color: #9a9dae;
  margin-left: 4px;
  letter-spacing: 0;
}

.stat-sub {
  margin-top: 8px;
  font-size: 10px;
  color: #a0a3b1;
}

.stat-card.tone-dark {
  background:
    radial-gradient(circle at 100% 0%, rgba(139, 92, 246, 0.4), transparent 48%),
    linear-gradient(135deg, #15162a, #222449);
  border-color: #292b4e;
  color: #fff;
}

.stat-card.tone-dark .stat-label,
.stat-card.tone-dark .stat-sub,
.stat-card.tone-dark .stat-value small {
  color: #9598bd;
}

.stat-card.tone-dark .stat-icon {
  background: rgba(199, 244, 100, 0.12);
  color: var(--ft-accent);
}

.stat-card.tone-violet .stat-icon {
  background: #f5f0ff;
  color: #8b5cf6;
}

.stat-card.tone-mint .stat-icon {
  background: #eefbf4;
  color: #0d9488;
}

.stat-progress {
  height: 4px;
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 99px;
  overflow: hidden;
}

.stat-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ft-accent), #a5f3fc);
}

.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(300px, 0.88fr);
  gap: 18px;
  align-items: start;
}

.dash-left,
.dash-right {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.head-chip {
  font-size: 8.5px;
  letter-spacing: 0.14em;
  font-weight: 800;
  color: #a5a8b7;
  background: #f7f7fb;
  padding: 5px 8px;
  border-radius: 6px;
}

.trend-body {
  padding: 15px 16px 10px;
}

.recent-table {
  cursor: pointer;
}

.run-case {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.run-id {
  flex: 0 0 auto;
  font-size: 9px;
  font-weight: 800;
  color: #8a8d9e;
  background: #f4f4f9;
  border-radius: 5px;
  padding: 3px 5px;
  font-family: "SFMono-Regular", Consolas, monospace;
}

.run-case-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.run-case-copy b {
  font-size: 11.5px;
  font-weight: 700;
  color: #2f3242;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-case-copy span {
  font-size: 9.5px;
  color: #9a9dae;
}

.recent-empty {
  padding: 44px 24px;
  text-align: center;
}

.recent-empty-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  background: #f1f1fc;
  color: var(--ft-primary);
  font-size: 14px;
}

.recent-empty b {
  display: block;
  font-size: 13px;
}

.recent-empty p {
  margin: 6px auto 14px;
  max-width: 320px;
  color: var(--ft-muted);
  font-size: 11px;
  line-height: 1.7;
}

.quick-card {
  position: relative;
  overflow: hidden;
  padding: 22px;
  border-radius: var(--ft-radius);
  background:
    radial-gradient(circle at 100% 0%, rgba(139, 92, 246, 0.28), transparent 42%),
    linear-gradient(145deg, #111222, #1d1e35);
  color: #fff;
  box-shadow: 0 18px 40px rgba(16, 17, 28, 0.2);
}

.quick-kicker {
  font-size: 8.5px;
  letter-spacing: 0.16em;
  font-weight: 800;
  color: var(--ft-accent);
}

.quick-card h2 {
  margin: 10px 0 8px;
  font-size: 23px;
  line-height: 1.18;
  letter-spacing: -0.04em;
}

.quick-card > p {
  margin: 0 0 16px;
  font-size: 10.5px;
  line-height: 1.7;
  color: #9b9eb7;
}

.quick-card :deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: none;
  color: #fff;
  font-size: 11.5px;
  line-height: 1.7;
  padding: 10px 12px;
  border-radius: 10px;
}

.quick-card :deep(.el-textarea__inner::placeholder) {
  color: #62657f;
}

.quick-card :deep(.el-textarea__inner:focus) {
  border-color: rgba(199, 244, 100, 0.45);
  box-shadow: 0 0 0 3px rgba(199, 244, 100, 0.08);
}

.quick-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 9px;
}

.quick-chips button {
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(255, 255, 255, 0.045);
  color: #8f92ac;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 9px;
  cursor: pointer;
  transition: color 0.15s, border 0.15s;
}

.quick-chips button:hover {
  color: var(--ft-accent);
  border-color: rgba(199, 244, 100, 0.3);
}

.quick-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 15px;
}

.quick-foot :deep(.el-select) {
  width: 148px;
}

.quick-foot :deep(.el-select__wrapper) {
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
  min-height: 28px;
}

.quick-foot :deep(.el-select__selected-item) {
  color: #b9bbcf;
  font-size: 10.5px;
}

.engine-card {
  padding: 18px;
}

.engine-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 13px;
}

.engine-head h3,
.failing-head h3 {
  margin: 0;
  font-size: 13px;
  letter-spacing: -0.01em;
}

.engine-head p {
  margin: 3px 0 0;
  color: #a0a3b1;
  font-size: 9.5px;
}

.engine-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  font-weight: 700;
  color: #b45309;
}

.engine-live i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.engine-live.ok {
  color: #15803d;
}

.engine-rows {
  display: flex;
  flex-direction: column;
}

.engine-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px dashed #eef0f5;
  font-size: 10.5px;
}

.engine-row span {
  color: #9295a6;
}

.engine-row b {
  color: #3f4252;
  font-weight: 600;
  text-align: right;
  word-break: break-word;
}

.engine-row b.accent {
  color: var(--ft-primary);
}

.engine-demo {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #e9e9f4;
  background: #fafaff;
  text-align: left;
  cursor: pointer;
  transition: border 0.15s, transform 0.15s;
}

.engine-demo:hover {
  border-color: #cfcff0;
  transform: translateY(-1px);
}

.engine-demo-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 13px;
}

.engine-demo b {
  display: block;
  color: #3f4252;
  font-size: 10.5px;
}

.engine-demo small {
  display: block;
  margin-top: 2px;
  color: #a0a3b1;
  font-size: 8.5px;
}

.engine-demo-arrow {
  margin-left: auto;
  color: #b0b3c1;
  font-size: 12px;
}

.failing-card {
  padding: 18px;
}

.failing-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 13px;
}

.failing-head button {
  border: 0;
  background: none;
  color: var(--ft-primary);
  font-size: 9.5px;
  font-weight: 700;
  cursor: pointer;
}

.failing-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.failing-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 10px;
  margin-bottom: 5px;
}

.failing-line span {
  color: #4d5060;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.failing-line b {
  color: #dc2626;
  font-size: 9.5px;
  white-space: nowrap;
}

.failing-bar {
  height: 4px;
  border-radius: 99px;
  background: #f4f4f9;
  overflow: hidden;
}

.failing-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #fca5a5, #e5484d);
}

.failing-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.failing-empty > span {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #f0fdf4;
  color: #16a34a;
  font-size: 12px;
  font-weight: 800;
}

.failing-empty b {
  display: block;
  font-size: 11px;
}

.failing-empty p {
  margin: 2px 0 0;
  color: #9a9dae;
  font-size: 9.5px;
}

@media (max-width: 1180px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .dash-grid {
    grid-template-columns: 1fr;
  }

  .dash-right {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .quick-card {
    grid-row: span 2;
  }
}

@media (max-width: 760px) {
  .dash-right {
    display: flex;
  }

  .stat-grid {
    gap: 10px;
  }

  .stat-card {
    padding: 14px;
  }

  .stat-value {
    font-size: 25px;
  }
}
</style>
