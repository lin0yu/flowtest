<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { findTask } from './store'

const route = useRoute()
const router = useRouter()
const task = computed(() => findTask(Number(route.params.id)))

const rows = computed(() => {
  const t = task.value
  if (!t) return []
  return [
    { label: '任务名称', value: t.name },
    { label: '测试型号', value: t.model },
    { label: '样机阶段', value: t.stage },
    { label: '认证类型', value: t.certType },
    { label: '截止日期', value: t.deadline },
    { label: '当前状态', value: t.status },
    { label: '测试文件', value: t.fileName || '（无）' },
    { label: '备注', value: t.remark || '（无）' },
    { label: '创建时间', value: t.createdAt }
  ]
})
</script>

<template>
  <div class="detail">
    <el-page-header content="任务详情" @back="router.push('/mock/tasks')">
      <template #extra>
        <el-button type="primary" @click="router.push('/mock/tasks')">返回列表</el-button>
      </template>
    </el-page-header>

    <el-card shadow="never" class="info">
      <el-descriptions v-if="task" :column="2" border>
        <el-descriptions-item v-for="r in rows" :key="r.label" :label="r.label">
          {{ r.value }}
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else description="任务不存在" />
    </el-card>
  </div>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; gap: 14px; }
</style>
