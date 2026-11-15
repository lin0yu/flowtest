import { createRouter, createWebHistory } from 'vue-router'
import pinia from '@/stores'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: '登录' }
    },
    {
      path: '/element-lab',
      name: 'element-lab',
      component: () => import('@/views/ElementLabView.vue'),
      meta: { public: true, title: 'Element Plus 组件实验页' }
    },
    {
      path: '/',
      component: () => import('@/layout/AppLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '工作台', section: 'Overview' }
        },
        {
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/ProjectsView.vue'),
          meta: { title: '项目空间', section: 'Workspace' }
        },
        {
          path: 'cases',
          name: 'cases',
          component: () => import('@/views/CasesView.vue'),
          meta: { title: '测试用例', section: 'Workspace' }
        },
        {
          path: 'studio',
          name: 'studio',
          component: () => import('@/views/StudioView.vue'),
          meta: { title: 'AI 用例工坊', section: 'Automation' }
        },
        {
          path: 'tasks',
          name: 'tasks',
          component: () => import('@/views/TasksView.vue'),
          meta: { title: '任务调度', section: 'Automation' }
        },
        {
          path: 'runs',
          name: 'runs',
          component: () => import('@/views/RunsView.vue'),
          meta: { title: '执行记录', section: 'Automation' }
        },
        {
          path: 'runs/:id',
          name: 'run-detail',
          component: () => import('@/views/RunDetailView.vue'),
          meta: { title: '执行报告', section: 'Automation' }
        },
        {
          path: 'environments',
          name: 'environments',
          component: () => import('@/views/EnvironmentsView.vue'),
          meta: { title: '环境配置', section: 'Workspace' }
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: '系统设置', section: 'Settings' }
        }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore(pinia)
  if (!to.meta.public && !auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/login' && auth.isLoggedIn) {
    return '/dashboard'
  }
  document.title = `${to.meta.title || 'FlowTest'} · FlowTest 灵测`
  return true
})

export default router
