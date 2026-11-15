<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addTask, mockStore, removeTask, updateTask } from './store'

const router = useRouter()

const keyword = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = 5

const statuses = ['待审核', '已审核', '已驳回']
const stages = ['样机阶段', '设计阶段', '量产阶段']
const certTypes = ['型号核准', '技术审查', '型式核准']

const dialogVisible = ref(false)
const dialogTitle = ref('新增任务')
const editingId = ref<number | null>(null)
const form = reactive({
  name: '', model: '', stage: '', certType: '', deadline: '',
  remark: '', fileName: ''
})

const filtered = computed(() => {
  return mockStore.tasks.filter((t) => {
    const kw = keyword.value.trim()
    const hitKw = !kw || t.name.includes(kw) || t.model.includes(kw)
    const hitStatus = !statusFilter.value || t.status === statusFilter.value
    return hitKw && hitStatus
  })
})

const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

function resetForm() {
  editingId.value = null
  Object.assign(form, { name: '', model: '', stage: '', certType: '', deadline: '', remark: '', fileName: '' })
}

function openCreate() {
  resetForm()
  dialogTitle.value = '新增任务'
  dialogVisible.value = true
}

function openEdit(row: (typeof mockStore.tasks)[number]) {
  editingId.value = row.id
  dialogTitle.value = `编辑任务 · ${row.name}`
  Object.assign(form, {
    name: row.name, model: row.model, stage: row.stage, certType: row.certType,
    deadline: row.deadline, remark: row.remark, fileName: row.fileName
  })
  dialogVisible.value = true
}

function submit() {
  if (!form.name.trim()) {
    ElMessage.error('请填写任务名称')
    return
  }
  if (editingId.value) {
    updateTask(editingId.value, { ...form })
    ElMessage.success('保存成功')
  } else {
    addTask({ ...form })
    ElMessage.success('新增成功')
  }
  dialogVisible.value = false
  page.value = 1
}

function remove(row: (typeof mockStore.tasks)[number]) {
  ElMessageBox.confirm(`确认删除任务「${row.name}」？`, '删除确认', { type: 'warning' })
    .then(() => {
      removeTask(row.id)
      ElMessage.success('删除成功')
    })
    .catch(() => {})
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div>
        <h2>测试任务</h2>
        <p>管理辐射认证测试任务，覆盖创建、审核与交付全流程</p>
      </div>
      <el-button type="primary" class="create-btn" @click="openCreate">新增任务</el-button>
    </div>

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input v-model="keyword" class="kw-input" placeholder="请输入任务名称或型号" clearable />
        <el-select v-model="statusFilter" class="status-select" placeholder="全部状态" clearable>
          <el-option v-for="s in statuses" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button type="primary" plain>查询</el-button>
        <el-button>重置</el-button>
        <span class="count">共 {{ filtered.length }} 条任务</span>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table :data="paged" border class="task-table">
        <el-table-column type="index" label="#" width="52" />
        <el-table-column prop="name" label="任务名称" min-width="170" />
        <el-table-column prop="model" label="测试型号" width="130" />
        <el-table-column prop="stage" label="样机阶段" width="100" />
        <el-table-column prop="certType" label="认证类型" width="110" />
        <el-table-column prop="deadline" label="截止日期" width="115" />
        <el-table-column prop="status" label="状态" width="95">
          <template #default="scope">
            <el-tag :type="scope.row.status === '已审核' ? 'success' : scope.row.status === '已驳回' ? 'danger' : 'warning'" effect="light">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="165" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="router.push(`/mock/tasks/${scope.row.id}`)">查看</el-button>
            <el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button>
            <el-button link type="danger" @click="remove(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="filtered.length"
          layout="total, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px" destroy-on-close>
      <el-form label-width="92px">
        <el-form-item label="任务名称">
          <el-input v-model="form.name" placeholder="请输入任务名称" />
        </el-form-item>
        <el-form-item label="测试型号">
          <el-input v-model="form.model" placeholder="请输入测试型号" />
        </el-form-item>
        <el-form-item label="样机阶段">
          <el-select v-model="form.stage" class="form-select stage-select" placeholder="请选择样机阶段">
            <el-option v-for="s in stages" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="认证类型">
          <el-select v-model="form.certType" class="form-select cert-select" placeholder="请选择认证类型">
            <el-option v-for="c in certTypes" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="截止日期">
          <el-date-picker v-model="form.deadline" class="form-select deadline-picker" type="date" value-format="YYYY-MM-DD" placeholder="请选择截止日期" />
        </el-form-item>
        <el-form-item label="测试文件">
          <el-upload drag action="#" :auto-upload="false" :show-file-list="true" :limit="1"
            @change="(file: any) => { form.fileName = file.name }">
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
          </el-upload>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" class="submit-btn" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.head h2 { margin: 0 0 4px; font-size: 20px; color: #14172a; }
.head p { margin: 0; color: #7b8199; font-size: 13px; }
.filter-card { margin-bottom: 14px; }
.filter-row { display: flex; align-items: center; gap: 12px; }
.kw-input { width: 260px; }
.status-select { width: 170px; }
.count { color: #8a90a6; font-size: 13px; margin-left: auto; }
.pager { margin-top: 14px; display: flex; justify-content: flex-end; }
.form-select { width: 100%; }
</style>
