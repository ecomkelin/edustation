import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  timeout: 15000,
  // axios 默认把数组 params 序列化为 ?k[]=v, 加上自定义 serializer 强制数组 join(',')
  // 双保险: 即使上面的 request interceptor 因为某些原因没跑, 序列化阶段也会兜底
  paramsSerializer: {
    serialize: (params) => {
      if (!params || typeof params !== 'object') return ''
      const parts = []
      for (const [k, v] of Object.entries(params)) {
        if (v == null || v === '') continue
        if (Array.isArray(v)) {
          const joined = v.filter((x) => x !== '' && x != null).join(',')
          if (joined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(joined)}`)
        } else {
          parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        }
      }
      return parts.join('&')
    }
  }
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
  // 防止 axios 把数组参数序列化成 ?k[]=v (Express 会解析成 array, 后端 .isString() 校验失败)
  // 统一把 params 里的数组 join(',') 转成字符串; URLSearchParams / 后端逗号分隔都兼容
  if (config.params && typeof config.params === 'object') {
    const normalized = {}
    for (const [k, v] of Object.entries(config.params)) {
      if (Array.isArray(v)) {
        normalized[k] = v.filter((x) => x !== '' && x != null).join(',')
      } else {
        normalized[k] = v
      }
    }
    config.params = normalized
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
// config.silent = true 时不弹错误 toast（用于"非关键路径"的下拉/预加载；调用方自己处理）
// 例外: /auth/login 自身的 401 永远要 toast(凭证错 / 账号状态错),其他 401 仍走静默重定向
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && body.success === false) {
      if (!response.config || !response.config.silent) {
        ElMessage.error(body.message || '请求失败')
      }
      // 关键:必须 reject 一个 axios 形态的 error,这样 catch 端的
      // err.response.data.data.blockers 才能取到;否则 422 互锁挡板无法弹出。
      const fakeErr = new Error(body.message || '请求失败')
      fakeErr.name = 'ApiError'
      fakeErr.response = response
      fakeErr.config = response.config
      fakeErr.isAxiosError = true
      return Promise.reject(fakeErr)
    }
    return body
  },
  async (error) => {
    const { response, config } = error
    if (!response) {
      ElMessage.error('网络异常')
      return Promise.reject(error)
    }

    // 登录接口自身的 401 永远走 toast 通道(后端 4 种文案已分桶,前端直接弹给用户)
    if (response.status === 401 && shouldSkipRefresh(config.url)) {
      const message = response.data && response.data.message ? response.data.message : '登录失败'
      if (!(config && config.silent)) ElMessage.error(message)
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
    if (response.status !== 401 && !(config && config.silent)) ElMessage.error(message)
    return Promise.reject(error)
  }
)

export default apiClient
