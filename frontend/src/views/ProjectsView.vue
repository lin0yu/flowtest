<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, FolderAdd, MoreFilled, Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { projectApi } from '@/api'
import { formatDate, timeAgo } from '@/utils/format'
import type { Project } from '@/types'

const router = useRouter()
const loading = ref(true)
const projects = ref<Project[]>([])
const dialogVisible = ref(false)
const saving = ref(false)
const editing = ref<Project | null>(null)
const form = reactive({
  name: '',
  key: '',
  description: '',
  color: '#6366f1'
})

const dialogTitle = computed(() => (editing.value ? '编辑项目' : '新建项目'))

async function load() {
  loading.value = true
  try {
    const { data } = await projectApi.list()
    projects.value = data
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  form.name = ''
  form.key = ''
  form.description = ''
  form.color = '#6366f1'
  dialogVisible.value = true
}

function openEdit(project: Project) {
  editing.value = project
  form.name = project.name
  form.key = project.key
  form.description = project.description || ''
  form.color = project.color || '#6366f1'
  dialogVisible.value = true
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      key: form.key.trim() || undefined,
      description: form.description.trim() || undefined,
      color: form.color
    }
    if (editing.value) {
      await projectApi.update(editing.value.id, payload)
      ElMessage.success('项目已更新')
    } else {
      await projectApi.create(payload)
      ElMessage.success('项目已创建，并自动生成默认环境')
    }
    dialogVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function remove(project: Project) {
  try {
    await ElMessageBox.confirm(
      `确定删除项目「${project.name}」吗？如果项目下仍有用例或任务，需要先清理。`,
      '删除项目',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await projectApi.remove(project.id)
  ElMessage.success('项目已删除')
  await load()
}

function openCases(project: Project) {
  router.push({ path: '/cases', query: { projectId: project.id } })
}

function projectInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase()
}

onMounted(load)
</script>

<template>
  <div class="page projects-page" v-loading="loading">
    <PageHeader
      title="项目空间"
      subtitle="用项目组织应用、环境、用例与调度任务，保持测试资产清晰可追溯。"
      eyebrow="WORKSPACE"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新建项目
        </el-button>
      </template>
    </PageHeader>

    <div v-if="projects.length" class="projects-grid">
      <article
        v-for="project in projects"
        :key="project.id"
        class="project-card"
        @click="openCases(project)"
      >
        <div class="project-top">
          <div
            class="project-mark"
            :style="{
              background: `linear-gradient(135deg, ${project.color}, ${project.color}cc)`,
              boxShadow: `0 10px 22px ${project.color}33`
            }"
          >
            {{ projectInitial(project.name) }}
          </div>
          <el-dropdown trigger="click" @click.stop>
            <button class="project-more" type="button" @click.stop>
              <el-icon><MoreFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="openEdit(project)">
                  <el-icon><Edit /></el-icon>编辑项目
                </el-dropdown-item>
                <el-dropdown-item divided @click="remove(project)">
                  <el-icon><Delete /></el-icon>删除项目
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div class="project-key">{{ project.key }}</div>
        <h3>{{ project.name }}</h3>
        <p class="project-desc">{{ project.description || '还没有项目描述。' }}</p>

        <div class="project-counts">
          <div>
            <b>{{ project.caseCount }}</b>
            <span>用例</span>
          </div>
          <div>
            <b>{{ project.envCount }}</b>
            <span>环境</span>
          </div>
          <div>
            <b>{{ project.taskCount }}</b>
            <span>任务</span>
          </div>
        </div>

        <div class="project-foot">
          <span>更新于 {{ timeAgo(project.updatedAt || project.createdAt) }}</span>
          <span class="project-link">进入项目 <span>→</span></span>
        </div>
      </article>

      <button class="new-project" type="button" @click="openCreate">
        <span class="new-project-icon"><el-icon><FolderAdd /></el-icon></span>
        <b>创建新项目</b>
        <p>为新的应用建立独立的测试空间</p>
      </button>
    </div>

    <EmptyState
      v-else-if="!loading"
      title="还没有项目"
      description="先创建一个项目，FlowTest 会自动为它生成默认环境。随后即可添加用例、编排任务。"
      icon="◫"
    >
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>
        新建第一个项目
      </el-button>
    </EmptyState>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px" destroy-on-close>
      <el-form label-position="top" @submit.prevent="save">
        <div class="form-row">
          <el-form-item label="项目名称" required>
            <el-input v-model="form.name" maxlength="120" placeholder="例如：FlowShop 演示项目" />
          </el-form-item>
          <el-form-item label="项目标识">
            <el-input v-model="form.key" maxlength="50" placeholder="FLOWSHOP" @input="form.key = form.key.toUpperCase()" />
          </el-form-item>
        </div>
        <el-form-item label="项目描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            resize="none"
            maxlength="1000"
            show-word-limit
            placeholder="这个项目负责哪些业务、覆盖哪些核心链路？"
          />
        </el-form-item>
        <el-form-item label="项目颜色">
          <div class="color-row">
            <el-color-picker v-model="form.color" />
            <span class="muted text-xs">用于项目卡片与图表标识</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ editing ? '保存修改' : '创建项目' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.projects-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.project-card {
  position: relative;
  background: #fff;
  border: 1px solid var(--ft-line);
  border-radius: 17px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
  box-shadow: var(--ft-shadow-sm);
  display: flex;
  flex-direction: column;
  min-height: 252px;
}

.project-card:hover {
  transform: translateY(-3px);
  border-color: #d8d9ea;
  box-shadow: 0 18px 40px rgba(16, 17, 28, 0.08);
}

.project-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.project-mark {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 17px;
  font-weight: 800;
}

.project-more {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #a3a6b6;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.project-more:hover {
  background: #f5f5fa;
  border-color: var(--ft-line);
  color: #55596b;
}

.project-key {
  margin-top: 16px;
  font-size: 8.5px;
  letter-spacing: 0.12em;
  font-weight: 800;
  color: #a4a7b7;
  font-family: "SFMono-Regular", Consolas, monospace;
}

.project-card h3 {
  margin: 4px 0 7px;
  font-size: 16px;
  letter-spacing: -0.02em;
}

.project-desc {
  margin: 0;
  color: var(--ft-muted);
  font-size: 10.5px;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 36px;
}

.project-counts {
  display: flex;
  gap: 24px;
  margin-top: 16px;
  padding: 12px 0;
  border-top: 1px dashed #eef0f5;
  border-bottom: 1px dashed #eef0f5;
}

.project-counts div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-counts b {
  font-size: 17px;
  letter-spacing: -0.03em;
}

.project-counts span {
  font-size: 9px;
  color: #9a9dae;
}

.project-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 13px;
  font-size: 9px;
  color: #a0a3b1;
}

.project-link {
  color: var(--ft-primary);
  font-weight: 700;
  white-space: nowrap;
}

.new-project {
  min-height: 252px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;
  border-radius: 17px;
  border: 1px dashed #d9dae6;
  background: rgba(255, 255, 255, 0.55);
  color: #55596b;
  cursor: pointer;
  transition: border 0.18s, background 0.18s, transform 0.18s;
}

.new-project:hover {
  border-color: #bcbdf0;
  background: #fff;
  transform: translateY(-2px);
}

.new-project-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #efefff;
  color: var(--ft-primary);
  font-size: 18px;
  margin-bottom: 12px;
}

.new-project b {
  font-size: 13px;
}

.new-project p {
  margin: 5px 0 0;
  color: #a0a3b1;
  font-size: 10px;
}

.form-row {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr;
  gap: 14px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

@media (max-width: 1120px) {
  .projects-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .projects-grid {
    grid-template-columns: 1fr;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
