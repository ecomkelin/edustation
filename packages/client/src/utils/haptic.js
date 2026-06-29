/**
 * 触感反馈 - 包装 uni.vibrateShort
 * 跨端:H5 走 navigator.vibrate(15),其他 uni API
 */
export const haptic = {
  /** 轻触 - 列表点击 */
  tap() {
    this._vibrate(10)
  },
  /** 中等 - 按钮点击 */
  press() {
    this._vibrate(15)
  },
  /** 成功 */
  success() {
    this._vibrate([10, 50, 20])
  },
  /** 警告 */
  warn() {
    this._vibrate([20, 80, 20])
  },
  /** 错误 */
  error() {
    this._vibrate([30, 60, 30, 60, 30])
  },
  /** 破壳等特殊场景 */
  burst() {
    this._vibrate([50, 30, 50, 30, 100])
  },
  _vibrate(pattern) {
    try {
      // #ifdef H5
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern)
        return
      }
      // #endif
      // #ifdef APP-PLUS || MP-WEIXIN
      if (typeof uni !== 'undefined' && uni.vibrateShort) {
        uni.vibrateShort({ type: 'medium' })
      }
      // #endif
    } catch (_) {
      // ignore
    }
  }
}

export default haptic