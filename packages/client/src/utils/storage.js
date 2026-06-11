/**
 * 跨平台 storage 封装。
 * 优先用 uni.getStorageSync（小程序/App/H5 都支持），无存储时回退到 localStorage（H5）。
 */

const memoryStorage = new Map()

function hasUniStorage() {
  // #ifdef H5
  // H5 也支持 uni storage，保留 fallback
  return typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function'
  // #endif
  // #ifndef H5
  return typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function'
  // #endif
}

export const storage = {
  get(key, fallback = null) {
    try {
      if (hasUniStorage()) {
        const v = uni.getStorageSync(key)
        if (v === '' || v === undefined || v === null) return fallback
        return v
      }
      const v = memoryStorage.get(key)
      return v === undefined ? fallback : v
    } catch (_) {
      return fallback
    }
  },
  set(key, value) {
    try {
      if (hasUniStorage()) {
        uni.setStorageSync(key, value)
        return
      }
      memoryStorage.set(key, value)
    } catch (_) {
      memoryStorage.set(key, value)
    }
  },
  remove(key) {
    try {
      if (hasUniStorage()) {
        uni.removeStorageSync(key)
        return
      }
      memoryStorage.delete(key)
    } catch (_) {
      memoryStorage.delete(key)
    }
  },
  clear() {
    try {
      if (hasUniStorage()) {
        uni.clearStorageSync()
        return
      }
      memoryStorage.clear()
    } catch (_) {
      memoryStorage.clear()
    }
  }
}

export const StorageKeys = Object.freeze({
  AUTH: 'edustation_client_auth',
  ACTIVE_STUDENT: 'edustation_client_active_student',
  ORG_ID: 'edustation_client_org_id',
  PUSH_CLIENT_ID: 'edustation_client_push_client_id'
})
