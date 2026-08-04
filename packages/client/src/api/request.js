/**
 * 统一 HTTP 请求 - 含 401 自动 refresh
 *
 * 设计:
 *  - accessToken 走 uni.storage,refreshToken 完全由后端通过 httpOnly cookie 管理
 *  - withCredentials:true 让 cookie 自动随 request 带上 (uni.request 原生支持)
 *  - 401 时自动调 /auth/refresh 一次,失败则清空登录态并跳登录
 *  - 错误响应统一抛出 ApiError,业务层 try/catch 处理
 */
import { storage, StorageKeys } from '@/utils/storage'

// #ifdef H5
const BASE_URL = '/api/v1' // H5 走 vite proxy (vite.config.js server.proxy '/api' -> VITE_PROXY_TARGET)
// #endif
// #ifndef H5
// 小程序 / App 无 dev proxy, 必须用完整 URL 直连后端
// 注意: uni-app 不识别 Vite 风格的 import.meta.env.VITE_*, 编译后会变量丢失变 {},
//      fallback 到 localhost → 微信开发者工具模拟器走 localhost 不通 → 网络错误.
// 调试微信小程序: 直接改下面的 DEV_API_HOST 为本机局域网 IP (后端监听 0.0.0.0 才行);
// 真机预览也是同一个 IP (手机和电脑必须同 WiFi).
// 部署时改用 manifest.json / 环境变量注入或运行时配置.
// eslint-disable-next-line no-undef
const DEV_API_HOST = 'http://192.168.1.8:3000'
const BASE_URL = `${DEV_API_HOST}/api/v1`
// #endif

/** 自定义错误类型 */
export class ApiError extends Error {
  constructor(message, code, statusCode, data) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
    this.data = data
  }
}

/** 业务码映射 - 常见 http 状态 */
const ERROR_MESSAGES = {
  400: '请求有误',
  401: '请先登录',
  403: '没有权限',
  404: '资源不存在',
  409: '数据冲突',
  422: '操作无法完成',
  429: '操作太频繁,稍后再试',
  500: '服务器开小差了',
  502: '网关无响应',
  503: '服务暂不可用',
  504: '请求超时'
}

/**
 * 构造请求头
 */
function buildHeaders(opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.header || {})
  }
  const auth = storage.get(StorageKeys.AUTH)
  if (auth && auth.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`
  }
  const orgId = storage.get(StorageKeys.ORG_ID)
  if (orgId) {
    headers['x-org-id'] = orgId
  }
  const studentId = storage.get(StorageKeys.ACTIVE_STUDENT)
  if (studentId && !opts.skipActiveStudent) {
    headers['x-active-student-id'] = studentId
  }
  return headers
}

/** refresh 状态:防止并发刷新 */
let _refreshing = null

/**
 * 触发 refresh
 * - 并发合并:多个 401 只调一次 /auth/refresh
 * - 失败 -> 清空 auth + 跳转登录
 */
async function doRefresh() {
  if (_refreshing) return _refreshing
  _refreshing = (async () => {
    try {
      let res
      // #ifdef H5
      // H5: refresh token 走 httpOnly cookie (后端 setRefreshCookie 自动带)
      res = await uni.request({
        url: `${BASE_URL}/auth/refresh`,
        method: 'POST',
        withCredentials: true,
        header: { 'Content-Type': 'application/json' }
      })
      // #endif
      // #ifndef H5
      // 小程序/App: cookie 不可用, 从 storage 读 refreshToken 走 body
      const rt = storage.get(StorageKeys.WX_REFRESH_TOKEN)
      if (!rt) throw new Error('no refresh token')
      res = await uni.request({
        url: `${BASE_URL}/auth/wx-refresh`,
        method: 'POST',
        data: { refreshToken: rt },
        header: { 'Content-Type': 'application/json' }
      })
      // #endif
      if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.success) {
        const data = res.data.data
        const auth = storage.get(StorageKeys.AUTH) || {}
        auth.accessToken = data.accessToken
        storage.set(StorageKeys.AUTH, auth)
        // #ifndef H5
        // 小程序: 新 refreshToken 覆盖存 (H5 由 cookie 自动更新)
        if (data.refreshToken) storage.set(StorageKeys.WX_REFRESH_TOKEN, data.refreshToken)
        // #endif
        return data.accessToken
      }
      throw new Error('refresh failed')
    } catch (e) {
      // 清空 + 跳登录
      storage.remove(StorageKeys.AUTH)
      storage.remove(StorageKeys.ORG_ID)
      storage.remove(StorageKeys.ACTIVE_STUDENT)
      // #ifdef H5
      const path = window.location.pathname
      if (!path.startsWith('/pages/auth/')) {
        uni.reLaunch({ url: '/pages/auth/login' })
      }
      // #endif
      // #ifndef H5
      // 小程序无 window.location, 用 getCurrentPages 判当前页避免重复跳转
      const pages = getCurrentPages()
      const cur = pages[pages.length - 1]
      const curRoute = cur ? `/${cur.route}` : ''
      if (!curRoute.startsWith('/pages/auth/')) {
        uni.reLaunch({ url: '/pages/auth/login' })
      }
      // #endif
      throw e
    } finally {
      _refreshing = null
    }
  })()
  return _refreshing
}

/**
 * 核心请求函数
 * @param {string} url - 接口路径,不含 /api/v1 前缀
 * @param {Object} opts - { method, data, header, skipAuthRedirect, _retried, ... }
 * @returns {Promise<{ data, statusCode, header }>} - 返回的 data 已是业务层 data (与后端响应一致)
 */
export async function request(url, opts = {}) {
  let fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`
  const method = (opts.method || 'GET').toUpperCase()

  // 2026-07-05 修: uni.request 对 GET 请求的 data 字段不会自动转 querystring,
  // 手动拼接 (axios 会自动处理, 但 uni.request 不会, 是 v3.x 已知行为).
  // 现象: http.get('/points/me', { data: { student: 'xxx' } }) → 实际发请求 URL 不带 query string,
  //        后端 req.query.student = undefined → fallback 到 req.activeStudentId → 返回错的 kid 数据.
  // 修法: 在 request 层统一转, 所有 GET API 都受益 (之前 order/list / pointsApi / agent 等 GET 接口
  //       的过滤参数 page/student/status 等全都失效).
  if (method === 'GET' && opts.data && typeof opts.data === 'object') {
    const qs = Object.entries(opts.data)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&')
    if (qs) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs
    }
  }

  try {
    const res = await uni.request({
      url: fullUrl,
      method,
      data: opts.data,
      header: buildHeaders(opts),
      withCredentials: true,
      timeout: opts.timeout || 15000
    })

    const statusCode = res.statusCode || 0
    // iOS Safari / 某些 H5 环境 res.data 可能是字符串,统一 parse 成对象
    let body = res.data
    if (typeof body === 'string') {
      try { body = JSON.parse(body) } catch (_) { body = {} }
    }
    body = body || {}

    // HTTP 200 但 success=false
    if (statusCode >= 200 && statusCode < 300) {
      if (body.success === false) {
        throw new ApiError(body.message || '业务失败', body.code, statusCode, body.data)
      }
      return body.data || {}
    }

    // 401 触发 refresh (排除登录/refresh 本身)
    if (statusCode === 401 && !opts._retried && !opts.skipRefresh && !url.includes('/auth/')) {
      try {
        await doRefresh()
        return request(url, { ...opts, _retried: true })
      } catch (_) {
        throw new ApiError('登录已过期,请重新登录', 401, 401, null)
      }
    }

    const defaultMsg = ERROR_MESSAGES[statusCode] || `请求失败 (${statusCode})`
    throw new ApiError(body.message || defaultMsg, body.code, statusCode, body.data)
  } catch (e) {
    if (e instanceof ApiError) throw e
    // 网络异常 (uni.request fail 时 statusCode 为 0)
    if (e.statusCode === 0 || e.errMsg) {
      throw new ApiError('网络好像去捉迷藏了,请检查连接', 0, 0, null)
    }
    throw e
  }
}

/** 便捷方法 */
export const http = {
  get: (url, opts = {}) => request(url, { ...opts, method: 'GET' }),
  post: (url, data, opts = {}) => request(url, { ...opts, method: 'POST', data }),
  put: (url, data, opts = {}) => request(url, { ...opts, method: 'PUT', data }),
  patch: (url, data, opts = {}) => request(url, { ...opts, method: 'PATCH', data }),
  delete: (url, data, opts = {}) => request(url, { ...opts, method: 'DELETE', data })
}

/** 文件上传 (multipart/form-data) */
export async function upload(url, filePath, formData = {}, opts = {}) {
  const auth = storage.get(StorageKeys.AUTH)
  const headers = {}
  if (auth && auth.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`
  }
  const orgId = storage.get(StorageKeys.ORG_ID)
  if (orgId) headers['x-org-id'] = orgId

  try {
    const res = await uni.uploadFile({
      url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
      filePath,
      name: opts.name || 'file',
      formData,
      header: headers
    })
    // uni.uploadFile 返回的 data 是 string,需 parse
    let body
    try {
      body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    } catch (_) {
      body = res.data
    }
    if (res.statusCode >= 200 && res.statusCode < 300 && body && body.success) {
      return body.data || {}
    }
    throw new ApiError(body.message || '上传失败', body.code, res.statusCode, body.data)
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError('上传失败,请检查网络', 0, 0, null)
  }
}

/** 文件下载 */
export async function download(url, opts = {}) {
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.tempFilePath)
        } else {
          reject(new ApiError('下载失败', res.statusCode, res.statusCode))
        }
      },
      fail: (err) => reject(new ApiError(err.errMsg || '下载失败', 0, 0))
    })
  })
}

export default request