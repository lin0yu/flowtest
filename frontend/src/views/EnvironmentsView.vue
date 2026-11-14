<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Edit,
  Link,
  Plus,
  Setting,
  Star,
  StarFilled
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { environmentApi, projectApi } from '@/api'
import type { Environment, Project } from '@/types'

const router = useRouter()
const loading = ref(true)
const projects = ref<Project[]>([])
const environments = ref<Environment[]>([])
const projectId = ref<number>()
const dialogVisible = ref(false)
const saving = ref(false)
const editing = ref<Environment | null>(null)
const form = reactive({
  name: '',
  baseUrl: '',
  defaultEnv: false,
  variables: [{ key: '', value: '' }]
})

const dialogTitle = computed(() => (editing.value ? '编辑环境' : '新建环境'))
const currentProject = computed(() => projects.value.find((item) => item.id === projectId.value))

async function loadProjects() {
  const { data } = await projectApi.list()
  projects.value = data
  if (!projectId.value) projectId.value = data[0]?.id
}

async function loadEnvironments() {
  if (!projectId.value) {
    environments.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await environmentApi.list(projectId.value)
    environments.value = data
  } finally {
    loading.value = false
  }
}

async function onProjectChange() {
  await loadEnvironments()
}

function resetForm() {
  form.name = ''
  form.baseUrl = currentProject.value?.key === 'FLOWSHOP' ? 'http://localhost:8080' : ''
  form.defaultEnv = environments.value.length === 0
  form.variables = [{ key: '', value: '' }]
}

function openCreate() {
  if (!projectId.value) {
    ElMessage.warning('请先创建或选择项目')
    return
  }
  editing.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(env: Environment) {
  editing.value = env
  form.name = env.name
  form.baseUrl = env.baseUrl || ''
  form.defaultEnv = env.defaultEnv
  const entries = Object.entries(env.variables || {})
  form.variables = entries.length
    ? entries.map(([key, value]) => ({ key, value }))
    : [{ key: '', value: '' }]
  dialogVisible.value = true
}

function addVariable() {
  form.variables.push({ key: '', value: '' })
}

function removeVariable(index: number) {
  form.variables.splice(index, 1)
  if (!form.variables.length) form.variables.push({ key: '', value: '' })
}

async function save() {
  if (!projectId.value) return
  if (!form.name.trim()) {
    ElMessage.warning('请输入环境名称')
    return
  }
  if (form.baseUrl.trim()) {
    try {
      new URL(form.baseUrl.trim())
    } catch {
      ElMessage.warning('Base URL 需要是完整地址，例如 http://localhost:8080')
      return
    }
  }
  const variables: Record<string, string> = {}
  const seen = new Set<string>()
  for (const pair of form.variables) {
    const key = pair.key.trim()
    if (!key) continue
    if (seen.has(key)) {
      ElMessage.warning(`变量 ${key} 重复，请合并后再保存`)
      return
    }
    seen.add(key)
    variables[key] = pair.value
  }
  saving.value = true
  try {
    const payload = {
      projectId: projectId.value,
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim() || undefined,
      variables,
      defaultEnv: form.defaultEnv
    }
    if (editing.value) {
      await environmentApi.update(editing.value.id, payload)
      ElMessage.success('环境已更新')
    } else {
      await environmentApi.create(payload)
      ElMessage.success('环境已创建')
    }
    dialogVisible.value = false
    await loadEnvironments()
    await loadProjects()
  } finally {
    saving.value = false
  }
}

async function setDefault(env: Environment) {
  await environmentApi.update(env.id, {
    projectId: env.projectId,
    name: env.name,
    baseUrl: env.baseUrl,
    variables: env.variables,
    defaultEnv: true
  })
  ElMessage.success(`已将「${env.name}」设为默认环境`)
  await loadEnvironments()
}

async function removeEnv(env: Environment) {
  try {
    await ElMessageBox.confirm(
      `确定删除环境「${env.name}」吗？任务与用例若引用了它，需要重新指定。`,
      '删除环境',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await environmentApi.remove(env.id)
  ElMessage.success('环境已删除')
  await loadEnvironments()
  await loadProjects()
}

function varEntries(env: Environment) {
  return Object.entries(env.variables || {})
}

function maskValue(key: string, value: string) {
  if (/password|secret|token|key/i.test(key) && value) {
    return '••••••'
  }
  return value
}

function openDemo() {
  window.open('/demo/index.html', '_blank')
}

onMounted(async () => {
  await loadProjects()
  await loadEnvironments()
})
</script>

<template>
  <div class="page environments-page">
    <PageHeader
      title="环境配置"
      subtitle="集中管理 Base URL 与变量。执行时，步骤中的 ${变量名} 会被替换为对应值。"
      eyebrow="ENVIRONMENT"
    >
      <template #actions>
        <el-button @click="router.push('/cases')">
          <el-icon><Setting /></el-icon>
          查看用例
        </el-button>
        <el-button type="primary" :disabled="!projectId" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新建环境
        </el-button>
      </template>
    </PageHeader>

    <section class="env-info">
      <div class="var-mark"><span>$</span>{ }</div>
      <div class="env-info-copy">
        <b>变量注入</b>
        <p>
          在步骤的选择器或参数值中写入 <code>${demoUser}</code>，执行时会从当前环境变量中取值。
          Base URL 会自动拼接到以 <code>/</code> 开头的相对路径前。
        </p>
      </div>
      <button type="button" class="demo-open" @click="openDemo">
        打开演示站点 <span>↗</span>
      </button>
    </section>

    <div class="filter-bar">
      <el-select v-model="projectId" placeholder="选择项目" @change="onProjectChange">
        <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id" />
      </el-select>
      <div class="project-chip" v-if="currentProject">
        <span class="project-color" :style="{ background: currentProject.color }" />
        {{ currentProject.key }}
      </div>
      <el-button :loading="loading" @click="loadEnvironments">
        <el-icon><Star /></el-icon>
        刷新
      </el-button>
      <span class="grow" />
      <span class="muted text-xs">{{ environments.length }} 个环境</span>
    </div>

    <div v-if="environments.length" class="env-grid">
      <article v-for="env in environments" :key="env.id" class="env-card" :class="{ default: env.defaultEnv }">
        <div class="env-card-top">
          <div class="env-icon" :class="{ default: env.defaultEnv }">
            <el-icon><Link /></el-icon>
          </div>
          <span v-if="env.defaultEnv" class="default-badge">
            <el-icon><StarFilled /></el-icon> 默认环境
          </span>
          <el-dropdown v-else trigger="click">
            <button class="env-more" type="button">设为默认</button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="setDefault(env)">设为默认环境</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <h3>{{ env.name }}</h3>
        <div class="base-url">
          <span>BASE URL</span>
          <code>{{ env.baseUrl || '未设置（使用绝对路径）' }}</code>
        </div>

        <div class="variable-title">
          <span>环境变量</span>
          <b>{{ varEntries(env).length }}</b>
        </div>
        <div v-if="varEntries(env).length" class="var-list">
          <div v-for="[key, value] in varEntries(env).slice(0, 4)" :key="key" class="var-row">
            <code>{{ key }}</code>
            <span>{{ maskValue(key, value) }}</span>
          </div>
          <div v-if="varEntries(env).length > 4" class="var-more">
            +{{ varEntries(env).length - 4 }} 个变量
          </div>
        </div>
        <div v-else class="var-empty">尚未配置变量，可在编辑中添加。</div>

        <div class="env-foot">
          <el-button link size="small" @click="openEdit(env)">
            <el-icon><Edit /></el-icon>编辑
          </el-button>
          <el-button link type="danger" size="small" @click="removeEnv(env)">
            <el-icon><Delete /></el-icon>删除
          </el-button>
        </div>
      </article>

      <button class="new-env-card" type="button" @click="openCreate">
        <span class="new-env-icon"><el-icon><Plus /></el-icon></span>
        <b>添加环境</b>
        <p>例如预发布、灰度或本地调试环境</p>
      </button>
    </div>

    <EmptyState
      v-else-if="!loading"
      title="这个项目还没有环境"
      description="创建一个环境并配置 Base URL，用例才能知道要在哪个地址上执行。"
      icon="◇"
    >
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>
        新建环境
      </el-button>
    </EmptyState>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px" destroy-on-close>
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="环境名称" required>
            <el-input v-model="form.name" maxlength="120" placeholder="例如：本地开发 / 预发布" />
          </el-form-item>
          <el-form-item label="默认环境">
            <div class="default-switch">
              <el-switch v-model="form.defaultEnv" />
              <span>同项目只能有一个默认环境</span>
            </div>
          </el-form-item>
        </div>

        <el-form-item label="Base URL">
          <el-input v-model="form.baseUrl" placeholder="http://localhost:8080" />
          <div class="field-hint">相对路径会基于该地址解析；留空则步骤必须使用完整 URL。</div>
        </el-form-item>

        <div class="var-editor-head">
          <div>
            <b>环境变量</b>
            <span>变量名区分大小写，不要包含空格。</span>
          </div>
          <el-button size="small" @click="addVariable">
            <el-icon><Plus /></el-icon>
            添加变量
          </el-button>
        </div>

        <div class="var-editor">
          <div v-for="(pair, index) in form.variables" :key="index" class="var-editor-row">
            <el-input v-model="pair.key" size="small" placeholder="变量名，例如 demoUser" />
            <span class="var-equal">=</span>
            <el-input v-model="pair.value" size="small" placeholder="变量值" />
            <button type="button" class="var-remove" @click="removeVariable(index)">×</button>
          </div>
        </div>

        <div class="var-tip">
          <span>示例</span>
          <code>${demoUser}</code>
          <span>在用例步骤中使用，执行时会替换为变量值。</span>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ editing ? '保存修改' : '创建环境' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.env-info {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 17px 20px;
  border-radius: 15px;
  border: 1px solid #e5e4fb;
  background:
    radial-gradient(circle at 100% 0%, rgba(91, 91, 214, 0.08), transparent 40%),
    #fbfbff;
  margin-bottom: 18px;
}

.var-mark {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
  text-align: center;
}

.var-mark span {
  font-size: 15px;
}

.env-info-copy {
  flex: 1;
  min-width: 0;
}

.env-info-copy b {
  font-size: 11.5px;
}

.env-info-copy p {
  margin: 3px 0 0;
  color: #8b8e9f;
  font-size: 9.5px;
  line-height: 1.7;
}

.env-info-copy code {
  background: #efefff;
  color: var(--ft-primary);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 9px;
}

.demo-open {
  flex: 0 0 auto;
  border: 1px solid #e1e2ec;
  border-radius: 8px;
  background: #fff;
  color: #55596b;
  font-size: 9px;
  font-weight: 700;
  padding: 7px 10px;
  cursor: pointer;
}

.demo-open span {
  color: var(--ft-primary);
  margin-left: 3px;
}

.project-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border-radius: 6px;
  background: #f7f7fb;
  color: #8b8e9f;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.project-color {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}

.env-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
}

.env-card {
  display: flex;
  flex-direction: column;
  min-height: 258px;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid var(--ft-line);
  background: #fff;
  box-shadow: var(--ft-shadow-sm);
  transition: transform 0.18s, box-shadow 0.18s, border 0.18s;
}

.env-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 36px rgba(16, 17, 28, 0.07);
}

.env-card.default {
  border-color: #d7d7fa;
  background:
    radial-gradient(circle at 100% 0%, rgba(91, 91, 214, 0.055), transparent 40%),
    #fff;
}

.env-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.env-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #f3f3fb;
  color: #8b8e9f;
  font-size: 14px;
}

.env-icon.default {
  background: #efefff;
  color: var(--ft-primary);
}

.default-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 8px;
  font-weight: 800;
  color: var(--ft-primary);
  background: #efefff;
  border-radius: 5px;
  padding: 3px 6px;
}

.env-more {
  border: 0;
  background: none;
  color: #a0a3b1;
  font-size: 8.5px;
  cursor: pointer;
  padding: 3px 0;
}

.env-more:hover {
  color: var(--ft-primary);
}

.env-card h3 {
  margin: 14px 0 11px;
  font-size: 15px;
  letter-spacing: -0.02em;
}

.base-url {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 9px;
  border-radius: 7px;
  background: #fafafd;
  border: 1px solid #f0f1f6;
}

.base-url span {
  font-size: 7px;
  letter-spacing: 0.12em;
  font-weight: 800;
  color: #b0b3c1;
}

.base-url code {
  font-size: 8.5px;
  color: #6f7385;
  word-break: break-all;
}

.variable-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 13px;
  font-size: 8.5px;
  color: #9a9dae;
  font-weight: 700;
}

.variable-title b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #f5f5fa;
  color: #8b8e9f;
  font-size: 8px;
}

.var-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 7px;
}

.var-row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 8px;
}

.var-row code {
  flex: 0 0 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ft-primary);
}

.var-row span {
  color: #8b8e9f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.var-more {
  font-size: 8px;
  color: #a0a3b1;
}

.var-empty {
  margin-top: 7px;
  font-size: 8.5px;
  color: #b0b3c1;
}

.env-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: auto;
  padding-top: 13px;
  border-top: 1px dashed #eef0f5;
}

.env-foot :deep(.el-button) {
  padding: 2px 4px;
  font-size: 9.5px;
}

.new-env-card {
  min-height: 258px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: 1px dashed #d9dae6;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.55);
  color: #55596b;
  cursor: pointer;
  transition: border 0.18s, background 0.18s, transform 0.18s;
}

.new-env-card:hover {
  border-color: #bcbdf0;
  background: #fff;
  transform: translateY(-2px);
}

.new-env-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  margin-bottom: 10px;
}

.new-env-card b {
  font-size: 11.5px;
}

.new-env-card p {
  margin: 4px 0 0;
  color: #a0a3b1;
  font-size: 9px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 0 14px;
}

.default-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  color: #a0a3b1;
  font-size: 9px;
}

.field-hint {
  margin-top: 4px;
  font-size: 9px;
  color: #a0a3b1;
}

.var-editor-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin: 6px 0 9px;
}

.var-editor-head b {
  display: block;
  font-size: 11px;
}

.var-editor-head span {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: #a0a3b1;
}

.var-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.var-editor-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.var-editor-row :deep(.el-input) {
  flex: 1;
}

.var-equal {
  color: #b0b3c1;
  font-size: 11px;
}

.var-remove {
  flex: 0 0 23px;
  width: 23px;
  height: 23px;
  border: 1px solid #ececf4;
  border-radius: 6px;
  background: #fff;
  color: #b0b3c1;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.var-remove:hover {
  border-color: #fecaca;
  color: var(--ft-danger);
}

.var-tip {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 13px;
  font-size: 9px;
  color: #9a9dae;
}

.var-tip code {
  background: #f1f1ff;
  color: var(--ft-primary);
  border-radius: 4px;
  padding: 2px 5px;
}

@media (max-width: 1120px) {
  .env-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .env-grid {
    grid-template-columns: 1fr;
  }

  .env-info {
    flex-wrap: wrap;
  }

  .demo-open {
    margin-left: 56px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
