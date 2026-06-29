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

const BASE_URL = '/api/v1'

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
      const res = await uni.request({
        url: `${BASE_URL}/auth/refresh`,
        method: 'POST',
        withCredentials: true,
        header: { 'Content-Type': 'application/json' }
      })
      if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.success) {
        const auth = storage.get(StorageKeys.AUTH) || {}
        auth.accessToken = res.data.data.accessToken
        storage.set(StorageKeys.AUTH, auth)
        return res.data.data.accessToken
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
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`
  const method = (opts.method || 'GET').toUpperCase()

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