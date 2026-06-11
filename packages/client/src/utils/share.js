/**
 * 分享工具：
 *  - uni-app 内置 share API（小程序/朋友圈）；
 *  - 微信小程序场景：onShareAppMessage / onShareTimeline 在 page 级别声明；
 *  - 阶段 2 实现：统一 share 工具 + 上报 /points/earn(type=share)；
 *  - 阶段 3 后服务端真实落账（此阶段 /points/earn 是 stub）。
 */

import { pointsApi } from '@/api/points'

/**
 * 在小程序/H5/App 中触发"分享给好友"。
 * 由调用方传入自定义的 title/path/imageUrl。
 */
export function shareToWeixin({ title = 'EduStation', path = '/pages/tabbar/home', imageUrl = '' } = {}) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve) => {
    uni.showShareMenu({ withShareTicket: true, success: () => resolve(true), fail: () => resolve(false) })
  })
  // #endif
  // #ifndef MP-WEIXIN
  return Promise.resolve(false)
  // #endif
}

/**
 * 分享成功回调后通知后端。
 * 服务端在 /points/earn(type=share,refId) 中加积分（stub 阶段不入账）。
 */
export async function reportShareSuccess({ scene = 'weixin', refId = '' } = {}) {
  try {
    const res = await pointsApi.earn({
      amount: 10,
      type: 'share',
      refId,
      remark: `分享给好友(${scene})`
    })
    return res.data
  } catch (e) {
    console.warn('[share] report fail', e)
    return null
  }
}

/**
 * 通过剪贴板复制带追踪参数的邀请链接（拼团/邀请码场景备用）。
 * @param {string} base - 业务链接
 * @param {string} trackId - 追踪 id
 */
export async function copyInviteLink(base, trackId) {
  const url = `${base}${base.includes('?') ? '&' : '?'}track=${trackId}`
  // #ifdef H5
  return new Promise((resolve) => {
    try {
      navigator.clipboard.writeText(url).then(() => resolve(true)).catch(() => resolve(false))
    } catch (_) {
      resolve(false)
    }
  })
  // #endif
  // #ifndef H5
  return new Promise((resolve) => {
    uni.setClipboardData({ data: url, success: () => resolve(true), fail: () => resolve(false) })
  })
  // #endif
}
