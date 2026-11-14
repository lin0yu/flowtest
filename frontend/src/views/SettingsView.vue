<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Clock,
  Connection,
  CopyDocument,
  Delete,
  Document,
  Key,
  Link,
  Lock,
  Monitor,
  Plus
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { apiKeyApi, authApi, systemApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { formatDate, timeAgo } from '@/utils/format'
import type { ApiKey, ApiKeyCreated, SystemStatus } from '@/types'

const auth = useAuthStore()
const status = ref<SystemStatus | null>(null)
const keys = ref<ApiKey[]>([])
const loading = ref(true)
const savingPassword = ref(false)
const keyDialogVisible = ref(false)
const keyName = ref('')
const creatingKey = ref(false)
const createdKey = ref<ApiKeyCreated | null>(null)
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const roleLabel = computed(() => {
  const map: Record<string, string> = { ADMIN: '平台管理员', TESTER: '测试工程师', VIEWER: '只读成员' }
  return map[auth.user?.role || ''] || auth.user?.role || '成员'
})
const apiBase = 'http://localhost:8080'
const codeExample = computed(
  () => `curl -X POST ${apiBase}/api/v1/automation/runs \\
  -H "X-API-Key: ${createdKey.value?.plainKey || 'ft_你的密钥'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": 1,
    "nl": "打开 /demo/index.html\\n断言标题包含 FlowShop"
  }'`
)

const endpoints = [
  { method: 'POST', path: '/api/v1/automation/compile', label: '编译自然语言' },
  { method: 'POST', path: '/api/v1/automation/runs', label: '创建执行，可选 wait=true' },
  { method: 'GET', path: '/api/v1/automation/runs/{id}', label: '查询执行详情' },
  { method: 'POST', path: '/api/v1/automation/runs/{id}/cancel', label: '取消执行' },
  { method: 'GET', path: '/api/v1/automation/health', label: '健康检查' }
]

async function load() {
  loading.value = true
  try {
    const [statusRes, keysRes] = await Promise.allSettled([systemApi.status(), apiKeyApi.list()])
    if (statusRes.status === 'fulfilled') status.value = statusRes.value.data
    if (keysRes.status === 'fulfilled') keys.value = keysRes.value.data
  } finally {
    loading.value = false
  }
}

function uptime(seconds?: number) {
  if (seconds === undefined) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分钟`
}

async function changePassword() {
  if (!passwordForm.oldPassword || !passwordForm.newPassword) {
    ElMessage.warning('请填写原密码与新密码')
    return
  }
  if (passwordForm.newPassword.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  savingPassword.value = true
  try {
    await authApi.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    ElMessage.success('密码已更新，请妥善保管')
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
  } finally {
    savingPassword.value = false
  }
}

function openKeyDialog() {
  keyName.value = ''
  createdKey.value = null
  keyDialogVisible.value = true
}

async function createKey() {
  if (!keyName.value.trim()) {
    ElMessage.warning('请输入密钥名称')
    return
  }
  creatingKey.value = true
  try {
    const { data } = await apiKeyApi.create(keyName.value.trim())
    createdKey.value = data
    keys.value = [data.key, ...keys.value]
    ElMessage.success('API Key 已创建')
  } finally {
    creatingKey.value = false
  }
}

async function removeKey(key: ApiKey) {
  try {
    await ElMessageBox.confirm(
      `确定删除 API Key「${key.name}」吗？正在使用它的外部调用将立即失败。`,
      '删除 API Key',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await apiKeyApi.remove(key.id)
  keys.value = keys.value.filter((item) => item.id !== key.id)
  ElMessage.success('API Key 已删除')
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.warning('浏览器不允许自动复制，请手动选择')
  }
}

function openDemo() {
  window.open('/demo/index.html', '_blank')
}

onMounted(load)
</script>

<template>
  <div class="page settings-page" v-loading="loading">
    <PageHeader
      title="系统设置"
      subtitle="管理账号安全、外部调用密钥，并查看执行引擎与运行时状态。"
      eyebrow="PREFERENCES"
    >
      <template #actions>
        <el-button @click="openDemo">
          <el-icon><Monitor /></el-icon>
          演示站点
        </el-button>
        <el-button @click="load">
          <el-icon><Connection /></el-icon>
          刷新状态
        </el-button>
      </template>
    </PageHeader>

    <div class="settings-grid">
      <div class="settings-main">
        <section class="profile-card">
          <div class="profile-avatar">{{ auth.initials }}</div>
          <div class="profile-copy">
            <div class="profile-eyebrow">SIGNED IN AS</div>
            <h2>{{ auth.displayName }}</h2>
            <p>@{{ auth.user?.username || 'admin' }} · {{ roleLabel }}</p>
          </div>
          <div class="profile-chips">
            <span>本地部署</span>
            <span>JWT 会话</span>
            <span v-if="status?.engineReady" class="ok">引擎在线</span>
          </div>
        </section>

        <section class="ft-card setting-card">
          <div class="setting-head">
            <div class="setting-icon"><el-icon><Lock /></el-icon></div>
            <div>
              <h3>账号安全</h3>
              <p>修改登录密码。修改后当前会话仍然有效，下次登录请使用新密码。</p>
            </div>
          </div>
          <el-form label-position="top" class="password-form" @submit.prevent="changePassword">
            <div class="password-grid">
              <el-form-item label="原密码">
                <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="输入当前密码" />
              </el-form-item>
              <el-form-item label="新密码">
                <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="至少 6 位" />
              </el-form-item>
              <el-form-item label="确认新密码">
                <el-input
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  show-password
                  placeholder="再次输入新密码"
                  @keyup.enter="changePassword"
                />
              </el-form-item>
            </div>
            <div class="setting-actions">
              <span class="muted text-xs">演示账号默认密码为 admin123</span>
              <el-button type="primary" :loading="savingPassword" @click="changePassword">更新密码</el-button>
            </div>
          </el-form>
        </section>

        <section class="ft-card setting-card">
          <div class="setting-head">
            <div class="setting-icon violet"><el-icon><Key /></el-icon></div>
            <div>
              <h3>API 密钥</h3>
              <p>用于外部系统调用自动化 API。密钥只在创建时完整显示一次。</p>
            </div>
            <el-button class="head-button" size="small" type="primary" plain @click="openKeyDialog">
              <el-icon><Plus /></el-icon>
              新建密钥
            </el-button>
          </div>

          <div v-if="keys.length" class="key-list">
            <div v-for="key in keys" :key="key.id" class="key-row">
              <span class="key-mark"><el-icon><Key /></el-icon></span>
              <div class="key-copy">
                <b>{{ key.name }}</b>
                <code>{{ key.prefix }}••••••••</code>
              </div>
              <div class="key-meta">
                <span>创建 {{ formatDate(key.createdAt, 'YYYY-MM-DD') }}</span>
                <span>{{ key.lastUsedAt ? `最后使用 ${timeAgo(key.lastUsedAt)}` : '尚未使用' }}</span>
              </div>
              <span class="key-state" :class="{ off: !key.enabled }">{{ key.enabled ? '启用' : '停用' }}</span>
              <el-button link type="danger" size="small" @click="removeKey(key)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
          <div v-else class="keys-empty">
            <span class="keys-empty-icon"><el-icon><Key /></el-icon></span>
            <div>
              <b>还没有 API Key</b>
              <p>创建一个密钥，即可从脚本、CI 或其它平台触发 FlowTest 执行。</p>
            </div>
            <el-button size="small" @click="openKeyDialog">创建</el-button>
          </div>
        </section>

        <section class="ft-card setting-card">
          <div class="setting-head">
            <div class="setting-icon green"><el-icon><Document /></el-icon></div>
            <div>
              <h3>外部调用示例</h3>
              <p>使用 <code>X-API-Key</code> 调用自动化 API；设置 <code>wait=true</code> 可同步返回报告。</p>
            </div>
            <el-button class="head-button" size="small" text @click="copyText(codeExample, '调用示例')">
              <el-icon><CopyDocument /></el-icon>
              复制
            </el-button>
          </div>
          <pre class="code-block">{{ codeExample }}</pre>
          <div class="endpoint-list">
            <div v-for="endpoint in endpoints" :key="endpoint.path" class="endpoint-row">
              <span class="method" :class="endpoint.method.toLowerCase()">{{ endpoint.method }}</span>
              <code>{{ endpoint.path }}</code>
              <span>{{ endpoint.label }}</span>
            </div>
          </div>
        </section>
      </div>

      <aside class="settings-side">
        <section class="ft-card status-card">
          <div class="side-head">
            <div>
              <h3>运行时状态</h3>
              <p>当前后端与 Chrome 引擎</p>
            </div>
            <span class="status-dot" :class="{ ok: status?.engineReady }">
              {{ status?.engineReady ? 'ONLINE' : 'CHECKING' }}
            </span>
          </div>
          <div class="status-list">
            <div class="status-row">
              <span><el-icon><Monitor /></el-icon>浏览器</span>
              <b>{{ status?.browserVersion || status?.browser || '—' }}</b>
            </div>
            <div class="status-row">
              <span><el-icon><Connection /></el-icon>执行引擎</span>
              <b :class="{ ok: status?.engineReady }">{{ status?.engineReady ? 'Selenium 就绪' : '未就绪' }}</b>
            </div>
            <div class="status-row">
              <span><el-icon><Key /></el-icon>AI 编译</span>
              <b>{{ status?.llmEnabled ? status.llmModel : '本地规则引擎' }}</b>
            </div>
            <div class="status-row">
              <span><el-icon><Link /></el-icon>最大并发</span>
              <b>{{ status?.maxParallel ?? 3 }} 个浏览器会话</b>
            </div>
            <div class="status-row">
              <span><el-icon><Clock /></el-icon>运行时长</span>
              <b>{{ uptime(status?.uptimeSeconds) }}</b>
            </div>
            <div class="status-row">
              <span><el-icon><Document /></el-icon>版本</span>
              <b>v{{ status?.version || '1.0.0' }}</b>
            </div>
          </div>
          <div class="storage-box">
            <span>产物存储</span>
            <code>{{ status?.storageRoot || './data' }}</code>
          </div>
        </section>

        <section class="ft-card queue-card">
          <div class="side-head">
            <div>
              <h3>执行队列</h3>
              <p>实时容量</p>
            </div>
            <span class="queue-num">{{ (status?.queuedRuns ?? 0) + (status?.activeRuns ?? 0) }}</span>
          </div>
          <div class="queue-row">
            <span>执行中</span>
            <b>{{ status?.activeRuns ?? 0 }}</b>
          </div>
          <div class="queue-row">
            <span>排队中</span>
            <b>{{ status?.queuedRuns ?? 0 }}</b>
          </div>
          <div class="queue-bar">
            <span
              :style="{
                width: `${Math.min(100, ((status?.activeRuns ?? 0) / (status?.maxParallel || 3)) * 100)}%`
              }"
            />
          </div>
          <p class="queue-hint">执行由本机线程池调度，超过并发上限的运行会进入队列等待。</p>
        </section>

        <section class="ft-card about-card">
          <div class="about-logo">F</div>
          <div class="about-copy">
            <b>FlowTest 灵测</b>
            <p>自然语言 Web 自动化测试平台 · v{{ status?.version || '1.0.0' }}</p>
          </div>
          <div class="about-stack">
            <span>Vue 3.5</span>
            <span>Spring Boot 3.5</span>
            <span>Selenium 4</span>
            <span>JDK 21</span>
          </div>
          <button class="about-demo" type="button" @click="openDemo">
            打开 FlowShop 演示站点 <span>↗</span>
          </button>
        </section>
      </aside>
    </div>

    <el-dialog v-model="keyDialogVisible" title="新建 API Key" width="520px" destroy-on-close>
      <template v-if="!createdKey">
        <el-form label-position="top">
          <el-form-item label="密钥名称" required>
            <el-input v-model="keyName" maxlength="80" placeholder="例如：CI Pipeline / 外部自动化脚本" />
          </el-form-item>
        </el-form>
        <el-alert
          title="密钥用于外部系统调用 /api/v1/automation/**，请妥善保管。"
          type="info"
          :closable="false"
          show-icon
        />
      </template>

      <template v-else>
        <el-alert
          title="密钥仅显示一次，请立即复制并保存到安全位置。"
          type="warning"
          :closable="false"
          show-icon
        />
        <div class="created-key">
          <code>{{ createdKey.plainKey }}</code>
          <el-button size="small" @click="copyText(createdKey.plainKey, 'API Key')">
            <el-icon><CopyDocument /></el-icon>
            复制
          </el-button>
        </div>
        <div class="created-meta">
          <span>名称</span><b>{{ createdKey.key.name }}</b>
          <span>前缀</span><b>{{ createdKey.key.prefix }}</b>
        </div>
      </template>

      <template #footer>
        <template v-if="!createdKey">
          <el-button @click="keyDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="creatingKey" @click="createKey">创建密钥</el-button>
        </template>
        <el-button v-else type="primary" @click="keyDialogVisible = false">我已保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.7fr);
  gap: 18px;
  align-items: start;
}

.settings-main,
.settings-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 22px;
  border-radius: 18px;
  background:
    radial-gradient(circle at 100% 0%, rgba(139, 92, 246, 0.32), transparent 38%),
    linear-gradient(135deg, #12131f, #20213b);
  color: #fff;
  box-shadow: 0 18px 40px rgba(16, 17, 28, 0.18);
}

.profile-avatar {
  flex: 0 0 51px;
  width: 51px;
  height: 51px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, #7c7cf0, #5b5bd6);
  font-size: 19px;
  font-weight: 900;
  box-shadow: 0 10px 24px rgba(91, 91, 214, 0.35);
}

.profile-copy {
  min-width: 0;
}

.profile-eyebrow {
  font-size: 7.5px;
  letter-spacing: 0.16em;
  font-weight: 800;
  color: #777a98;
}

.profile-copy h2 {
  margin: 4px 0 2px;
  font-size: 21px;
  letter-spacing: -0.03em;
}

.profile-copy p {
  margin: 0;
  color: #8f92ab;
  font-size: 9.5px;
}

.profile-chips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-left: auto;
}

.profile-chips span {
  font-size: 8px;
  color: #a5a8c1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 4px 7px;
}

.profile-chips span.ok {
  color: var(--ft-accent);
}

.setting-card {
  padding: 20px;
}

.setting-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
}

.setting-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 14px;
}

.setting-icon.violet {
  background: #f5f0ff;
  color: #7c3aed;
}

.setting-icon.green {
  background: #eefbf4;
  color: #0d9488;
}

.setting-head h3 {
  margin: 1px 0 3px;
  font-size: 13px;
  letter-spacing: -0.01em;
}

.setting-head p {
  margin: 0;
  color: var(--ft-muted);
  font-size: 9.5px;
  line-height: 1.6;
}

.setting-head code {
  background: #f4f4f9;
  border-radius: 3px;
  padding: 1px 4px;
  color: #6f7385;
  font-size: 8.5px;
}

.head-button {
  margin-left: auto;
  flex: 0 0 auto;
}

.password-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0 12px;
}

.password-grid :deep(.el-form-item) {
  margin-bottom: 8px;
}

.setting-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}

.key-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.key-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: 9px;
  border: 1px solid #f0f1f6;
  background: #fbfbfd;
}

.key-mark {
  width: 27px;
  height: 27px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 11px;
}

.key-copy {
  flex: 1;
  min-width: 0;
}

.key-copy b {
  display: block;
  font-size: 10px;
  color: #3f4252;
}

.key-copy code {
  display: block;
  margin-top: 1px;
  font-size: 8px;
  color: #9a9dae;
}

.key-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  color: #a0a3b1;
  font-size: 8px;
}

.key-state {
  font-size: 8px;
  font-weight: 700;
  color: #15803d;
  background: #f0fdf4;
  border-radius: 4px;
  padding: 2px 5px;
}

.key-state.off {
  color: #6b7280;
  background: #f3f4f6;
}

.keys-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px dashed var(--ft-line-strong);
  border-radius: 10px;
}

.keys-empty-icon {
  width: 31px;
  height: 31px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: #f5f5fa;
  color: #a0a3b1;
  font-size: 13px;
}

.keys-empty > div {
  flex: 1;
}

.keys-empty b {
  display: block;
  font-size: 10.5px;
}

.keys-empty p {
  margin: 2px 0 0;
  color: #a0a3b1;
  font-size: 8.5px;
  line-height: 1.5;
}

.code-block {
  margin: 0;
  padding: 14px;
  border-radius: 10px;
  background: #14151f;
  color: #c7c9da;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 8.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.endpoint-list {
  margin-top: 10px;
  border-top: 1px dashed #eef0f5;
  padding-top: 7px;
}

.endpoint-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 0;
  font-size: 8.5px;
  color: #9a9dae;
}

.method {
  flex: 0 0 38px;
  padding: 2px 0;
  border-radius: 4px;
  text-align: center;
  font-size: 7px;
  font-weight: 800;
  background: #f0fdf4;
  color: #15803d;
}

.method.post {
  background: #eef2ff;
  color: #4f46e5;
}

.endpoint-row code {
  flex: 0 0 280px;
  color: #5b5f73;
  font-size: 8.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.side-head h3 {
  margin: 0;
  font-size: 12px;
}

.side-head p {
  margin: 3px 0 0;
  color: #a0a3b1;
  font-size: 8.5px;
}

.status-card {
  padding: 18px;
}

.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: #b45309;
  background: #fffbeb;
  border-radius: 999px;
  padding: 4px 6px;
}

.status-dot::before {
  content: "";
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}

.status-dot.ok {
  color: #15803d;
  background: #f0fdf4;
}

.status-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
}

.status-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px dashed #f0f1f6;
  font-size: 9px;
}

.status-row span {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #9a9dae;
}

.status-row b {
  color: #4b4f60;
  font-weight: 600;
  text-align: right;
  word-break: break-word;
}

.status-row b.ok {
  color: #15803d;
}

.storage-box {
  margin-top: 11px;
  padding: 8px;
  border-radius: 7px;
  background: #fafafd;
  border: 1px solid #f0f1f6;
}

.storage-box span {
  display: block;
  font-size: 7.5px;
  font-weight: 700;
  color: #b0b3c1;
  margin-bottom: 2px;
}

.storage-box code {
  display: block;
  font-size: 8px;
  color: #7b7f91;
  word-break: break-all;
}

.queue-card {
  padding: 18px;
}

.queue-num {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--ft-primary);
}

.queue-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 0;
  border-top: 1px dashed #f0f1f6;
  font-size: 9px;
  color: #8b8e9f;
}

.queue-row b {
  color: #3f4252;
}

.queue-bar {
  height: 5px;
  margin-top: 7px;
  border-radius: 99px;
  background: #f1f2f7;
  overflow: hidden;
}

.queue-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #8b8be2, #5b5bd6);
  transition: width 0.4s;
}

.queue-hint {
  margin: 9px 0 0;
  color: #a0a3b1;
  font-size: 8.5px;
  line-height: 1.6;
}

.about-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.about-logo {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, #7c7cf0, #5b5bd6);
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  margin-bottom: 9px;
}

.about-copy b {
  display: block;
  font-size: 12px;
}

.about-copy p {
  margin: 3px 0 0;
  color: #a0a3b1;
  font-size: 8.5px;
  line-height: 1.6;
}

.about-stack {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.about-stack span {
  font-size: 7.5px;
  color: #8b8e9f;
  background: #f5f5fa;
  border-radius: 4px;
  padding: 3px 5px;
}

.about-demo {
  width: 100%;
  margin-top: 12px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #e7e8f0;
  background: #fafafd;
  color: #55596b;
  font-size: 9px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.about-demo span {
  float: right;
  color: var(--ft-primary);
}

.about-demo:hover {
  border-color: #cfcff3;
}

.created-key {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px;
  border-radius: 9px;
  background: #fafafd;
  border: 1px solid var(--ft-line);
}

.created-key code {
  flex: 1;
  font-size: 9.5px;
  color: var(--ft-primary);
  word-break: break-all;
}

.created-meta {
  display: grid;
  grid-template-columns: 50px 1fr;
  gap: 5px 10px;
  margin-top: 10px;
  font-size: 9px;
}

.created-meta span {
  color: #9a9dae;
}

.created-meta b {
  color: #3f4252;
  font-weight: 600;
}

@media (max-width: 1120px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .settings-side {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .about-card {
    grid-column: span 2;
  }
}

@media (max-width: 700px) {
  .password-grid,
  .settings-side {
    display: flex;
    flex-direction: column;
  }

  .profile-chips {
    display: none;
  }

  .setting-head {
    flex-wrap: wrap;
  }

  .head-button {
    margin-left: 42px;
  }

  .key-meta {
    display: none;
  }

  .endpoint-row code {
    flex: 1;
  }

  .about-card {
    grid-column: auto;
  }
}
</style>
