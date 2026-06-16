'use strict'

/**
 * 家长沟通画像 (2026-06 新增)
 *
 * 业务: 挂在 UserOrgRel 上, 按 (user, org) 天然隔离. 跨机构独立维护.
 *   - A 机构对某家长写'高敏感型'; B 机构对该家长一无所知 —— 业务上正确
 *   - 唯一索引 (user, org) 已经在 UserOrgRel model 声明, 1 家长 × 1 机构 ≤ 1 份画像
 *
 * 字段: 4 个结构化字段 + 元数据(最后更新人/时间)
 *   - commStyle  沟通偏好
 *   - familyBg   家庭背景
 *   - childFocus 孩子关注
 *   - followUp   跟进备忘
 *
 * 边界:
 *   - UserOrgRel 不存在时, getProfile 返回空对象; setProfile 抛 422
 *     (避免自动 create 关系, 业务上'该家长尚未关联本机构账号'是异常流程)
 */

const UserOrgRel = require('@models/UserOrgRel.model')
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
 * 把 UserOrgRel 文档拍平为 profile 响应对象.
 * @param {Object|null} rel
 * @returns {Object}
 */
function shapeProfile(rel) {
  if (!rel) return { ...EMPTY_PROFILE }
  return {
    commStyle: rel.commStyle || '',
    familyBg: rel.familyBg || '',
    childFocus: rel.childFocus || '',
    followUp: rel.followUp || '',
    lastUpdatedBy: rel.profileLastUpdatedBy
      ? { id: String(rel.profileLastUpdatedBy._id || rel.profileLastUpdatedBy.id), realName: rel.profileLastUpdatedBy.realName }
      : null,
    lastUpdatedAt: rel.profileLastUpdatedAt || null
  }
}

/**
 * 拿指定 parent 在当前机构下的画像. 找不到 rel 返回空对象.
 * @param {string} parentId
 * @param {string} orgId
 */
async function getProfile(parentId, orgId) {
  const parent = await Parent.findById(parentId).select('user org').lean()
  if (!parent) throw ApiError.notFound('家长不存在')
  if (String(parent.org) !== String(orgId)) {
    throw ApiError.forbidden('该家长不属于当前机构')
  }
  if (!parent.user) {
    // 家长未绑定 User 账号, 不可能有画像
    return { ...EMPTY_PROFILE }
  }
  const rel = await UserOrgRel.findOne({ user: parent.user, org: orgId })
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  return shapeProfile(rel)
}

/**
 * 写家长画像. rel 必须存在(家长已关联本机构账号), 否则 422.
 * @param {string} parentId
 * @param {string} orgId
 * @param {{commStyle?, familyBg?, childFocus?, followUp?}} body
 * @param {{id: string}} currentUser
 */
async function setProfile(parentId, orgId, body, currentUser) {
  const parent = await Parent.findById(parentId).select('user org').lean()
  if (!parent) throw ApiError.notFound('家长不存在')
  if (String(parent.org) !== String(orgId)) {
    throw ApiError.forbidden('该家长不属于当前机构')
  }
  if (!parent.user) {
    throw ApiError.unprocessable('该家长尚未绑定账号, 无法维护画像')
  }
  const rel = await UserOrgRel.findOne({ user: parent.user, org: orgId })
  if (!rel) {
    throw ApiError.unprocessable('该家长尚未关联本机构账号, 无法维护画像')
  }
  // 白名单: 只更新这 4 个字段, 不让前端覆盖 user/org/positions/isMain/profileMeta 等
  if (body.commStyle !== undefined) rel.commStyle = body.commStyle || ''
  if (body.familyBg !== undefined) rel.familyBg = body.familyBg || ''
  if (body.childFocus !== undefined) rel.childFocus = body.childFocus || ''
  if (body.followUp !== undefined) rel.followUp = body.followUp || ''
  rel.profileLastUpdatedBy = currentUser.id
  rel.profileLastUpdatedAt = new Date()
  await rel.save()
  // 重新拉一遍拿到 populate 后的 lastUpdatedBy
  const fresh = await UserOrgRel.findById(rel._id)
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  return shapeProfile(fresh)
}

module.exports = { getProfile, setProfile, shapeProfile, EMPTY_PROFILE }
