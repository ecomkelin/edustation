'use strict'

/**
 * 删除互锁（"无关联才能删"）统一工具。
 *
 * 设计目的：
 *  - 统一各 service.remove 中的 "countDocuments > 0 → 抛 unprocessable" 模式
 *  - service.remove 与 service.removableCheck 共享同一组互锁声明，单点维护
 *  - 错误响应里附带结构化 blockers，前端可以直接列表展示
 *
 * 单一职责：本工具只做"互锁检查 + 抛错/返回结果"，不校验身份/密码。
 * 身份/密码由 `requirePlatformPassword` 中间件把守。
 *
 * 互锁声明（Check）的形态：
 *   {
 *     model:    Mongoose Model（如 CourseInstance / StudentProduct ...）
 *     filter:   { <字段>: targetId, org?: orgId, ... }   // 直接拼到 countDocuments
 *     label:    '开班'                                    // 给前端展示的中文实体名
 *     hint:     '请先归档相关开班(软删)后再删'              // 给前端的可读操作建议
 *   }
 *
 * 用法（service.remove）：
 *
 *   const removable = require('@utils/removable')
 *   await removable.assertUnused(orgId, [
 *     { model: CourseInstance, filter: { courseProduct: id, org: orgId, deletedAt: null },
 *       label: '开班', hint: '请先归档相关开班(软删)后再删' },
 *     { model: StudentProduct, filter: { courseProduct: id, org: orgId },
 *       label: '学生课包', hint: '请先处理学生课包(转课/退费)后再删' }
 *   ])
 *   await doc.deleteOne()
 *
 * 用法（service.removableCheck 给 GET /:id/removable-check）：
 *
 *   return removable.check(orgId, [ ... 同一组 check ... ])
 *   // → { canRemove: boolean, blockers: [{ entity, label, count, hint }] }
 */

const ApiError = require('./ApiError')

/**
 * 把 mongoose model 名映射为"实体英文名"（给前端的 entity 字段用）。
 * 失败时回退到 model.modelName（mongoose 自动从文件名/Schema 推断）。
 */
function modelEntityName(model) {
  if (!model) return null
  // 优先用 model.collection.name（去掉 's' 即单数），例如 'course_instances' → 'course_instance'
  // 但前端的 entity 字段只是给日志/调试看的，对中文用户没差别，所以直接用 modelName
  return model.modelName || null
}

/**
 * 跑单个互锁检查。
 * @returns {Promise<{entity,label,count,hint}|null>} count=0 → null；>0 → blocker
 */
async function checkOne(check) {
  const { model, filter, label, hint } = check
  if (!model || !filter) {
    throw new Error('removable.checkOne: model 与 filter 必填')
  }
  const count = await model.countDocuments(filter)
  if (!count) return null
  return {
    entity: modelEntityName(model),
    label: label || model.modelName || '关联数据',
    count,
    hint: hint || '请先处理相关数据后再删'
  }
}

/**
 * 跑全部互锁检查，**不抛错**。返回结构化结果给 `GET /:id/removable-check` 使用。
 *
 * @param {string|null} orgId 当前机构 id（仅用于日志/调试；不参与查询）
 * @param {Array<Check>} checks
 * @returns {Promise<{canRemove: boolean, blockers: Array}>}
 */
async function check(orgId, checks) {
  const list = Array.isArray(checks) ? checks : []
  if (list.length === 0) {
    return { canRemove: true, blockers: [] }
  }
  const results = await Promise.all(list.map(checkOne))
  const blockers = results.filter(Boolean)
  return { canRemove: blockers.length === 0, blockers }
}

/**
 * 跑全部互锁检查，**遇到任意一个 count>0 就抛错**。
 *
 * 错误形态：422 unprocessable + 顶层 message = blockers[0].label + count + hint；
 * 完整 blockers 列表塞到 data 字段，前端可以原样渲染。
 *
 * @param {string|null} orgId
 * @param {Array<Check>} checks
 * @throws {ApiError} 422
 */
async function assertUnused(orgId, checks) {
  const list = Array.isArray(checks) ? checks : []
  if (list.length === 0) return
  const results = await Promise.all(list.map(checkOne))
  const blockers = results.filter(Boolean)
  if (blockers.length > 0) {
    // 主消息取第一个 blocker 摘要；多 blocker 时把全部列表塞 data
    const first = blockers[0]
    throw ApiError.unprocessable(
      `${first.label}仍被 ${first.count} 条数据引用（${first.hint}）`,
      { blockers }
    )
  }
}

/* ─── 2026-06-22 pet-system-v2-ext 重构：全局（去 org 维度）互锁 ─── */
/**
 * checkGlobal / assertUnusedGlobal：用于 platform-level 实体（无 org 维度）的互锁检查。
 *
 * 与 check / assertUnused 的区别：
 *   - 调用形态完全一致（同样接收 checks 数组）
 *   - 仅签名去掉 orgId（参数保留为空位以兼容现有调用，但不再使用）
 *   - 实现复用 checkOne，无 orgId 注入逻辑
 *
 * 用例：PetSpecies / PetItem / PetConsumable（2026-06-22 改造后为平台级共享）。
 */
async function checkGlobal(checks) {
  return check(null, checks)
}

async function assertUnusedGlobal(checks) {
  return assertUnused(null, checks)
}

module.exports = { checkOne, check, assertUnused, checkGlobal, assertUnusedGlobal }
