<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { resetMockData } from './store'

const router = useRouter()

onMounted(() => {
  resetMockData()
  router.replace('/mock/login')
})
</script>

<template>
  <div class="reset-page">正在重置演示数据…</div>
</template>

<style scoped>
.reset-page { padding: 40px; color: #6d7288; font-size: 13px; }
</style>
