<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { mockStore } from './store'

const route = useRoute()
const router = useRouter()

const stats = computed(() => {
  const total = mockStore.tasks.length
  const pending = mockStore.tasks.filter((t) => t.status === '待审核').length
  const approved = mockStore.tasks.filter((t) => t.status === '已审核').length
  const rejected = mockStore.tasks.filter((t) => t.status === '已驳回').length
  return [
    { label: '任务总数', value: total, color: '#4f46e5' },
    { label: '待审核', value: pending, color: '#d97706' },
    { label: '已审核', value: approved, color: '#12805c' },
    { label: '已驳回', value: rejected, color: '#b42318' }
  ]
})
</script>

<template>
  <div class="dash">
    <div class="head">
      <h2>工作台</h2>
      <p>欢迎回来，{{ mockStore.user?.username || 'admin' }}，这里是你的辐射认证任务概览</p>
    </div>

    <div class="stat-grid">
      <el-card v-for="s in stats" :key="s.label" shadow="never" class="stat">
        <div class="k">{{ s.label }}</div>
        <div class="v" :style="{ color: s.color }">{{ s.value }}</div>
      </el-card>
    </div>

    <el-card shadow="never" class="recent">
      <template #header><span>最近任务</span></template>
      <el-table :data="mockStore.tasks.slice(0, 5)" border>
        <el-table-column prop="name" label="任务名称" />
        <el-table-column prop="stage" label="样机阶段" width="120" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column label="操作" width="110">
          <template #default="scope">
            <el-button link type="primary" @click="router.push(`/mock/tasks/${scope.row.id}`)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.head { margin-bottom: 16px; }
.head h2 { margin: 0 0 4px; font-size: 20px; color: #14172a; }
.head p { margin: 0; color: #7b8199; font-size: 13px; }
.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
.stat .k { color: #8a90a6; font-size: 12px; }
.stat .v { font-size: 26px; font-weight: 700; margin-top: 4px; }
</style>
