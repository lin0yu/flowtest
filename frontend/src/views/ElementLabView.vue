<script setup lang="ts">
// Element Plus 组件实验页：用于验证 CLI 对 Element Plus 各类组件的定位与操作能力
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const stage = ref('')
const date = ref('')
const amount = ref(1)
const enabled = ref(false)
const gender = ref('male')
const agreed = ref(false)
const rate = ref(0)
const dialogVisible = ref(false)
const drawerVisible = ref(false)
const uploaded = ref('')
const apiResult = ref('')
const edited = ref('')

const rows = ref([
  { id: 1, name: '张三', stage: '样机阶段', status: '已审核' },
  { id: 2, name: '李四', stage: '设计阶段', status: '待审核' },
  { id: 3, name: '王五', stage: '量产阶段', status: '已驳回' }
])

const stages = ['样机阶段', '设计阶段', '量产阶段']

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    uploaded.value = file.name
    ElMessage.success('上传成功：' + file.name)
  }
}

async function callApi() {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  })
  const data = await res.json()
  apiResult.value = `接口调用成功，状态码 ${res.status}，用户 ${data.user?.username}`
}
</script>

<template>
  <div class="lab">
    <h1>Element Plus 组件实验页</h1>
    <p class="hint">用于验证 FlowTest NL 对 Element Plus 组件的定位与操作</p>

    <section class="row">
      <el-select v-model="stage" class="stage-select" placeholder="请选择阶段">
        <el-option v-for="s in stages" :key="s" :label="s" :value="s" />
      </el-select>
      <span class="echo">当前阶段：{{ stage || '未选择' }}</span>
    </section>

    <section class="row">
      <el-date-picker v-model="date" class="date-picker" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" />
      <span class="echo">当前日期：{{ date || '未选择' }}</span>
    </section>

    <section class="row">
      <el-dropdown class="more-menu" trigger="hover">
        <span class="trigger">更多操作</span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="ElMessage.success('批量操作已执行')">批量操作</el-dropdown-item>
            <el-dropdown-item @click="ElMessage.success('导出报表已生成')">导出报表</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <span class="echo">悬停后应出现下拉菜单</span>
    </section>

    <section class="row">
      <el-button type="primary" @click="ElMessage.success('新增成功')">触发提示</el-button>
      <el-button @click="dialogVisible = true">打开弹窗</el-button>
      <el-button @click="drawerVisible = true">打开抽屉</el-button>
      <el-button @click="callApi">调用登录接口</el-button>
      <span class="echo">{{ apiResult }}</span>
    </section>

    <section class="row">
      <el-input-number v-model="amount" class="amount-input" :min="1" :max="10" />
      <el-switch v-model="enabled" class="enable-switch" />
      <el-radio-group v-model="gender">
        <el-radio value="male">男</el-radio>
        <el-radio value="female">女</el-radio>
      </el-radio-group>
      <el-checkbox v-model="agreed">我已阅读</el-checkbox>
      <el-rate v-model="rate" class="rate-box" />
      <span class="echo">数量 {{ amount }} / 开关 {{ enabled }} / 性别 {{ gender }} / 同意 {{ agreed }} / 评分 {{ rate }}</span>
    </section>

    <section class="row">
      <el-upload
        class="dragger-upload"
        drag
        action="#"
        :auto-upload="false"
        :show-file-list="true"
        @drop="onDrop"
        @change="(file) => { uploaded = file.name; ElMessage.success('上传成功：' + file.name) }"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
      </el-upload>
      <span class="echo">{{ uploaded ? '已上传：' + uploaded : '拖拽上传区' }}</span>
    </section>

    <section class="table-wrap">
      <el-table :data="rows" border>
        <el-table-column prop="name" label="任务名称" width="140" />
        <el-table-column prop="stage" label="测试型号" width="120" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column label="操作" width="160">
          <template #default="scope">
            <el-button size="small" @click="edited = `编辑 ${scope.row.name}`">编辑</el-button>
            <el-button size="small" type="danger" @click="edited = `删除 ${scope.row.name}`">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <span class="echo">{{ edited }}</span>
    </section>

    <el-dialog v-model="dialogVisible" title="新增任务" width="420px">
      <el-form label-width="70px">
        <el-form-item label="任务名称">
          <el-input placeholder="请输入任务名称" />
        </el-form-item>
        <el-form-item label="测试型号">
          <el-input placeholder="请输入测试型号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="dialogVisible = false; ElMessage.success('新增成功')">确定</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="drawerVisible" title="任务详情" size="360px">
      <p>抽屉内容：这是新增任务的详情面板。</p>
    </el-drawer>
  </div>
</template>

<style scoped>
.lab { padding: 28px 32px; font-family: -apple-system, "PingFang SC", sans-serif; color: #14172a; }
h1 { margin: 0 0 4px; font-size: 22px; }
.hint { color: #6d7288; margin: 0 0 20px; font-size: 13px; }
section { margin-bottom: 20px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.echo { color: #6d7288; font-size: 13px; }
.table-wrap { width: 100%; }
</style>
