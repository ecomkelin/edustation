/**
 * 客户端请求封装。
 *
 * 关键设计：
 *  - 基础路径 /api/v1；
 *  - 自动注入 Authorization / x-org-id / x-active-student-id 三个头；
 *  - 401 自动尝试 refresh：refresh 走 httpOnly cookie（uni.request 默认带 cookie）；
 *  - 同一个 401 触发一次 refresh，其它并发请求进入队列，refresh 成功后逐个用新 token 重放；
 *  - refresh 失败/或本身在 refresh 接口上 401 -> 清登录态、跳到登录页；
 *  - 业务失败 { success: false, message } 通过 reject 抛出，UI 层用 uni.showToast。
 *
 * 与 admin/src/api/http.js 的核心区别：
 *  - 不依赖 axios、不依赖 pinia，store 通过调用方传入或使用 storage 同步读；
 *  - 适配 uni-app 的 uni.request，而非 axios；
 *  - 在 H5 上：uni.request 是 XMLHttpRequest 包装，cookie 行为一致；
 *  - 在小程序/App 上：cookie 由运行时管理（App 端未自带 httpOnly，可走 uni.setStorage 做 refresh 兜底）。
 */

import { storage, StorageKeys } from './storage'
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'

// BASE_URL：uni-app 编译期按平台二选一
//   - H5：相对路径，由 vite dev server 代理到 server（同源，无 CORS，cookie 自动带）
//   - 小程序 / App：必须用绝对地址直连 server
// #ifdef H5
const BASE_URL = '/api/v1'
// #endif
// #ifndef H5
const BASE_URL = 'http://localhost:3000/api/v1'
// #endif

const TIMEOUT = 15000

// 不参与 refresh 的端点
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login']
function shouldSkipRefresh(url = '') {
  return NO_REFRESH_PATHS.some((p) => url.includes(p))
}

let isRefreshing = false
let pendingQueue = []

function flushQueue(error, token = null) {
  pendingQueue.forEach(({ resolve, reject, config }) => {
    if (error) {
      reject(error)
    } else {
      config.header = config.header || {}
      config.header.Authorization = `Bearer ${token}`
      resolve(uniRequest(config))
    }
  })
  pendingQueue = []
}

function buildHeader() {
  const auth = useAuthStore()
  const student = useStudentStore()
  const header = {}
  if (auth.accessToken) header.Authorization = `Bearer ${auth.accessToken}`
  const orgId = storage.get(StorageKeys.ORG_ID)
  if (orgId) header['x-org-id'] = orgId
  if (student.activeStudentId) header['x-active-student-id'] = student.activeStudentId
  return header
}

/**
 * 底层 uni.request 包装：统一返回 Promise，body 已经是 JSON 解析后。
 */
function uniRequest({ url, method, data, header, timeout }) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + url,
      method,
      data,
      header: header || {},
      timeout: timeout || TIMEOUT,
      // 重要：让 httpOnly cookie 能透传
      withCredentials: true,
      success: (res) => resolve(res),
      fail: (err) => reject(err)
    })
  })
}

/**
 * 业务错误对象
 */
export class ApiError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.data = data
  }
}

/**
 * 主请求方法。
 * - 自动注入鉴权头；
 * - 401 触发 refresh + 重放；
 * - 业务失败抛出 ApiError。
 */
export function request(method, url, data, options = {}) {
  const { silent, header: extraHeader, timeout } = options
  const config = {
    url,
    method,
    data,
    header: { ...buildHeader(), ...(extraHeader || {}) },
    timeout
  }
  return doRequest(config, silent).catch((err) => {
    if (!silent && err && err.message) {
      // 顶层默认 toast；调用方可传 silent:true 自行处理
      uni.showToast({ title: err.message, icon: 'none', duration: 2200 })
    }
    throw err
  })
}

async function doRequest(config, silent) {
  try {
    const res = await uniRequest(config)
    const status = res.statusCode
    const body = res.data

    if (status >= 200 && status < 300) {
      // 业务 { success, data, message }
      if (body && body.success === false) {
        const err = new ApiError(body.message || '请求失败', {
          status,
          code: body.code,
          data: body.data
        })
        if (!silent) throw err
        throw err
      }
      // 直接返回 { data, success } 给调用方
      return body && 'data' in body ? body : { data: body, success: true }
    }

    if (status === 401 && !config._retry && !shouldSkipRefresh(config.url)) {
      const auth = useAuthStore()
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject, config: { ...config, _retry: true } })
        })
      }
      config._retry = true
      isRefreshing = true
      try {
        const refreshed = await auth.refresh()
        flushQueue(null, refreshed.accessToken)
        config.header.Authorization = `Bearer ${refreshed.accessToken}`
        return doRequest(config, silent)
      } catch (e) {
        flushQueue(e)
        auth.clear()
        // 跳登录页
        const pages = getCurrentPages()
        if (pages.length === 0 || !pages[pages.length - 1].route.includes('auth/login')) {
          uni.reLaunch({ url: '/pages/auth/login' })
        }
        throw e
      } finally {
        isRefreshing = false
      }
    }

    // 其它 HTTP 错误
    const msg = (body && body.message) || `请求失败 ${status}`
    const err = new ApiError(msg, { status, data: body })
    if (!silent) throw err
    throw err
  } catch (err) {
    if (err && err.errMsg && !err.status) {
      // uni.request fail
      throw new ApiError('网络异常', { status: 0, data: err })
    }
    throw err
  }
}

// 便捷方法
export const http = {
  get: (url, params, options) => {
    if (params && typeof params === 'object') {
      const qs = buildQueryString(params)
      url = qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url
    }
    return request('GET', url, undefined, options)
  },
  post: (url, data, options) => request('POST', url, data, options),
  put: (url, data, options) => request('PUT', url, data, options),
  delete: (url, data, options) => request('DELETE', url, data, options),
  upload: (url, filePath, formData = {}, options = {}) => {
    // 走 uni.uploadFile，Content-Type 由 uni 自动处理为 multipart/form-data
    return new Promise((resolve, reject) => {
      const header = { ...buildHeader(), ...(options.header || {}) }
      uni.uploadFile({
        url: BASE_URL + url,
        filePath,
        name: options.name || 'file',
        formData,
        header,
        success: (res) => {
          try {
            const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body && 'data' in body ? body : { data: body, success: true })
            } else {
              reject(new ApiError((body && body.message) || `上传失败 ${res.statusCode}`, { status: res.statusCode, data: body }))
            }
          } catch (e) {
            reject(new ApiError('响应解析失败', { status: res.statusCode, data: res.data }))
          }
        },
        fail: (err) => reject(new ApiError('上传失败', { status: 0, data: err }))
      })
    })
  }
}

function buildQueryString(params) {
  const parts = []
  Object.keys(params || {}).forEach((k) => {
    const v = params[k]
    if (v === undefined || v === null || v === '') return
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  })
  return parts.join('&')
}

export default http
