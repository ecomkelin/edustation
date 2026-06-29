/**
 * Toast - uni.showToast 包装 (统一时长/图标)
 */
const DEFAULTS = {
  duration: 1800,
  icon: 'none'
}

const styles = {
  // 仿原生 toast 但用暖橙色
  base: {
    background: 'rgba(45, 24, 16, 0.86)',
    color: '#FFFAF5',
    borderRadius: '999rpx',
    padding: '18rpx 32rpx',
    fontSize: '28rpx'
  }
}

export const toast = {
  text(text, opts = {}) {
    uni.showToast({ ...DEFAULTS, ...opts, title: text, icon: 'none' })
  },

  success(text = '操作成功', opts = {}) {
    uni.showToast({ ...DEFAULTS, ...opts, title: text, icon: 'success' })
  },

  error(text = '操作失败', opts = {}) {
    uni.showToast({ ...DEFAULTS, ...opts, title: text, icon: 'error' })
  },

  warn(text, opts = {}) {
    uni.showToast({ ...DEFAULTS, ...opts, title: text, icon: 'none' })
  },

  loading(text = '加载中...', opts = {}) {
    uni.showLoading({ ...DEFAULTS, ...opts, title: text })
  },

  hideLoading() {
    uni.hideLoading()
  },

  /** 隐藏原生 toast */
  hide() {
    uni.hideToast()
  }
}

export default toast