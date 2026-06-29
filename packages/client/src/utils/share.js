/**
 * 分享工具 - 海报生成 + 复制链接
 * H5: 走 canvas + clipboard
 * 微信小程序: 走 onShareAppMessage
 * App: 走 uni.share
 */

/** 复制到剪贴板 */
export async function copyText(text) {
  // #ifdef H5
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (_) {
    // fallback
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch (_) {
      ok = false
    }
    document.body.removeChild(el)
    return ok
  }
  // #endif
  // #ifndef H5
  return new Promise((resolve) => {
    uni.setClipboardData({
      data: text,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
  // #endif
}

/**
 * 生成邀请链接 - 当前阶段 stub (后端 share_earn trigger 未实装)
 */
export function makeInviteLink(userId, orgId) {
  const base = 'https://h5.example.com/invite'
  return `${base}?u=${userId}&o=${orgId}`
}

/**
 * 数字滚动动画 - requestAnimationFrame 实现 (用于积分变化)
 * @param {Object} opts - { from, to, duration, onUpdate, onComplete }
 */
export function animateNumber(opts) {
  const { from = 0, to, duration = 800, onUpdate, onComplete } = opts
  if (typeof to !== 'number') {
    onUpdate && onUpdate(from)
    onComplete && onComplete()
    return
  }
  const start = Date.now()
  const diff = to - from
  const tick = () => {
    const elapsed = Date.now() - start
    const progress = Math.min(1, elapsed / duration)
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3)
    const current = Math.round(from + diff * eased)
    onUpdate && onUpdate(current)
    if (progress < 1) {
      // #ifdef H5
      requestAnimationFrame(tick)
      // #endif
      // #ifndef H5
      setTimeout(tick, 16)
      // #endif
    } else {
      onComplete && onComplete()
    }
  }
  tick()
}

/**
 * 简易 debounce
 */
export function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

/**
 * 简易 throttle
 */
export function throttle(fn, gap = 300) {
  let last = 0
  return function (...args) {
    const now = Date.now()
    if (now - last >= gap) {
      last = now
      fn.apply(this, args)
    }
  }
}

/**
 * 防重复点击 - 用于按钮
 */
let _lastClick = 0
export function preventRepeatClick(delay = 600) {
  return new Promise((resolve) => {
    const now = Date.now()
    if (now - _lastClick < delay) {
      resolve(false)
    } else {
      _lastClick = now
      resolve(true)
    }
  })
}