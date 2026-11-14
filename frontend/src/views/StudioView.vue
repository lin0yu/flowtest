<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  CircleCheck,
  Connection,
  MagicStick,
  Monitor,
  VideoPlay,
  VideoPause,
  Warning
} from '@element-plus/icons-vue'
import StepTimeline from '@/components/StepTimeline.vue'
import StatusTag from '@/components/StatusTag.vue'
import { caseApi, environmentApi, projectApi, quickApi, runApi } from '@/api'
import { artifactViewUrl, runStreamUrl } from '@/api/http'
import { actionLabel, formatDuration, timeAgo, triggerLabel } from '@/utils/format'
import type {
  CompileResult,
  Environment,
  Project,
  RunDetail,
  RunStep,
  StepDef
} from '@/types'

const route = useRoute()
const router = useRouter()

const projects = ref<Project[]>([])
const environments = ref<Environment[]>([])
const projectId = ref<number>()
const environmentId = ref<number>()
const nl = ref('')
const useLlm = ref(false)
const headless = ref(true)
const screenshotEachStep = ref(true)
const compileResult = ref<CompileResult | null>(null)
const compiling = ref(false)
const running = ref(false)
const savingCase = ref(false)
const savedCaseId = ref<number>()
const runDetail = ref<RunDetail | null>(null)
const activeRunId = ref<number>()
const logs = ref<string[]>([])
const cancelled = ref(false)
const logEl = ref<HTMLElement>()
let eventSource: EventSource | null = null

const examples = [
  {
    title: '登录 + 搜索 + 加购',
    text: '打开 /demo/index.html\n在 #username 输入 ${demoUser}\n在 #password 输入 ${demoPassword}\n点击 #login-btn\n断言文本包含 欢迎回来\n截图 登录成功'
  },
  {
    title: '搜索商品并断言',
    text: '打开 /demo/index.html\n点击 #nav-login\n在 #username 输入 admin\n在 #password 输入 admin123\n点击 #login-btn\n在 #search 输入 机械键盘\n点击 #search-btn\n断言元素 [data-testid=\'product-101\'] 可见\n断言文本包含 机械键盘'
  },
  {
    title: '加购数量校验',
    text: '打开 /demo/index.html\n在 #username 输入 admin\n在 #password 输入 admin123\n点击 #login-btn\n点击 [data-testid=\'add-101\']\n断言文本包含 购物车 1\n截图 加购成功'
  }
]

const steps = computed<StepDef[]>(() => compileResult.value?.steps || [])
const warnings = computed(() => compileResult.value?.warnings || [])
const isLive = computed(
  () => !!runDetail.value && ['QUEUED', 'RUNNING'].includes(runDetail.value.run.status)
)
const percent = computed(() => {
  const detail = runDetail.value
  if (!detail || !detail.steps.length) return 0
  const finished = detail.steps.filter((step) =>
    ['PASSED', 'FAILED', 'SKIPPED', 'ERROR'].includes(step.status)
  ).length
  return Math.round((finished / detail.steps.length) * 100)
})
const latestShot = computed(() => {
  const detail = runDetail.value
  if (!detail) return ''
  const stepsWithShot = [...detail.steps]
    .reverse()
    .find((step) => step.screenshotArtifactId)
  if (!stepsWithShot?.screenshotArtifactId) return ''
  return artifactViewUrl(detail.run.id, stepsWithShot.screenshotArtifactId)
})
const latestStep = computed<RunStep | undefined>(() => {
  const list = runDetail.value?.steps || []
  return [...list].reverse().find((step) => step.status !== 'PENDING')
})
const doneStats = computed(() => {
  const run = runDetail.value?.run
  return {
    passed: run?.passedSteps ?? 0,
    failed: run?.failedSteps ?? 0,
    skipped: run?.skippedSteps ?? 0
  }
})
const firstLine = computed(() => {
  const line = nl.value.split('\n').map((item) => item.trim()).find(Boolean)
  return line ? line.slice(0, 60) : '自然语言快速执行'
})

async function loadProjects() {
  const { data } = await projectApi.list()
  projects.value = data
  const queryProject = route.query.projectId ? Number(route.query.projectId) : undefined
  projectId.value = queryProject || data[0]?.id
  await loadEnvironments()
}

async function loadEnvironments() {
  environmentId.value = undefined
  environments.value = []
  if (!projectId.value) return
  const { data } = await environmentApi.list(projectId.value)
  environments.value = data
  environmentId.value = (data.find((env) => env.defaultEnv) || data[0])?.id
}

async function onProjectChange() {
  await loadEnvironments()
  compileResult.value = null
}

function pickExample(example: (typeof examples)[number]) {
  nl.value = example.text
  compileResult.value = null
}

async function compile() {
  if (!nl.value.trim()) {
    ElMessage.warning('先描述你要验证的流程')
    return false
  }
  compiling.value = true
  try {
    const { data } = await caseApi.compile({
      nl: nl.value,
      title: firstLine.value,
      useLlm: useLlm.value
    })
    compileResult.value = data
    savedCaseId.value = undefined
    return true
  } catch {
    return false
  } finally {
    compiling.value = false
  }
}

function closeStream() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

function applySnapshot(detail: RunDetail) {
  runDetail.value = detail
  if (detail.consoleLog) {
    logs.value = detail.consoleLog.split('\n').filter(Boolean)
  }
}

function connectStream(runId: number) {
  closeStream()
  const source = new EventSource(runStreamUrl(runId))
  eventSource = source

  source.addEventListener('snapshot', (event) => {
    applySnapshot(JSON.parse((event as MessageEvent).data))
  })

  source.addEventListener('status', (event) => {
    if (!runDetail.value) return
    runDetail.value = {
      ...runDetail.value,
      run: JSON.parse((event as MessageEvent).data)
    }
  })

  source.addEventListener('step', (event) => {
    if (!runDetail.value) return
    const incoming = JSON.parse((event as MessageEvent).data) as RunStep
    const index = runDetail.value.steps.findIndex(
      (step) => step.id === incoming.id || step.stepIndex === incoming.stepIndex
    )
    const next = [...runDetail.value.steps]
    if (index >= 0) next[index] = incoming
    else next.push(incoming)
    next.sort((a, b) => a.stepIndex - b.stepIndex)
    runDetail.value = { ...runDetail.value, steps: next }
    scrollLog()
  })

  source.addEventListener('log', (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { line?: string; time?: string }
    if (data.line) {
      logs.value.push(data.line)
      if (logs.value.length > 400) logs.value = logs.value.slice(-400)
      scrollLog()
    }
  })

  source.addEventListener('done', (event) => {
    const detail = JSON.parse((event as MessageEvent).data) as RunDetail
    applySnapshot(detail)
    closeStream()
    if (detail.run.status === 'PASSED') {
      ElMessage.success('执行通过，报告已生成')
    } else if (detail.run.status === 'FAILED') {
      ElMessage.warning('执行完成，但存在断言失败')
    } else {
      ElMessage.error(`执行结束：${detail.run.status}`)
    }
  })

  source.onerror = () => {
    if (eventSource === source && runDetail.value && isLive.value) {
      // EventSource 会自动重连；这里保持静默，避免误报。
    }
  }
}

function scrollLog() {
  nextTick(() => {
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  })
}

async function runFlow() {
  if (!projectId.value) {
    ElMessage.warning('请选择项目')
    return
  }
  if (!nl.value.trim() && !steps.value.length) {
    ElMessage.warning('请输入自然语言描述')
    return
  }
  if (!steps.value.length) {
    const ok = await compile()
    if (!ok || !steps.value.length) return
  }
  running.value = true
  cancelled.value = false
  savedCaseId.value = undefined
  runDetail.value = null
  logs.value = []
  try {
    const { data } = await quickApi.run({
      projectId: projectId.value,
      environmentId: environmentId.value,
      nl: nl.value.trim(),
      title: compileResult.value?.title || firstLine.value,
      steps: steps.value,
      headless: headless.value,
      screenshotEachStep: screenshotEachStep.value
    })
    activeRunId.value = data.id
    ElMessage.success('已提交执行，Chrome 正在启动')
    connectStream(data.id)
    nextTick(() => {
      document.getElementById('studio-live')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  } finally {
    running.value = false
  }
}

async function cancelRun() {
  if (!activeRunId.value) return
  cancelled.value = true
  await runApi.cancel(activeRunId.value)
  ElMessage.success('已发送取消请求')
}

async function saveAsCase() {
  if (!projectId.value) {
    ElMessage.warning('请选择项目')
    return
  }
  if (!steps.value.length) {
    const ok = await compile()
    if (!ok) return
  }
  savingCase.value = true
  try {
    const { data } = await caseApi.create({
      projectId: projectId.value,
      name: compileResult.value?.title || firstLine.value,
      description: compileResult.value?.summary || '由 AI 用例工坊生成',
      nlInput: nl.value,
      steps: steps.value,
      tags: ['ai-generated'],
      priority: 'MEDIUM',
      status: 'READY',
      headless: headless.value,
      screenshotEachStep: screenshotEachStep.value
    })
    savedCaseId.value = data.id
    ElMessage.success('已保存为测试用例')
  } finally {
    savingCase.value = false
  }
}

function viewReport() {
  if (activeRunId.value) router.push(`/runs/${activeRunId.value}`)
}

function goCases() {
  router.push(savedCaseId.value ? `/cases?projectId=${projectId.value}` : '/cases')
}

onMounted(async () => {
  await loadProjects()
  const queryNl = route.query.nl
  if (typeof queryNl === 'string' && queryNl.trim()) {
    nl.value = queryNl
    await compile()
  }
})

onBeforeUnmount(closeStream)
</script>

<template>
  <div class="page studio-page">
    <section class="studio-hero">
      <div class="hero-grid" />
      <div class="hero-glow" />
      <div class="hero-copy">
        <div class="studio-kicker">
          <span class="kicker-spark">✦</span>
          AI AUTOMATION STUDIO
        </div>
        <h1>把业务意图，<br /><em>编译成可执行测试。</em></h1>
        <p>
          用中文描述一条业务流程，FlowTest 会拆解成动作、选择器与断言，
          在本机 Chrome 中真实执行，并把每一步的结果带回这里。
        </p>
        <div class="hero-facts">
          <span><i /> 本地规则引擎</span>
          <span><i /> Selenium 4 + Chrome</span>
          <span><i /> SSE 实时回传</span>
        </div>
      </div>
      <div class="hero-console">
        <div class="hero-console-bar">
          <span class="traffic red" /><span class="traffic yellow" /><span class="traffic green" />
          <span class="console-name">flowtest://compile</span>
          <span class="console-mode">READY</span>
        </div>
        <pre><span class="c-muted"># 输入</span>
登录后搜索机械键盘并加入购物车

<span class="c-muted"># 编译结果</span>
<span class="c-purple">goto</span>    /demo/index.html
<span class="c-purple">fill</span>    #username    <span class="c-green">${demoUser}</span>
<span class="c-purple">click</span>   #login-btn
<span class="c-purple">assert</span>  文本包含 <span class="c-green">"欢迎回来"</span>
<span class="c-purple">shot</span>    step-06.png

<span class="c-accent">→ ready to execute</span></pre>
      </div>
    </section>

    <div class="studio-grid">
      <section class="ft-card composer">
        <div class="composer-head">
          <div>
            <div class="section-no">01 / INTENT</div>
            <h2>描述你要验证的流程</h2>
            <p>一行一个动作。没有编程经验也可以直接写业务语言。</p>
          </div>
          <el-tooltip content="选择项目与环境后，变量会在执行时替换">
            <span class="composer-help">?</span>
          </el-tooltip>
        </div>

        <div class="config-row">
          <label>
            <span>项目</span>
            <el-select v-model="projectId" placeholder="选择项目" @change="onProjectChange">
              <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
            </el-select>
          </label>
          <label>
            <span>执行环境</span>
            <el-select v-model="environmentId" placeholder="选择环境">
              <el-option v-for="env in environments" :key="env.id" :label="env.name" :value="env.id" />
            </el-select>
          </label>
          <label class="config-switch">
            <span>无头模式</span>
            <el-switch v-model="headless" size="small" />
          </label>
          <label class="config-switch">
            <span>每步截图</span>
            <el-switch v-model="screenshotEachStep" size="small" />
          </label>
        </div>

        <div class="prompt-box" :class="{ filled: nl.length > 0 }">
          <div class="prompt-label">
            <span class="prompt-icon">✦</span>
            自然语言
            <span class="prompt-count">{{ nl.length }} 字</span>
          </div>
          <el-input
            v-model="nl"
            type="textarea"
            :rows="9"
            resize="none"
            placeholder="例如：&#10;打开 /demo/index.html&#10;在 #username 输入 ${demoUser}&#10;点击 #login-btn&#10;断言文本包含 欢迎回来&#10;截图 登录成功"
          />
          <div class="prompt-toolbar">
            <div class="prompt-examples">
              <span>试试：</span>
              <button v-for="example in examples" :key="example.title" type="button" @click="pickExample(example)">
                {{ example.title }}
              </button>
            </div>
            <el-checkbox v-model="useLlm" size="small">增强编译</el-checkbox>
            <el-button size="small" :loading="compiling" @click="compile">
              <el-icon><MagicStick /></el-icon>
              编译预览
            </el-button>
          </div>
        </div>

        <div v-if="warnings.length" class="compile-alerts">
          <el-alert
            v-for="warning in warnings"
            :key="warning"
            :title="warning"
            type="warning"
            :closable="false"
            show-icon
          />
        </div>

        <div class="composer-foot">
          <div class="engine-note">
            <span class="engine-dot" />
            <span>
              <b>{{ compileResult?.engine || '本地规则引擎' }}</b>
              <small>{{ compileResult ? `已生成 ${steps.length} 个步骤` : '无需联网，随时可用' }}</small>
            </span>
          </div>
          <el-button type="primary" size="large" class="run-button" :loading="running" @click="runFlow">
            <el-icon><VideoPlay /></el-icon>
            生成并执行
          </el-button>
        </div>
      </section>

      <section class="monitor" :class="{ live: isLive }">
        <div class="monitor-top">
          <div class="monitor-label">
            <span class="monitor-dot" :class="{ on: isLive }" />
            LIVE MONITOR
          </div>
          <StatusTag v-if="runDetail" :status="runDetail.run.status" :pulse="isLive" />
          <span v-else class="monitor-idle-tag">IDLE</span>
        </div>

        <template v-if="runDetail">
          <div class="monitor-case">
            <h3>{{ runDetail.run.caseName }}</h3>
            <p>
              #{{ runDetail.run.id }} · {{ runDetail.run.environmentName || '默认环境' }} ·
              {{ triggerLabel(runDetail.run.triggerType) }}
            </p>
          </div>

          <div class="monitor-progress">
            <div
              class="progress-ring"
              :style="{ background: `conic-gradient(#c7f464 ${percent}%, rgba(255,255,255,.08) 0)` }"
            >
              <div class="progress-inner">
                <b>{{ percent }}<small>%</small></b>
                <span>{{ runDetail.run.durationMs ? formatDuration(runDetail.run.durationMs) : '运行中' }}</span>
              </div>
            </div>
            <div class="progress-stats">
              <div><b class="ok">{{ doneStats.passed }}</b><span>通过</span></div>
              <div><b class="bad">{{ doneStats.failed }}</b><span>失败</span></div>
              <div><b>{{ doneStats.skipped }}</b><span>跳过</span></div>
              <div><b>{{ runDetail.steps.length }}</b><span>总步骤</span></div>
            </div>
          </div>

          <div class="monitor-frame">
            <div v-if="latestShot" class="frame-image">
              <img :src="latestShot" alt="最新步骤截图" />
              <span class="frame-tag">LATEST FRAME</span>
            </div>
            <div v-else class="frame-empty">
              <span class="frame-spinner" />
              <b>{{ isLive ? '等待第一帧截图…' : '本次执行没有截图' }}</b>
              <p>页面打开后，每个步骤的截图会实时出现在这里。</p>
            </div>
          </div>

          <div class="monitor-log" ref="logEl">
            <span v-for="(line, index) in logs" :key="index">{{ line }}</span>
            <span v-if="!logs.length" class="muted">等待引擎日志…</span>
          </div>

          <div class="monitor-actions">
            <button type="button" class="ghost-action" @click="viewReport">
              查看完整报告 <span>→</span>
            </button>
            <button v-if="isLive && !cancelled" type="button" class="cancel-action" @click="cancelRun">
              <el-icon><VideoPause /></el-icon>
              取消
            </button>
          </div>
        </template>

        <template v-else>
          <div class="monitor-idle">
            <div class="idle-orbit">
              <span class="orbit-core">F</span>
              <span class="orbit-dot one" />
              <span class="orbit-dot two" />
              <span class="orbit-dot three" />
            </div>
            <h3>执行监视器待命</h3>
            <p>提交后，这里将显示实时进度、每一步截图与引擎日志。</p>
            <div class="idle-pipeline">
              <span>编译</span><i /><span>排队</span><i /><span>Chrome</span><i /><span>报告</span>
            </div>
          </div>
          <div class="monitor-lines">
            <span>ENGINE <b>SELENIUM 4</b></span>
            <span>BROWSER <b>GOOGLE CHROME</b></span>
            <span>TRANSPORT <b>SSE / HTTP</b></span>
          </div>
        </template>
      </section>
    </div>

    <section v-if="steps.length" class="ft-card flow-preview">
      <div class="flow-preview-head">
        <div>
          <div class="section-no">02 / COMPILED FLOW</div>
          <h3>{{ compileResult?.title || '编译后的执行流程' }}</h3>
          <p>{{ compileResult?.summary || '确认以下步骤无误后，即可提交执行。' }}</p>
        </div>
        <div class="flow-preview-actions">
          <span class="step-total">{{ steps.length }} STEPS</span>
          <el-button size="small" :loading="savingCase" @click="saveAsCase">
            保存为用例
          </el-button>
          <el-button v-if="savedCaseId" size="small" type="primary" plain @click="goCases">
            查看用例
          </el-button>
          <el-button size="small" type="primary" :loading="running" @click="runFlow">
            <el-icon><VideoPlay /></el-icon>
            执行
          </el-button>
        </div>
      </div>
      <div class="flow-steps">
        <div v-for="(step, index) in steps" :key="index" class="flow-step">
          <span class="flow-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="flow-action">{{ actionLabel(step.action) }}</span>
          <div class="flow-copy">
            <b>{{ step.description || '未命名步骤' }}</b>
            <div class="flow-values">
              <code v-if="step.selector">{{ step.selector }}</code>
              <span v-if="step.value">{{ step.value }}</span>
            </div>
          </div>
          <el-icon class="flow-ok"><CircleCheck /></el-icon>
        </div>
      </div>
    </section>

    <section v-if="runDetail" id="studio-live" class="ft-card live-panel">
      <div class="live-panel-head">
        <div>
          <div class="section-no">03 / LIVE EXECUTION</div>
          <h3>实时步骤</h3>
          <p>执行快照来自后端 SSE，每一步完成后立即更新状态与截图。</p>
        </div>
        <div class="live-panel-meta">
          <span v-if="latestStep">最近更新 {{ timeAgo(latestStep.finishedAt || latestStep.startedAt) }}</span>
          <el-button size="small" @click="viewReport">
            打开报告 <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
      <div class="live-panel-body">
        <StepTimeline :run-id="runDetail.run.id" :steps="runDetail.steps" />
      </div>
    </section>

    <footer class="studio-foot">
      <span><el-icon><Connection /></el-icon> 编译规则在本地运行；执行由本机 Chrome 完成。</span>
      <span><el-icon><Monitor /></el-icon> 产物保存在后端 data/artifacts，可在报告中下载 ZIP。</span>
      <span><el-icon><Warning /></el-icon> 请确保演示环境 Base URL 指向本机后端。</span>
    </footer>
  </div>
</template>

<style scoped>
.studio-page {
  padding-bottom: 20px;
}

.studio-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 36px;
  align-items: center;
  padding: 34px 38px;
  border-radius: 22px;
  background:
    radial-gradient(circle at 82% 18%, rgba(139, 92, 246, 0.35), transparent 34%),
    radial-gradient(circle at 8% 100%, rgba(91, 91, 214, 0.28), transparent 38%),
    #10111c;
  color: #fff;
  box-shadow: 0 24px 60px rgba(16, 17, 28, 0.22);
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 38px 38px;
  mask-image: radial-gradient(circle at 25% 30%, #000 0%, transparent 72%);
  pointer-events: none;
}

.hero-glow {
  position: absolute;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  right: -80px;
  top: -120px;
  background: #7c3aed;
  filter: blur(100px);
  opacity: 0.28;
  pointer-events: none;
}

.hero-copy {
  position: relative;
  z-index: 2;
}

.studio-kicker {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #aeb0c8;
}

.kicker-spark {
  color: var(--ft-accent);
  font-size: 12px;
}

.hero-copy h1 {
  margin: 15px 0 13px;
  font-size: clamp(28px, 3.1vw, 42px);
  line-height: 1.1;
  letter-spacing: -0.05em;
  font-weight: 800;
}

.hero-copy h1 em {
  font-style: normal;
  background: linear-gradient(100deg, #c7f464, #a5f3fc 60%, #c4b5fd);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-copy > p {
  margin: 0;
  max-width: 530px;
  font-size: 11.5px;
  line-height: 1.8;
  color: #9497ae;
}

.hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 20px;
  color: #7f8299;
  font-size: 9.5px;
  font-weight: 600;
}

.hero-facts span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.hero-facts i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--ft-accent);
}

.hero-console {
  position: relative;
  z-index: 2;
  border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(10, 11, 19, 0.55);
  backdrop-filter: blur(12px);
  overflow: hidden;
  font-family: "SFMono-Regular", Consolas, monospace;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.2);
}

.hero-console-bar {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 11px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
}

.traffic {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.traffic.red {
  background: #f87171;
}

.traffic.yellow {
  background: #fbbf24;
}

.traffic.green {
  background: #4ade80;
}

.console-name {
  margin-left: 4px;
  color: #6e7189;
  font-size: 8px;
}

.console-mode {
  margin-left: auto;
  color: var(--ft-accent);
  font-size: 7.5px;
  letter-spacing: 0.12em;
}

.hero-console pre {
  margin: 0;
  padding: 15px 16px 17px;
  color: #b9bbcd;
  font-size: 9.5px;
  line-height: 1.85;
  white-space: pre-wrap;
}

.c-muted {
  color: #61647b;
}

.c-purple {
  color: #a5b4fc;
}

.c-green {
  color: #86efac;
}

.c-accent {
  color: var(--ft-accent);
}

.studio-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.34fr) minmax(330px, 0.66fr);
  gap: 18px;
  margin-top: 18px;
}

.composer {
  padding: 22px;
}

.composer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 17px;
}

.section-no {
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: var(--ft-primary);
}

.composer-head h2 {
  margin: 6px 0 4px;
  font-size: 18px;
  letter-spacing: -0.035em;
}

.composer-head p {
  margin: 0;
  color: var(--ft-muted);
  font-size: 10.5px;
}

.composer-help {
  width: 21px;
  height: 21px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 1px solid var(--ft-line);
  color: #a3a6b5;
  font-size: 10px;
  cursor: help;
}

.config-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.config-row label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.config-row label > span {
  font-size: 9px;
  font-weight: 700;
  color: #9a9dae;
}

.config-row :deep(.el-select) {
  width: 166px;
}

.config-switch {
  flex-direction: row !important;
  align-items: center !important;
  gap: 7px !important;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--ft-line);
  border-radius: 9px;
  background: #fbfbfd;
}

.config-switch > span {
  font-size: 9.5px !important;
  color: #7b7f91 !important;
}

.prompt-box {
  border: 1px solid #e2e3ee;
  border-radius: 14px;
  padding: 12px;
  background: #fbfbfd;
  transition: border 0.18s, box-shadow 0.18s;
}

.prompt-box:focus-within {
  border-color: #c7c8f4;
  box-shadow: 0 0 0 4px rgba(91, 91, 214, 0.06);
}

.prompt-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #8b8e9f;
}

.prompt-icon {
  color: var(--ft-primary);
  font-size: 12px;
}

.prompt-count {
  margin-left: auto;
  letter-spacing: 0;
  font-weight: 500;
  color: #b0b3c1;
}

.prompt-box :deep(.el-textarea__inner) {
  padding: 0;
  background: transparent;
  box-shadow: none;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.9;
  color: #343748;
}

.prompt-box :deep(.el-textarea__inner::placeholder) {
  color: #b4b7c4;
}

.prompt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e8e9f1;
}

.prompt-examples {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-right: auto;
  font-size: 8.5px;
  color: #b0b3c1;
}

.prompt-examples button {
  border: 1px solid #e7e8f0;
  border-radius: 999px;
  background: #fff;
  color: #7b7f91;
  padding: 3px 7px;
  font-size: 8.5px;
  cursor: pointer;
  transition: color 0.15s, border 0.15s;
}

.prompt-examples button:hover {
  color: var(--ft-primary);
  border-color: #cfcff3;
}

.compile-alerts {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 10px;
}

.compile-alerts :deep(.el-alert) {
  padding: 6px 10px;
}

.compile-alerts :deep(.el-alert__title) {
  font-size: 10px;
}

.composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 16px;
}

.engine-note {
  display: flex;
  align-items: center;
  gap: 8px;
}

.engine-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1);
}

.engine-note b {
  display: block;
  font-size: 10.5px;
  color: #3f4252;
}

.engine-note small {
  display: block;
  margin-top: 1px;
  font-size: 8.5px;
  color: #a0a3b1;
}

.run-button {
  height: 42px;
  padding: 0 20px;
  border-radius: 11px;
  background: linear-gradient(100deg, #5b5bd6, #7c5cf0);
  border: 0;
  box-shadow: 0 12px 24px rgba(91, 91, 214, 0.25);
}

.monitor {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  padding: 18px;
  background:
    radial-gradient(circle at 100% 0%, rgba(91, 91, 214, 0.22), transparent 40%),
    #12131f;
  color: #fff;
  min-height: 440px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 44px rgba(16, 17, 28, 0.18);
}

.monitor.live {
  border: 1px solid rgba(199, 244, 100, 0.18);
}

.monitor-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.monitor-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 8px;
  letter-spacing: 0.16em;
  font-weight: 800;
  color: #7f8299;
}

.monitor-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4b4e63;
}

.monitor-dot.on {
  background: var(--ft-accent);
  box-shadow: 0 0 0 4px rgba(199, 244, 100, 0.08);
  animation: ft-pulse 1.4s infinite;
}

.monitor-idle-tag {
  font-size: 7.5px;
  letter-spacing: 0.12em;
  color: #5f6278;
  font-weight: 800;
}

.monitor-case {
  margin-top: 14px;
}

.monitor-case h3 {
  margin: 0;
  font-size: 15px;
  letter-spacing: -0.02em;
}

.monitor-case p {
  margin: 4px 0 0;
  font-size: 9px;
  color: #7f8299;
}

.monitor-progress {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 16px;
}

.progress-ring {
  flex: 0 0 84px;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: background 0.4s;
}

.progress-inner {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: #171826;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.progress-inner b {
  font-size: 20px;
  letter-spacing: -0.04em;
}

.progress-inner b small {
  font-size: 9px;
  margin-left: 1px;
  color: #8b8ea4;
}

.progress-inner span {
  margin-top: 1px;
  font-size: 7.5px;
  color: #6a6d84;
}

.progress-stats {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
}

.progress-stats div {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.progress-stats b {
  font-size: 15px;
  letter-spacing: -0.02em;
}

.progress-stats b.ok {
  color: #4ade80;
}

.progress-stats b.bad {
  color: #f87171;
}

.progress-stats span {
  font-size: 8px;
  color: #767991;
}

.monitor-frame {
  margin-top: 14px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #0b0c14;
}

.frame-image {
  position: relative;
}

.frame-image img {
  display: block;
  width: 100%;
  height: 124px;
  object-fit: cover;
  object-position: top;
  opacity: 0.92;
}

.frame-tag {
  position: absolute;
  left: 8px;
  bottom: 7px;
  font-size: 7px;
  letter-spacing: 0.1em;
  color: #d7d9e7;
  background: rgba(8, 9, 15, 0.7);
  border-radius: 4px;
  padding: 2px 5px;
}

.frame-empty {
  height: 124px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 14px;
}

.frame-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(199, 244, 100, 0.18);
  border-top-color: var(--ft-accent);
  animation: spin 0.9s linear infinite;
  margin-bottom: 9px;
}

.frame-empty b {
  font-size: 10px;
  color: #b9bbcd;
}

.frame-empty p {
  margin: 4px 0 0;
  max-width: 240px;
  color: #65687f;
  font-size: 8.5px;
  line-height: 1.6;
}

.monitor-log {
  flex: 1;
  min-height: 76px;
  max-height: 130px;
  overflow-y: auto;
  margin-top: 11px;
  padding: 9px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 8.5px;
  line-height: 1.7;
}

.monitor-log span {
  display: block;
  color: #8e91a7;
  white-space: pre-wrap;
  word-break: break-word;
}

.monitor-log .muted {
  color: #565a70;
}

.monitor-log::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
}

.monitor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
}

.ghost-action,
.cancel-action {
  border: 0;
  background: transparent;
  color: #b8bad0;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
}

.ghost-action span {
  color: var(--ft-accent);
}

.ghost-action:hover {
  color: #fff;
}

.cancel-action {
  color: #f87171;
}

.monitor-idle {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px 12px 16px;
}

.idle-orbit {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  display: grid;
  place-items: center;
  margin-bottom: 20px;
}

.idle-orbit::before {
  content: "";
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  border: 1px solid rgba(199, 244, 100, 0.14);
}

.orbit-core {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, #7c7cf0, #5b5bd6);
  font-weight: 900;
  font-size: 16px;
  box-shadow: 0 0 28px rgba(91, 91, 214, 0.4);
}

.orbit-dot {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ft-accent);
}

.orbit-dot.one {
  top: 6px;
  left: 50%;
}

.orbit-dot.two {
  right: 7px;
  bottom: 25px;
  opacity: 0.6;
}

.orbit-dot.three {
  left: 11px;
  bottom: 17px;
  opacity: 0.35;
}

.monitor-idle h3 {
  margin: 0;
  font-size: 13px;
}

.monitor-idle p {
  margin: 5px 0 0;
  max-width: 240px;
  color: #73768c;
  font-size: 9.5px;
  line-height: 1.7;
}

.idle-pipeline {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 18px;
  color: #676a81;
  font-size: 8px;
  font-weight: 700;
}

.idle-pipeline i {
  width: 12px;
  height: 1px;
  background: #35374a;
}

.monitor-lines {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 7px;
  letter-spacing: 0.08em;
  color: #4e5168;
}

.monitor-lines span {
  display: flex;
  justify-content: space-between;
}

.monitor-lines b {
  color: #6c6f87;
  font-weight: 700;
}

.flow-preview {
  margin-top: 18px;
  overflow: hidden;
}

.flow-preview-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--ft-line);
}

.flow-preview-head h3 {
  margin: 5px 0 3px;
  font-size: 15px;
  letter-spacing: -0.02em;
}

.flow-preview-head p {
  margin: 0;
  color: var(--ft-muted);
  font-size: 10px;
}

.flow-preview-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.step-total {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #a0a3b1;
  background: #f5f5fa;
  border-radius: 5px;
  padding: 4px 7px;
  margin-right: 3px;
}

.flow-steps {
  padding: 10px 14px 14px;
}

.flow-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 8px;
  border-bottom: 1px dashed #eef0f5;
}

.flow-step:last-child {
  border-bottom: 0;
}

.flow-index {
  flex: 0 0 25px;
  width: 25px;
  height: 25px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: #f3f3fb;
  color: #8b8e9f;
  font-size: 8px;
  font-weight: 800;
  font-family: "SFMono-Regular", Consolas, monospace;
}

.flow-action {
  flex: 0 0 72px;
  font-size: 9px;
  font-weight: 800;
  color: var(--ft-primary);
}

.flow-copy {
  flex: 1;
  min-width: 0;
}

.flow-copy b {
  display: block;
  font-size: 10.5px;
  color: #3f4252;
  font-weight: 600;
}

.flow-values {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 3px;
}

.flow-values code,
.flow-values span {
  font-size: 8.5px;
  color: #9a9dae;
  background: #fafafd;
  border: 1px solid #f0f1f6;
  border-radius: 4px;
  padding: 1px 5px;
}

.flow-values span {
  border: 0;
  background: transparent;
  padding-left: 0;
}

.flow-ok {
  color: #22c55e;
  font-size: 13px;
}

.live-panel {
  margin-top: 18px;
}

.live-panel-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--ft-line);
}

.live-panel-head h3 {
  margin: 5px 0 3px;
  font-size: 15px;
}

.live-panel-head p {
  margin: 0;
  color: var(--ft-muted);
  font-size: 10px;
}

.live-panel-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #a0a3b1;
  font-size: 9px;
}

.live-panel-body {
  padding: 16px 22px 20px;
}

.studio-foot {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  margin-top: 20px;
  padding: 0 2px;
  color: #a0a3b1;
  font-size: 9px;
}

.studio-foot span {
  display: flex;
  align-items: center;
  gap: 5px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .studio-hero {
    grid-template-columns: 1fr;
  }

  .hero-console {
    display: none;
  }

  .studio-grid {
    grid-template-columns: 1fr;
  }

  .monitor {
    min-height: 400px;
  }
}

@media (max-width: 720px) {
  .studio-hero {
    padding: 26px 22px;
  }

  .config-row label {
    flex: 1;
  }

  .config-row :deep(.el-select) {
    width: 100%;
  }

  .config-switch {
    flex: 0 0 auto !important;
  }

  .composer-foot {
    align-items: stretch;
    flex-direction: column;
  }

  .run-button {
    width: 100%;
  }

  .flow-preview-head,
  .live-panel-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
