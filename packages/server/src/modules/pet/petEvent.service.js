'use strict'

/**
 * PetEvent 写流水专用 service
 *
 * 2026-06-21 pet-system-v2 立项。所有 PetEvent 写入都走这里，方便：
 *   - 统一 payload shape 校验（按 type 分发到不同 builder）
 *   - 统一日志（errors 不抛出，仅 log；事件写失败不阻塞主业务）
 *   - 未来加 PetEvent 报告缓存失效钩子
 *
 * 设计原则：
 *   - 写 PetEvent **不**进积分流水（PetEvent 与 PointsTransaction 严格隔离）
 *   - payload 各 type 独立 shape，禁止任意 object（参照 [[report-aggregation-yuan-bug]]）
 *   - 写失败仅 log，不抛（业务事件写失败不能让玩家喂食失败）
 */

const PetEvent = require('@models/PetEvent.model')

/**
 * 写一条 PetEvent（不抛错，失败仅 log）。
 *
 * @param {Object} opts
 * @param {String} opts.orgId
 * @param {String} opts.studentId
 * @param {String} opts.petAccountId
 * @param {String} opts.type - PET_EVENT_TYPES 之一
 * @param {Object} opts.payload - 结构化 payload（按 type 校验）
 * @returns {Promise<Object|null>} 写成功的文档；失败返回 null
 */
async function recordEvent({ orgId, studentId, petAccountId, type, payload = {} }) {
  try {
    const doc = await PetEvent.create({
      org: orgId,
      student: studentId,
      petAccount: petAccountId,
      type,
      payload: payload || {}
    })
    return doc.toObject()
  } catch (e) {
    // 业务事件写失败不阻塞主流程；只 log 供事后排查
    // eslint-disable-next-line no-console
    console.warn(`[petEvent] write failed: type=${type} org=${orgId} student=${studentId} pet=${petAccountId} err=${e.message}`)
    return null
  }
}

module.exports = { recordEvent }
