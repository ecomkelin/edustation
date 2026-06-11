/**
 * UniPush 推送模块封装（uni-app 内置 Push 模块）。
 *
 * 关键点（manifest.json 中必须开启 Push 模块，否则 iOS/Android 上架审核可能被拒）：
 *   - manifest.json -> app-plus.modules.Push.provider = "unipush"
 *   - manifest.json -> app-plus.distribute.sdkConfigs.push.unipush.{appid,appkey,appsecret}
 *     需在 DCloud 开发者中心开通 UniPush 后回填
 *
 * 客户端流程：
 *   1) 登录后调用 init()：获取 clientId（推送设备标识），上报到后端用于按家长推送
 *   2) 监听 click 事件：跳转到对应的课节/订单/作品详情
 *   3) 退出登录时清空本地 clientId 与后端绑定
 */

import { storage, StorageKeys } from './storage'

let inited = false
let listeners = []

function safeCall(fn, ...args) {
  try {
    if (typeof fn === 'function') return fn(...args)
  } catch (e) {
    console.warn('[push] callback error', e)
  }
  return undefined
}

/**
 * 检查当前平台是否支持 Push 模块（小程序/H5 走微信小程序自身订阅消息/App 原生推送）
 */
export function isPushSupported() {
  // #ifdef APP-PLUS
  return true
  // #endif
  // #ifdef MP-WEIXIN
  return typeof uni === 'undefined' ? false : !!uni.requestSubscribeMessage
  // #endif
  // #ifdef H5
  return false
  // #endif
  return false
}

/**
 * 初始化推送。在 App 启动时 + 登录成功后调用。
 * @param {object} opts
 * @param {(clientId: string) => void} opts.onClientId - 拿到 clientId 后的回调（用于上报后端）
 * @param {(payload: object) => void} opts.onMessage - 收到透传消息
 * @param {(payload: object) => void} opts.onClick - 点击推送
 */
export function initPush(opts = {}) {
  if (inited) return
  inited = true

  // #ifdef APP-PLUS
  try {
    const clientInfo = plus.push.getClientInfo()
    if (clientInfo && clientInfo.clientid) {
      storage.set(StorageKeys.PUSH_CLIENT_ID, clientInfo.clientid)
      safeCall(opts.onClientId, clientInfo.clientid)
    }
  } catch (e) {
    console.warn('[push] getClientInfo failed', e)
  }

  // 监听点击
  plus.push.addEventListener('click', (msg) => {
    safeCall(opts.onClick, msg && msg.payload ? JSON.parse(msg.payload) : msg)
  })
  // 监听透传
  plus.push.addEventListener('receive', (msg) => {
    safeCall(opts.onMessage, msg && msg.payload ? JSON.parse(msg.payload) : msg)
  })
  // #endif

  // #ifdef MP-WEIXIN
  // 小程序不通过 UniPush，而是用微信订阅消息；调用方在合适的时机弹窗
  listeners.push(opts)
  // #endif
}

/**
 * 主动向用户请求订阅消息（仅微信小程序）。
 * @param {string[]} tmplIds - 微信公众平台申请的订阅消息模板 id
 */
export function requestSubscribe(tmplIds = []) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve) => {
    if (!uni.requestSubscribeMessage) return resolve({})
    uni.requestSubscribeMessage({
      tmplIds,
      success: (res) => resolve(res || {}),
      fail: (err) => {
        console.warn('[push] subscribe fail', err)
        resolve({})
      }
    })
  })
  // #endif
  // #ifndef MP-WEIXIN
  return Promise.resolve({})
  // #endif
}

/**
 * 上报 clientId 给后端。
 * 业务方调用：登录成功后 / 切换孩子后。
 */
export async function reportClientIdToServer(clientId) {
  if (!clientId) return
  // 由调用方持有 access token 与 student 上下文，不在此硬依赖 store，
  // 避免循环依赖；调用方拿到 clientId 后自行 http.post('/users/me/push-client', { clientId })
  storage.set(StorageKeys.PUSH_CLIENT_ID, clientId)
}

/**
 * 清空本地的推送绑定（退出登录时）。
 */
export function clearPushBinding() {
  storage.remove(StorageKeys.PUSH_CLIENT_ID)
  inited = false
  listeners = []
}
