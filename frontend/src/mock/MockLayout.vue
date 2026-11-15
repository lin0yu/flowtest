<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { mockLogout, mockStore } from './store'

const route = useRoute()
const router = useRouter()

const menus = [
  { path: '/mock/dashboard', label: '工作台', icon: 'Odometer' },
  { path: '/mock/tasks', label: '测试任务', icon: 'Document' },
  { path: '/mock/projects', label: '项目管理', icon: 'FolderOpened' },
  { path: '/mock/settings', label: '系统设置', icon: 'Setting' }
]

const activeMenu = computed(() => route.path)

function onSelect(index: string) {
  router.push(index)
}

function logout() {
  mockLogout()
  router.push('/mock/login')
}
</script>

<template>
  <el-container class="mock-shell">
    <el-aside width="208px" class="mock-aside">
      <div class="brand">
        <span class="mark">R</span>
        <div>
          <b>Radiotech</b>
          <span>辐射认证管理平台</span>
        </div>
      </div>
      <el-menu :default-active="activeMenu" @select="onSelect">
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
          <span>{{ m.label }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="mock-header">
        <div class="crumb">
          <span>Radiotech</span>
          <span class="sep">/</span>
          <b>{{ (route.meta.title as string) || '页面' }}</b>
        </div>
        <div class="right">
          <el-tag type="success" effect="plain">测试环境</el-tag>
          <el-dropdown>
            <span class="user">
              <el-avatar :size="26">{{ mockStore.user?.username?.slice(0, 1) || 'U' }}</el-avatar>
              {{ mockStore.user?.username || '未登录' }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="mock-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.mock-shell { min-height: 100vh; background: #f4f6fb; }
.mock-aside { background: #171b3a; color: #c8c9d8; }
.brand { display: flex; align-items: center; gap: 10px; padding: 18px 16px 14px; }
.brand .mark { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, #6366f1, #4338ca); display: grid; place-items: center; color: #fff; font-weight: 700; }
.brand b { display: block; color: #fff; font-size: 15px; }
.brand span { font-size: 11px; color: #8a8fb5; }
.mock-aside :deep(.el-menu) { background: transparent; border-right: none; }
.mock-aside :deep(.el-menu-item) { color: #aeb3d4; }
.mock-aside :deep(.el-menu-item.is-active) { background: rgba(99, 102, 241, .22); color: #fff; }
.mock-header { display: flex; align-items: center; justify-content: space-between; background: #fff; border-bottom: 1px solid #e8ebf3; }
.crumb { font-size: 13px; color: #8a90a6; }
.crumb .sep { margin: 0 6px; }
.crumb b { color: #14172a; }
.right { display: flex; align-items: center; gap: 14px; }
.user { display: flex; align-items: center; gap: 7px; font-size: 13px; color: #4a5068; cursor: pointer; }
.mock-main { padding: 20px 24px; }
</style>
