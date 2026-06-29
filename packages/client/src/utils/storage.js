/**
 * 存储工具 - 包装 uni.storage
 * - 仅存 accessToken + 当前孩子 + 当前机构 (不存 refresh)
 * - 自动 JSON parse / stringify
 */

export const StorageKeys = {
  AUTH: 'auth',
  ORG_ID: 'current_org_id',
  ACTIVE_STUDENT: 'active_student_id',
  // 临时
  CAPTCHA_PASS: 'captcha_pass',
  CHAT_DRAFT: 'chat_draft'
}

export const storage = {
  get(key) {
    try {
      const v = uni.getStorageSync(key)
      if (v == null || v === '') return null
      try {
        return JSON.parse(v)
      } catch (_) {
        return v
      }
    } catch (_) {
      return null
    }
  },

  set(key, value) {
    try {
      uni.setStorageSync(key, typeof value === 'string' ? value : JSON.stringify(value))
    } catch (e) {
      console.warn('[storage.set]', key, e)
    }
  },

  remove(key) {
    try {
      uni.removeStorageSync(key)
    } catch (e) {
      console.warn('[storage.remove]', key, e)
    }
  },

  clear() {
    try {
      uni.clearStorageSync()
    } catch (e) {
      console.warn('[storage.clear]', e)
    }
  }
}