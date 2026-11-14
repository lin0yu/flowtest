import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

const http = axios.create({
  baseURL: '/api',
  timeout: 180000
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('ft_token')
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const message = error.response?.data?.message || error.message || '请求失败'
    if (status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('ft_token')
      localStorage.removeItem('ft_user')
      location.href = '/login'
    }
    if (!(error.config as any)?.silent) {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  }
)

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function authToken(): string {
  return localStorage.getItem('ft_token') || ''
}

export function artifactViewUrl(runId: number, artifactId: number): string {
  return `/api/runs/${runId}/artifacts/${artifactId}/view?token=${encodeURIComponent(authToken())}`
}

export function runStreamUrl(runId: number): string {
  return `/api/runs/${runId}/stream?token=${encodeURIComponent(authToken())}`
}

export function getBlob(url: string, config?: AxiosRequestConfig): Promise<Blob> {
  return http.get(url, { ...config, responseType: 'blob' }).then((res) => res.data as Blob)
}

export default http
