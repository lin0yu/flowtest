import { defineStore } from 'pinia'
import { authApi } from '@/api'
import type { User } from '@/types'

function readUser(): User | null {
  try {
    const raw = localStorage.getItem('ft_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('ft_token') || '',
    user: readUser() as User | null
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    displayName: (state) => state.user?.displayName || state.user?.username || '访客',
    initials: (state) => {
      const name = state.user?.displayName || state.user?.username || 'F'
      return name.slice(0, 1).toUpperCase()
    }
  },
  actions: {
    async login(username: string, password: string) {
      const { data } = await authApi.login({ username, password })
      this.token = data.token
      this.user = data.user
      localStorage.setItem('ft_token', data.token)
      localStorage.setItem('ft_user', JSON.stringify(data.user))
    },
    async fetchMe() {
      if (!this.token) return
      try {
        const { data } = await authApi.me()
        this.user = data
        localStorage.setItem('ft_user', JSON.stringify(data))
      } catch {
        // 401 由拦截器统一处理
      }
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('ft_token')
      localStorage.removeItem('ft_user')
    }
  }
})
