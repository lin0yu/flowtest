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
      path: '/mock/login',
      name: 'mock-login',
      component: () => import('@/mock/MockLoginView.vue'),
      meta: { public: true, title: 'Radiotech 登录' }
    },
    {
      path: '/mock/reset',
      name: 'mock-reset',
      component: () => import('@/mock/MockResetView.vue'),
      meta: { public: true, title: '重置演示数据' }
    },
    {
      path: '/mock',
      component: () => import('@/mock/MockLayout.vue'),
      children: [
        { path: '', redirect: '/mock/dashboard' },
        { path: 'dashboard', name: 'mock-dashboard', component: () => import('@/mock/MockDashboardView.vue'), meta: { public: true, title: '工作台' } },
        { path: 'tasks', name: 'mock-tasks', component: () => import('@/mock/MockTasksView.vue'), meta: { public: true, title: '测试任务' } },
        { path: 'tasks/:id', name: 'mock-task-detail', component: () => import('@/mock/MockTaskDetailView.vue'), meta: { public: true, title: '任务详情' } },
        { path: 'projects', name: 'mock-projects', component: () => import('@/mock/MockDashboardView.vue'), meta: { public: true, title: '项目管理' } },
        { path: 'settings', name: 'mock-settings', component: () => import('@/mock/MockDashboardView.vue'), meta: { public: true, title: '系统设置' } }
      ]
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
  if (to.path.startsWith('/mock') && to.path !== '/mock/login' && to.path !== '/mock/reset') {
    if (!localStorage.getItem('flowtest_mock_token')) {
      return { path: '/mock/login' }
    }
  }
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
