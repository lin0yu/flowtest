<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  Connection,
  Document,
  FolderOpened,
  Key,
  MagicStick,
  Menu,
  Monitor,
  Odometer,
  Timer,
  VideoPlay
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { systemApi } from '@/api'
import type { SystemStatus } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const mobileOpen = ref(false)
const status = ref<SystemStatus | null>(null)
let statusTimer: number | undefined

const groups = [
  {
    label: '工作区',
    items: [
      { path: '/dashboard', label: '工作台', icon: Odometer },
      { path: '/projects', label: '项目空间', icon: FolderOpened },
      { path: '/cases', label: '测试用例', icon: Document }
    ]
  },
  {
    label: '自动化',
    items: [
      { path: '/studio', label: 'AI 用例工坊', icon: MagicStick, badge: 'AI' },
      { path: '/tasks', label: '任务调度', icon: Timer },
      { path: '/runs', label: '执行记录', icon: VideoPlay }
    ]
  },
  {
    label: '系统',
    items: [
      { path: '/environments', label: '环境配置', icon: Connection },
      { path: '/settings', label: '系统设置', icon: Key }
    ]
  }
]

const title = computed(() => String(route.meta.title || '工作台'))
const section = computed(() => String(route.meta.section || 'FlowTest'))
const roleLabel = computed(() => (auth.user?.role === 'ADMIN' ? '管理员' : auth.user?.role || '成员'))

function isActive(path: string) {
  if (path === '/dashboard') return route.path === '/dashboard'
  return route.path === path || route.path.startsWith(`${path}/`)
}

function navigate(path: string) {
  mobileOpen.value = false
  router.push(path)
}

function openDemo() {
  window.open('/demo/index.html', '_blank')
}

function onUserCommand(command: string) {
  if (command === 'settings') router.push('/settings')
  if (command === 'logout') {
    auth.logout()
    router.push('/login')
  }
}

async function loadStatus() {
  try {
    const { data } = await systemApi.status()
    status.value = data
  } catch {
    // 未登录或后端不可达时保持静默，由拦截器提示
  }
}

onMounted(() => {
  if (auth.isLoggedIn && !auth.user) auth.fetchMe()
  loadStatus()
  statusTimer = window.setInterval(loadStatus, 30000)
})

onUnmounted(() => {
  if (statusTimer) window.clearInterval(statusTimer)
})
</script>

<template>
  <div class="ft-shell">
    <aside class="ft-sidebar">
      <div class="ft-brand">
        <div class="ft-brand-mark">F</div>
        <div class="ft-brand-name">
          <b>FlowTest</b>
          <span>灵测 · AUTOMATION</span>
        </div>
      </div>

      <nav class="ft-nav">
        <div v-for="group in groups" :key="group.label" class="ft-nav-group">
          <div class="ft-nav-label">{{ group.label }}</div>
          <a
            v-for="item in group.items"
            :key="item.path"
            class="ft-nav-link"
            :class="{ active: isActive(item.path) }"
            href="javascript:void(0)"
            @click="navigate(item.path)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
            <span v-if="item.badge" class="ft-nav-badge">{{ item.badge }}</span>
          </a>
        </div>
      </nav>

      <div class="ft-sidebar-foot">
        <div class="ft-engine-row">
          <span class="ft-engine-dot" :class="{ ok: status?.engineReady }" />
          <span>{{ status ? (status.engineReady ? '执行引擎就绪' : '引擎未就绪') : '正在检测引擎…' }}</span>
        </div>
        <div class="ft-engine-sub">
          {{ status?.browserVersion || 'Google Chrome' }}<br />
          最大并发 {{ status?.maxParallel ?? 3 }} · v{{ status?.version || '1.0.0' }}
        </div>
      </div>
    </aside>

    <div class="ft-main">
      <header class="ft-topbar">
        <div class="ft-topbar-left">
          <el-button class="ft-mobile-menu" text circle @click="mobileOpen = true">
            <el-icon :size="18"><Menu /></el-icon>
          </el-button>
          <div class="ft-breadcrumb">
            <span>{{ section }}</span>
            <span class="sep">/</span>
            <b>{{ title }}</b>
          </div>
        </div>

        <div class="ft-topbar-right">
          <button class="ft-engine-chip" type="button" @click="router.push('/settings')">
            <span class="dot" :class="{ ok: status?.engineReady }" />
            {{ status?.engineReady ? 'Chrome 在线' : '引擎检查中' }}
          </button>
          <el-button text @click="openDemo">
            <el-icon><Monitor /></el-icon>
            <span class="demo-label">演示站点</span>
          </el-button>
          <el-dropdown trigger="click" @command="onUserCommand">
            <button class="ft-user-button" type="button">
              <span class="ft-avatar">{{ auth.initials }}</span>
              <span class="ft-user-name">
                <b>{{ auth.displayName }}</b>
                <span>{{ roleLabel }}</span>
              </span>
              <el-icon :size="12" class="muted-2"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="settings">系统设置</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="ft-content">
        <router-view />
      </main>
    </div>

    <el-drawer v-model="mobileOpen" direction="ltr" size="272px" :with-header="false" class="mobile-drawer">
      <div class="mobile-nav-inner">
        <div class="ft-brand">
          <div class="ft-brand-mark">F</div>
          <div class="ft-brand-name">
            <b>FlowTest</b>
            <span>灵测 · AUTOMATION</span>
          </div>
        </div>
        <div v-for="group in groups" :key="group.label" class="ft-nav-group">
          <div class="ft-nav-label">{{ group.label }}</div>
          <a
            v-for="item in group.items"
            :key="item.path"
            class="ft-nav-link"
            :class="{ active: isActive(item.path) }"
            href="javascript:void(0)"
            @click="navigate(item.path)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </a>
        </div>
        <div class="ft-sidebar-foot">
          <div class="ft-engine-row">
            <span class="ft-engine-dot" :class="{ ok: status?.engineReady }" />
            <span>{{ status?.engineReady ? '执行引擎就绪' : '引擎未就绪' }}</span>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.demo-label {
  font-size: 11.5px;
}

:global(.mobile-drawer .el-drawer__body) {
  padding: 0;
  background: #10111c;
}

.mobile-nav-inner {
  min-height: 100%;
  padding: 20px 16px;
  color: #c8c9d8;
}
</style>
