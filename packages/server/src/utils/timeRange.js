'use strict'

/**
 * 时间段工具（排课冲突检测用）。
 */

/**
 * 判断两个时间段是否重叠 [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅
 * @param {Date|number|string} aStart
 * @param {Date|number|string} aEnd
 * @param {Date|number|string} bStart
 * @param {Date|number|string} bEnd
 * @returns {boolean}
 */
function overlaps(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart).getTime()
  const ae = new Date(aEnd).getTime()
  const bs = new Date(bStart).getTime()
  const be = new Date(bEnd).getTime()
  return as < be && bs < ae
}

module.exports = { overlaps }
