<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  CopyDocument,
  Download,
  Link,
  RefreshRight,
  VideoPause,
  Warning
} from '@element-plus/icons-vue'
import StatusTag from '@/components/StatusTag.vue'
import StepTimeline from '@/components/StepTimeline.vue'
import EmptyState from '@/components/EmptyState.vue'
import { runApi } from '@/api'
import { artifactViewUrl, runStreamUrl } from '@/api/http'
import {
  actionLabel,
  formatBytes,
  formatDate,
  formatDuration,
  timeAgo,
  triggerLabel
} from '@/utils/format'
import type { Artifact, RunDetail, RunStep } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const notFound = ref(false)
const detail = ref<RunDetail | null>(null)
const logs = ref<string[]>([])
const stepFilter = ref<'ALL' | 'FAILED' | 'PASSED'>('ALL')
const filterOptions = [
  { key: 'ALL', label: '全部' },
  { key: 'FAILED', label: '失败' },
  { key: 'PASSED', label: '通过' }
] as const
const acting = ref(false)
const downloading = ref(false)
const copied = ref(false)
const consoleEl = ref<HTMLElement>()
const live = ref(false)
let eventSource: EventSource | null = null
let pollTimer: number | undefined

const runId = computed(() => Number(route.params.id))
const run = computed(() => detail.value?.run)
const rawSteps = computed(() => detail.value?.steps || [])
const steps = computed(() => {
  if (stepFilter.value === 'FAILED') {
    return rawSteps.value.filter((step) => ['FAILED', 'ERROR'].includes(step.status))
  }
  if (stepFilter.value === 'PASSED') {
    return rawSteps.value.filter((step) => step.status === 'PASSED')
  }
  return rawSteps.value
})
const failedStep = computed<RunStep | undefined>(() =>
  rawSteps.value.find((step) => ['FAILED', 'ERROR'].includes(step.status))
)
const percent = computed(() => {
  if (!run.value?.totalSteps) return run.value?.status === 'PASSED' ? 100 : 0
  return Math.round(
    ((run.value.passedSteps + run.value.failedSteps + run.value.skippedSteps) /
      run.value.totalSteps) *
      100
  )
})
const screenshotArtifacts = computed<Artifact[]>(() =>
  (detail.value?.artifacts || []).filter((artifact) => artifact.type === 'SCREENSHOT')
)
const fileArtifacts = computed<Artifact[]>(() =>
  (detail.value?.artifacts || []).filter((artifact) => artifact.type !== 'SCREENSHOT')
)
const previewUrls = computed(() =>
  screenshotArtifacts.value.map((artifact) => artifactViewUrl(runId.value, artifact.id))
)
const isFinal = computed(() =>
  ['PASSED', 'FAILED', 'ERROR', 'CANCELLED'].includes(run.value?.status || '')
)
const resultTone = computed(() => {
  switch (run.value?.status) {
    case 'PASSED':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'ERROR':
      return 'warning'
    case 'CANCELLED':
      return 'neutral'
    default:
      return 'live'
  }
})

function applyDetail(incoming: RunDetail, replaceLogs = false) {
  detail.value = incoming
  if (replaceLogs && incoming.consoleLog) {
    logs.value = incoming.consoleLog.split('\n').filter(Boolean)
  } else if (!logs.value.length && incoming.consoleLog) {
    logs.value = incoming.consoleLog.split('\n').filter(Boolean)
  }
  if (!['QUEUED', 'RUNNING'].includes(incoming.run.status)) {
    live.value = false
    closeStream()
    stopPolling()
    if (incoming.consoleLog) logs.value = incoming.consoleLog.split('\n').filter(Boolean)
  }
  nextTick(() => {
    if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
  })
}

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const { data } = await runApi.detail(runId.value)
    applyDetail(data, true)
    live.value = ['QUEUED', 'RUNNING'].includes(data.run.status)
    if (live.value) {
      connectStream()
      startPolling()
    }
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

function closeStream() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(async () => {
    if (!runId.value) return
    try {
      const { data } = await runApi.detail(runId.value)
      applyDetail(data, false)
    } catch {
      // 静默等待下一轮
    }
  }, 4500)
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = undefined
  }
}

function connectStream() {
  closeStream()
  const source = new EventSource(runStreamUrl(runId.value))
  eventSource = source

  source.addEventListener('snapshot', (event) => {
    const incoming = JSON.parse((event as MessageEvent).data) as RunDetail
    applyDetail(incoming, true)
    if (!['QUEUED', 'RUNNING'].includes(incoming.run.status)) closeStream()
  })

  source.addEventListener('status', (event) => {
    if (!detail.value) return
    const incoming = JSON.parse((event as MessageEvent).data)
    detail.value = { ...detail.value, run: incoming }
    live.value = ['QUEUED', 'RUNNING'].includes(incoming.status)
    if (!live.value) {
      closeStream()
      stopPolling()
    }
  })

  source.addEventListener('step', (event) => {
    if (!detail.value) return
    const incoming = JSON.parse((event as MessageEvent).data) as RunStep
    const index = detail.value.steps.findIndex(
      (step) => step.id === incoming.id || step.stepIndex === incoming.stepIndex
    )
    const next = [...detail.value.steps]
    if (index >= 0) next[index] = incoming
    else next.push(incoming)
    next.sort((a, b) => a.stepIndex - b.stepIndex)
    detail.value = { ...detail.value, steps: next }
  })

  source.addEventListener('log', (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { line?: string }
    if (data.line) {
      logs.value.push(data.line)
      if (logs.value.length > 600) logs.value = logs.value.slice(-600)
      nextTick(() => {
        if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
      })
    }
  })

  source.addEventListener('done', (event) => {
    const incoming = JSON.parse((event as MessageEvent).data) as RunDetail
    applyDetail(incoming, true)
    closeStream()
    stopPolling()
  })

  source.onerror = () => {
    // EventSource 会自动重连，轮询作为兜底已经启动。
  }
}

async function cancelRun() {
  if (!run.value) return
  try {
    await ElMessageBox.confirm(
      `确定取消执行 #${run.value.id} 吗？当前步骤结束后会停止。`,
      '取消执行',
      { type: 'warning', confirmButtonText: '取消执行', cancelButtonText: '继续等待' }
    )
  } catch {
    return
  }
  acting.value = true
  try {
    await runApi.cancel(run.value.id)
    ElMessage.success('已发送取消请求')
    await load(true)
  } finally {
    acting.value = false
  }
}

async function rerun() {
  if (!run.value) return
  acting.value = true
  try {
    const { data } = await runApi.rerun(run.value.id)
    ElMessage.success('已创建新的执行')
    router.push(`/runs/${data.id}`)
  } finally {
    acting.value = false
  }
}

async function downloadZip() {
  if (!run.value) return
  downloading.value = true
  try {
    await runApi.downloadZip(run.value.id)
    ElMessage.success('报告 ZIP 已开始下载')
  } finally {
    downloading.value = false
  }
}

async function downloadArtifact(artifact: Artifact) {
  await runApi.downloadArtifact(runId.value, artifact.id, artifact.fileName)
}

async function copyConsole() {
  const text = logs.value.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    ElMessage.success('控制台日志已复制')
    window.setTimeout(() => (copied.value = false), 2000)
  } catch {
    ElMessage.warning('浏览器不允许自动复制，请手动选择文本')
  }
}

function artifactLabel(artifact: Artifact) {
  const labels: Record<string, string> = {
    SCREENSHOT: '截图',
    LOG: '日志',
    REPORT: '报告',
    FILE: '文件'
  }
  return labels[artifact.type] || artifact.type
}

function goCaseLibrary() {
  router.push(run.value?.projectId ? `/cases?projectId=${run.value.projectId}` : '/cases')
}

function back() {
  router.push('/runs')
}

function setStepFilter(key: (typeof filterOptions)[number]['key']) {
  stepFilter.value = key
}

onMounted(() => load())

watch(
  () => route.params.id,
  (value, oldValue) => {
    if (value && value !== oldValue) {
      closeStream()
      stopPolling()
      detail.value = null
      logs.value = []
      stepFilter.value = 'ALL'
      notFound.value = false
      load()
    }
  }
)

onBeforeUnmount(() => {
  closeStream()
  stopPolling()
})
</script>

<template>
  <div v-if="notFound" class="page">
    <EmptyState
      title="执行记录不存在"
      description="它可能已被删除，或链接不正确。返回执行记录查看其它运行。"
      icon="!"
    >
      <el-button type="primary" @click="back">返回执行记录</el-button>
    </EmptyState>
  </div>

  <div v-else class="page detail-page" v-loading="loading">
    <template v-if="detail && run">
      <section class="report-hero" :class="`tone-${resultTone}`">
        <div class="hero-main">
          <button class="back-link" type="button" @click="back">
            <el-icon><ArrowLeft /></el-icon>
            执行记录
          </button>
          <div class="hero-eyebrow">
            RUN #{{ run.id }}
            <span v-if="run.batchId">· BATCH {{ run.batchId.slice(0, 8) }}</span>
            <span class="live-tag" v-if="live"><i /> LIVE</span>
          </div>
          <h1>{{ run.caseName }}</h1>
          <p class="hero-meta">
            {{ run.projectName }}
            <span>·</span>
            {{ run.environmentName || '默认环境' }}
            <span>·</span>
            {{ triggerLabel(run.triggerType) }}触发
            <span>·</span>
            {{ formatDate(run.createdAt) }}
          </p>
          <div class="hero-tags">
            <StatusTag :status="run.status" :pulse="live" />
            <span>尝试 {{ run.attempt }} / {{ run.maxAttempts }}</span>
            <span>{{ run.headless ? '无头模式' : '可见窗口' }}</span>
            <span>{{ run.totalSteps }} 个步骤</span>
          </div>
        </div>

        <div class="hero-progress">
          <div
            class="report-ring"
            :style="{ background: `conic-gradient(var(--ring-color) ${percent}%, rgba(255,255,255,.08) 0)` }"
          >
            <div class="report-ring-inner">
              <b>{{ percent }}<small>%</small></b>
              <span>完成度</span>
            </div>
          </div>
          <div class="hero-numbers">
            <div><b class="ok">{{ run.passedSteps }}</b><span>通过</span></div>
            <div><b class="bad">{{ run.failedSteps }}</b><span>失败</span></div>
            <div><b>{{ run.skippedSteps }}</b><span>跳过</span></div>
          </div>
        </div>

        <div class="hero-actions">
          <el-button size="small" @click="downloadZip" :loading="downloading">
            <el-icon><Download /></el-icon>
            下载 ZIP
          </el-button>
          <el-button
            v-if="!isFinal"
            size="small"
            type="danger"
            plain
            :loading="acting"
            @click="cancelRun"
          >
            <el-icon><VideoPause /></el-icon>
            取消
          </el-button>
          <el-button v-else size="small" :loading="acting" @click="rerun">
            <el-icon><RefreshRight /></el-icon>
            重跑
          </el-button>
        </div>
      </section>

      <div class="report-grid">
        <div class="report-main">
          <el-alert
            v-if="run.status === 'FAILED' || run.status === 'ERROR'"
            class="failure-alert"
            type="error"
            :closable="false"
            show-icon
          >
            <template #title>
              <b>{{ run.status === 'FAILED' ? '执行失败：存在断言未通过' : '执行异常：引擎或环境出现问题' }}</b>
            </template>
            <p>{{ run.errorMessage || failedStep?.message || '查看失败步骤的期望值与实际值以定位问题。' }}</p>
          </el-alert>

          <section class="ft-card steps-card">
            <div class="section-head">
              <div>
                <h3>步骤明细</h3>
                <p>每一步的操作、断言、耗时与截图都保存在执行快照中。</p>
              </div>
              <div class="step-filters">
                <button
                  v-for="item in filterOptions"
                  :key="item.key"
                  type="button"
                  :class="{ active: stepFilter === item.key }"
                  @click="setStepFilter(item.key)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
            <div class="steps-body">
              <div v-if="!rawSteps.length" class="waiting-steps">
                <span class="waiting-dot" />
                <b>{{ live ? '正在创建执行步骤…' : '没有步骤快照' }}</b>
                <p>{{ live ? '步骤会在 Chrome 开始执行后实时出现。' : '该执行可能在创建步骤前就被取消。' }}</p>
              </div>
              <StepTimeline v-else :run-id="run.id" :steps="steps" />
              <div v-if="rawSteps.length && !steps.length" class="filtered-empty">
                当前筛选下没有步骤。
                <button type="button" @click="stepFilter = 'ALL'">查看全部</button>
              </div>
            </div>
          </section>

          <section class="ft-card artifacts-card">
            <div class="section-head">
              <div>
                <h3>执行产物</h3>
                <p>{{ screenshotArtifacts.length }} 张截图 · {{ fileArtifacts.length }} 个报告/日志文件</p>
              </div>
              <el-button size="small" @click="downloadZip" :loading="downloading">
                <el-icon><Download /></el-icon>
                打包下载
              </el-button>
            </div>

            <div v-if="screenshotArtifacts.length" class="shot-grid">
              <div v-for="(artifact, index) in screenshotArtifacts" :key="artifact.id" class="shot-card">
                <el-image
                  :src="previewUrls[index]"
                  :preview-src-list="previewUrls"
                  :initial-index="index"
                  fit="cover"
                  preview-teleported
                  hide-on-click-modal
                />
                <div class="shot-meta">
                  <span>步骤 {{ artifact.stepIndex ?? '—' }}</span>
                  <button type="button" @click="downloadArtifact(artifact)">
                    <el-icon><Download /></el-icon>
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="artifacts-empty">本次执行尚未生成截图。</div>

            <div v-if="fileArtifacts.length" class="file-list">
              <div v-for="artifact in fileArtifacts" :key="artifact.id" class="file-row">
                <span class="file-icon">{{ artifactLabel(artifact) }}</span>
                <div class="file-copy">
                  <b>{{ artifact.fileName }}</b>
                  <span>{{ artifactLabel(artifact) }} · {{ formatBytes(artifact.size) }}</span>
                </div>
                <el-button link size="small" @click="downloadArtifact(artifact)">
                  <el-icon><Download /></el-icon>下载
                </el-button>
              </div>
            </div>
          </section>

          <section class="ft-card console-card">
            <div class="section-head">
              <div>
                <h3>控制台日志</h3>
                <p>引擎输出、步骤状态与技术错误会实时追加到这里。</p>
              </div>
              <el-button size="small" text @click="copyConsole">
                <el-icon><CopyDocument /></el-icon>
                {{ copied ? '已复制' : '复制日志' }}
              </el-button>
            </div>
            <div ref="consoleEl" class="console">
              <span v-for="(line, index) in logs" :key="index" class="console-line">{{ line }}</span>
              <span v-if="!logs.length" class="console-line console-empty">等待引擎日志…</span>
            </div>
          </section>
        </div>

        <aside class="report-side">
          <section class="ft-card side-card">
            <div class="side-head">
              <h3>执行信息</h3>
              <span class="side-badge">RUN</span>
            </div>
            <div class="meta-list">
              <div><span>执行编号</span><b class="mono">#{{ run.id }}</b></div>
              <div><span>项目</span><b>{{ run.projectName }}</b></div>
              <div><span>环境</span><b>{{ run.environmentName || '默认环境' }}</b></div>
              <div><span>触发方式</span><b>{{ triggerLabel(run.triggerType) }}</b></div>
              <div><span>发起人</span><b>{{ run.requestedBy || '—' }}</b></div>
              <div><span>开始时间</span><b>{{ formatDate(run.startedAt) }}</b></div>
              <div><span>结束时间</span><b>{{ formatDate(run.finishedAt) }}</b></div>
              <div><span>总耗时</span><b>{{ formatDuration(run.durationMs) }}</b></div>
              <div><span>批次</span><b class="mono">{{ run.batchId ? run.batchId.slice(0, 12) : '—' }}</b></div>
              <div><span>用例 ID</span><b class="mono">{{ run.caseId ? `#${run.caseId}` : '临时执行' }}</b></div>
            </div>
          </section>

          <section class="ft-card side-card">
            <div class="side-head">
              <h3>结果摘要</h3>
              <StatusTag :status="run.status" :pulse="live" />
            </div>
            <div class="result-bars">
              <div class="result-bar-row">
                <span>通过</span>
                <div><i class="ok" :style="{ width: `${run.totalSteps ? (run.passedSteps / run.totalSteps) * 100 : 0}%` }" /></div>
                <b>{{ run.passedSteps }}</b>
              </div>
              <div class="result-bar-row">
                <span>失败</span>
                <div><i class="bad" :style="{ width: `${run.totalSteps ? (run.failedSteps / run.totalSteps) * 100 : 0}%` }" /></div>
                <b>{{ run.failedSteps }}</b>
              </div>
              <div class="result-bar-row">
                <span>跳过</span>
                <div><i :style="{ width: `${run.totalSteps ? (run.skippedSteps / run.totalSteps) * 100 : 0}%` }" /></div>
                <b>{{ run.skippedSteps }}</b>
              </div>
            </div>
            <div class="side-note">
              <span>更新时间</span>
              <b>{{ timeAgo(run.finishedAt || run.startedAt || run.createdAt) }}</b>
            </div>
          </section>

          <section v-if="failedStep" class="ft-card side-card failure-card">
            <div class="side-head">
              <h3>失败定位</h3>
              <el-icon class="warn-icon"><Warning /></el-icon>
            </div>
            <div class="failed-step-title">
              <span>STEP {{ failedStep.stepIndex }}</span>
              <b>{{ actionLabel(failedStep.action) }}</b>
            </div>
            <p class="failed-message">{{ failedStep.message || '断言未通过' }}</p>
            <div class="failed-compare">
              <div><label>期望</label><span>{{ failedStep.expectedValue || '—' }}</span></div>
              <div><label>实际</label><span>{{ failedStep.actualValue || '—' }}</span></div>
            </div>
            <code v-if="failedStep.selector" class="failed-selector">{{ failedStep.selector }}</code>
          </section>

          <section class="ft-card side-card action-card">
            <div class="side-head">
              <h3>快捷操作</h3>
              <el-icon><Link /></el-icon>
            </div>
            <button type="button" class="side-action" @click="downloadZip">
              <el-icon><Download /></el-icon>
              <span><b>下载完整报告</b><small>截图 + 控制台 + report.json</small></span>
            </button>
            <button type="button" class="side-action" @click="goCaseLibrary">
              <el-icon><Link /></el-icon>
              <span><b>查看项目用例</b><small>回到用例资产继续编辑</small></span>
            </button>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-page {
  padding-bottom: 20px;
}

.report-hero {
  --ring-color: #c7f464;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 26px 28px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 84% 16%, rgba(139, 92, 246, 0.25), transparent 34%),
    linear-gradient(135deg, #12131f, #1d1e37);
  color: #fff;
  box-shadow: 0 22px 52px rgba(16, 17, 28, 0.2);
}

.report-hero.tone-success {
  --ring-color: #86efac;
  background:
    radial-gradient(circle at 84% 16%, rgba(34, 197, 94, 0.2), transparent 36%),
    linear-gradient(135deg, #10171a, #16242b);
}

.report-hero.tone-danger {
  --ring-color: #fca5a5;
  background:
    radial-gradient(circle at 84% 16%, rgba(239, 68, 68, 0.22), transparent 36%),
    linear-gradient(135deg, #1a1115, #2a1a21);
}

.report-hero.tone-warning {
  --ring-color: #fcd34d;
  background:
    radial-gradient(circle at 84% 16%, rgba(245, 158, 11, 0.2), transparent 36%),
    linear-gradient(135deg, #1a1611, #2a2318);
}

.hero-main {
  flex: 1;
  min-width: 0;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: #85889f;
  font-size: 9.5px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 13px;
}

.back-link:hover {
  color: #fff;
}

.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 8px;
  letter-spacing: 0.14em;
  font-weight: 800;
  color: #6d7089;
}

.live-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ft-accent);
  margin-left: 3px;
}

.live-tag i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: ft-pulse 1.4s infinite;
}

.hero-main h1 {
  margin: 8px 0 8px;
  font-size: clamp(21px, 2.5vw, 30px);
  line-height: 1.2;
  letter-spacing: -0.04em;
  font-weight: 800;
}

.hero-meta {
  margin: 0;
  font-size: 10px;
  color: #8e91a7;
}

.hero-meta span {
  margin: 0 4px;
  color: #4f5268;
}

.hero-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 13px;
  color: #85889f;
  font-size: 8.5px;
}

.hero-tags > span {
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.hero-progress {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 0 0 auto;
}

.report-ring {
  width: 98px;
  height: 98px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.report-ring-inner {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(14, 15, 24, 0.92);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.report-ring-inner b {
  font-size: 23px;
  letter-spacing: -0.04em;
}

.report-ring-inner b small {
  font-size: 8px;
  color: #9a9dae;
  margin-left: 1px;
}

.report-ring-inner span {
  font-size: 7.5px;
  color: #6d7089;
  margin-top: 1px;
}

.hero-numbers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 15px;
}

.hero-numbers div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.hero-numbers b {
  font-size: 19px;
  letter-spacing: -0.03em;
}

.hero-numbers b.ok {
  color: #86efac;
}

.hero-numbers b.bad {
  color: #fca5a5;
}

.hero-numbers span {
  font-size: 8px;
  color: #73768c;
}

.hero-actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.hero-actions :deep(.el-button) {
  width: 106px;
  margin-left: 0;
  border-color: rgba(255, 255, 255, 0.13);
  background: rgba(255, 255, 255, 0.06);
  color: #d8d9e7;
}

.hero-actions :deep(.el-button:hover) {
  background: rgba(255, 255, 255, 0.11);
  color: #fff;
}

.hero-actions :deep(.el-button--danger) {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
}

.report-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(270px, 0.55fr);
  gap: 18px;
  margin-top: 18px;
  align-items: start;
}

.report-main,
.report-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.failure-alert {
  margin-bottom: 0;
}

.failure-alert :deep(.el-alert__title) {
  font-size: 11px;
}

.failure-alert p {
  margin: 3px 0 0;
  font-size: 10px;
  line-height: 1.6;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 15px;
  padding: 17px 20px;
  border-bottom: 1px solid var(--ft-line);
}

.section-head h3 {
  margin: 0;
  font-size: 13px;
  letter-spacing: -0.01em;
}

.section-head p {
  margin: 4px 0 0;
  color: var(--ft-muted);
  font-size: 9.5px;
  line-height: 1.5;
}

.step-filters {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: #f5f5fa;
}

.step-filters button {
  border: 0;
  background: transparent;
  color: #8b8e9f;
  font-size: 9px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.step-filters button.active {
  background: #fff;
  color: var(--ft-primary);
  box-shadow: 0 2px 6px rgba(16, 17, 28, 0.06);
}

.steps-body {
  padding: 16px 20px 20px;
}

.waiting-steps {
  padding: 34px 20px;
  text-align: center;
}

.waiting-dot {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ft-primary);
  margin: 0 auto 11px;
  animation: ft-pulse 1.4s infinite;
  color: var(--ft-primary);
}

.waiting-steps b {
  display: block;
  font-size: 12px;
}

.waiting-steps p {
  margin: 4px 0 0;
  color: #a0a3b1;
  font-size: 9.5px;
}

.filtered-empty {
  padding: 20px;
  text-align: center;
  color: #a0a3b1;
  font-size: 10px;
}

.filtered-empty button {
  border: 0;
  background: none;
  color: var(--ft-primary);
  font-weight: 700;
  cursor: pointer;
  font-size: 10px;
}

.artifacts-card .section-head {
  border-bottom: 0;
}

.shot-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
  padding: 0 20px 16px;
}

.shot-card {
  border: 1px solid var(--ft-line);
  border-radius: 9px;
  overflow: hidden;
  background: #fafafd;
}

.shot-card :deep(.el-image) {
  display: block;
  width: 100%;
  height: 98px;
  background: #f1f2f6;
}

.shot-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  padding: 5px 7px;
  font-size: 8px;
  color: #8b8e9f;
}

.shot-meta button {
  border: 0;
  background: none;
  color: #a0a3b1;
  cursor: pointer;
  display: flex;
  padding: 0;
}

.shot-meta button:hover {
  color: var(--ft-primary);
}

.artifacts-empty {
  margin: 0 20px 16px;
  padding: 22px;
  text-align: center;
  border: 1px dashed var(--ft-line-strong);
  border-radius: 9px;
  color: #a0a3b1;
  font-size: 9.5px;
}

.file-list {
  border-top: 1px solid var(--ft-line);
  padding: 8px 20px 13px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 0;
  border-bottom: 1px dashed #eef0f5;
}

.file-row:last-child {
  border-bottom: 0;
}

.file-icon {
  flex: 0 0 38px;
  padding: 4px 0;
  text-align: center;
  border-radius: 5px;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 8px;
  font-weight: 800;
}

.file-copy {
  flex: 1;
  min-width: 0;
}

.file-copy b {
  display: block;
  font-size: 10px;
  color: #3f4252;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-copy span {
  display: block;
  margin-top: 2px;
  font-size: 8.5px;
  color: #a0a3b1;
}

.console-card .section-head {
  border-bottom: 0;
}

.console-card .console {
  margin: 0 20px 20px;
  max-height: 420px;
}

.side-card {
  padding: 16px;
}

.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ft-line);
}

.side-head h3 {
  margin: 0;
  font-size: 11.5px;
}

.side-head > .el-icon {
  color: #b0b3c1;
  font-size: 13px;
}

.side-badge {
  font-size: 7px;
  letter-spacing: 0.12em;
  font-weight: 800;
  color: #a0a3b1;
  background: #f5f5fa;
  border-radius: 4px;
  padding: 3px 5px;
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-top: 5px;
}

.meta-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed #f0f1f6;
  font-size: 9px;
}

.meta-list div:last-child {
  border-bottom: 0;
}

.meta-list span {
  color: #a0a3b1;
}

.meta-list b {
  color: #4b4f60;
  font-weight: 600;
  text-align: right;
  word-break: break-word;
}

.result-bars {
  padding-top: 10px;
}

.result-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
  font-size: 8.5px;
}

.result-bar-row > span {
  flex: 0 0 25px;
  color: #8b8e9f;
}

.result-bar-row > div {
  flex: 1;
  height: 4px;
  border-radius: 99px;
  background: #f2f3f7;
  overflow: hidden;
}

.result-bar-row i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #cbd5e1;
}

.result-bar-row i.ok {
  background: #22c55e;
}

.result-bar-row i.bad {
  background: #ef4444;
}

.result-bar-row b {
  flex: 0 0 18px;
  text-align: right;
  font-size: 9px;
  color: #4b4f60;
}

.side-note {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px dashed #eef0f5;
  font-size: 8.5px;
  color: #a0a3b1;
}

.side-note b {
  color: #7b7f91;
}

.warn-icon {
  color: #dc2626 !important;
}

.failed-step-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.failed-step-title span {
  font-size: 7.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #dc2626;
  background: #fef2f2;
  border-radius: 4px;
  padding: 2px 5px;
}

.failed-step-title b {
  font-size: 10.5px;
  color: #3f4252;
}

.failed-message {
  margin: 7px 0 0;
  font-size: 9.5px;
  color: #b91c1c;
  line-height: 1.6;
  background: #fef2f2;
  border-radius: 7px;
  padding: 7px 8px;
  word-break: break-word;
}

.failed-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 7px;
}

.failed-compare div {
  background: #fafafd;
  border: 1px solid #f0f1f6;
  border-radius: 6px;
  padding: 6px;
  min-width: 0;
}

.failed-compare label {
  display: block;
  font-size: 7.5px;
  font-weight: 800;
  color: #a0a3b1;
  margin-bottom: 2px;
}

.failed-compare span {
  font-size: 8.5px;
  color: #4b4f60;
  word-break: break-word;
  line-height: 1.5;
}

.failed-selector {
  display: block;
  margin-top: 7px;
  padding: 4px 6px;
  border-radius: 5px;
  background: #f7f7fb;
  border: 1px solid #ebecf3;
  font-size: 8px;
  color: #6f7385;
  word-break: break-all;
}

.action-card .side-head {
  margin-bottom: 5px;
}

.side-action {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 2px;
  border: 0;
  border-bottom: 1px dashed #eef0f5;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: #7b7f91;
}

.side-action:last-child {
  border-bottom: 0;
}

.side-action > .el-icon {
  flex: 0 0 25px;
  width: 25px;
  height: 25px;
  border-radius: 7px;
  background: #f3f3fb;
  color: var(--ft-primary);
  display: grid;
  place-items: center;
  font-size: 11px;
}

.side-action b {
  display: block;
  font-size: 9.5px;
  color: #3f4252;
}

.side-action small {
  display: block;
  margin-top: 1px;
  font-size: 8px;
  color: #a0a3b1;
}

.side-action:hover b {
  color: var(--ft-primary);
}

@media (max-width: 1150px) {
  .report-grid {
    grid-template-columns: 1fr;
  }

  .report-side {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .report-side .side-card:first-child {
    grid-row: span 2;
  }
}

@media (max-width: 960px) {
  .report-hero {
    flex-wrap: wrap;
  }

  .hero-progress {
    order: 3;
  }

  .hero-actions {
    flex-direction: row;
    margin-left: auto;
  }

  .hero-actions :deep(.el-button) {
    width: auto;
  }
}

@media (max-width: 700px) {
  .report-hero {
    padding: 22px 18px;
  }

  .hero-actions {
    width: 100%;
    margin-left: 0;
  }

  .hero-progress {
    width: 100%;
    justify-content: flex-start;
  }

  .shot-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .report-side {
    display: flex;
  }

  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
