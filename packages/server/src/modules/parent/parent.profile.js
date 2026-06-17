'use strict'

/**
 * 家长沟通画像 (2026-06-16 重构, 挂在 Parent 上)
 *
 * 关键变化 (vs 2026-06 初版):
 *   - 从 UserOrgRel 搬到 Parent
 *   - 不再需要 user 绑定, 潜客阶段 (parent.user=null) 就能写
 *   - 跨机构隔离: Parent 自身有 `org: required, indexed`, 天然按机构隔离
 *   - 1 家长 1 机构 ≤ 1 份画像 (Parent 按 (org, phone) 唯一)
 *
 * 字段:
 *   - commStyle  沟通偏好
 *   - familyBg   家庭背景
 *   - childFocus 孩子关注
 *   - followUp   跟进备忘
 *
 * 边界:
 *   - parentId 不存在 → 404
 *   - parent.org !== orgId → 403 (跨机构)
 *   - getProfile: 字段空 → 返回 EMPTY_PROFILE (前端据此判断"还没填")
 *   - setProfile: 不再有 "未绑定账号" 守卫
 */

const Parent = require('@models/Parent.model')
const ApiError = require('@utils/ApiError')

const EMPTY_PROFILE = {
  commStyle: '',
  familyBg: '',
  childFocus: '',
  followUp: '',
  lastUpdatedBy: null,
  lastUpdatedAt: null
}

/**
 * 把 Parent 文档拍平为 profile 响应对象.
 * @param {Object|null} parent
 * @returns {Object}
 */
function shapeProfile(parent) {
  if (!parent) return { ...EMPTY_PROFILE }
  return {
    commStyle: parent.commStyle || '',
    familyBg: parent.familyBg || '',
    childFocus: parent.childFocus || '',
    followUp: parent.followUp || '',
    lastUpdatedBy: parent.profileLastUpdatedBy
      ? {
          id: String(parent.profileLastUpdatedBy._id || parent.profileLastUpdatedBy.id),
          realName: parent.profileLastUpdatedBy.realName
        }
      : null,
    lastUpdatedAt: parent.profileLastUpdatedAt || null
  }
}

/**
 * 拿指定 parent 在当前机构下的画像.
 * @param {string} parentId
 * @param {string} orgId
 */
async function getProfile(parentId, orgId) {
  const parent = await Parent.findById(parentId)
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  if (!parent) throw ApiError.notFound('家长不存在')
  if (String(parent.org) !== String(orgId)) {
    throw ApiError.forbidden('该家长不属于当前机构')
  }
  return shapeProfile(parent)
}

/**
 * 写家长画像. 任何阶段的 parent 都能写 (潜客 / 已转化).
 * @param {string} parentId
 * @param {string} orgId
 * @param {{commStyle?, familyBg?, childFocus?, followUp?}} body
 * @param {{id: string}} currentUser
 */
async function setProfile(parentId, orgId, body, currentUser) {
  const parent = await Parent.findById(parentId)
  if (!parent) throw ApiError.notFound('家长不存在')
  if (String(parent.org) !== String(orgId)) {
    throw ApiError.forbidden('该家长不属于当前机构')
  }
  // 白名单: 只更新这 4 个字段, 不让前端覆盖 user/org/lifecycle 等
  if (body.commStyle !== undefined) parent.commStyle = body.commStyle || ''
  if (body.familyBg !== undefined) parent.familyBg = body.familyBg || ''
  if (body.childFocus !== undefined) parent.childFocus = body.childFocus || ''
  if (body.followUp !== undefined) parent.followUp = body.followUp || ''
  parent.profileLastUpdatedBy = currentUser.id
  parent.profileLastUpdatedAt = new Date()
  await parent.save()
  // 重新拉一遍拿到 populate 后的 lastUpdatedBy
  const fresh = await Parent.findById(parent._id)
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  return shapeProfile(fresh)
}

module.exports = { getProfile, setProfile, shapeProfile, EMPTY_PROFILE }
