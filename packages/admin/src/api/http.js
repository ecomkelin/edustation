import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  timeout: 15000
})

// 请求拦截：自动注入 Authorization + x-org-id
apiClient.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  if (auth.currentOrgId) {
    config.headers['x-org-id'] = auth.currentOrgId
  }
  if (auth.activeStudentId) {
    config.headers['x-active-student-id'] = auth.activeStudentId
  }
  return config
})

// 标记是否正在 refresh
let isRefreshing = false
let pendingQueue = []

function flushQueue(error, token = null) {
  pendingQueue.forEach(({ resolve, reject, config }) => {
    if (error) {
      reject(error)
    } else {
      config.headers.Authorization = `Bearer ${token}`
      resolve(apiClient(config))
    }
  })
  pendingQueue = []
}

// 不参与 refresh 的端点：refresh 自身、login（未登录就 401 没意义再 refresh）
// /auth/me、/auth/logout 需要保留触发 refresh 的能力
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login']
function shouldSkipRefresh(url = '') {
  return NO_REFRESH_PATHS.some((p) => url.includes(p))
}

// 响应拦截：401 自动 refresh；业务失败弹 ElMessage
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && body.success === false) {
      ElMessage.error(body.message || '请求失败')
      return Promise.reject(body)
    }
    return body
  },
  async (error) => {
    const { response, config } = error
    if (!response) {
      ElMessage.error('网络异常')
      return Promise.reject(error)
    }

    if (response.status === 401 && !config._retry && !shouldSkipRefresh(config.url)) {
      const auth = useAuthStore()

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject, config: { ...config, _retry: true } })
        })
      }

      config._retry = true
      isRefreshing = true
      try {
        // refresh token 走 httpOnly cookie，能不能续是由后端判定，前端不预判
        const refreshed = await auth.refresh()
        flushQueue(null, refreshed.accessToken)
        config.headers.Authorization = `Bearer ${refreshed.accessToken}`
        return apiClient(config)
      } catch (e) {
        flushQueue(e)
        auth.clear()
        router.replace('/login')
        return Promise.reject(e)
      } finally {
        isRefreshing = false
      }
    }

    const message = response.data && response.data.message ? response.data.message : `请求失败 ${response.status}`
    if (response.status !== 401) ElMessage.error(message)
    return Promise.reject(error)
  }
)

export default apiClient
