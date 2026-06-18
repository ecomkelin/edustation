'use strict'

const mongoose = require('mongoose')
const Position = require('@models/Position.model')
const Org = require('@models/Org.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const { visibleGroups, visibleAllPermissions, isAssignablePermission } = require('@shared/permissions')
const { CLIENT_LEVEL } = require('@shared/enums')

/**
 * 机构初始化时需要落地的默认职位。
 * 名称、isSystem、clientLevel、permissions 均为 per-org 概念：每个机构各自独立一份。
 * - isSystem=true 的为系统管理岗（不可删除）
 * - clientLevel > 0 的为家长岗（1=基础 / 2=VIP / 3+ 机构自留）
 */
const DEFAULT_POSITIONS = [
  {
    name: '管理员',
    isSystem: true,
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'user.read', 'user.write', 'user.resetPassword',
      'position.read', 'position.write',
      'student.read', 'student.write',
      'subject.read', 'subject.write',
      'courseProduct.read', 'courseProduct.write',
      'courseInstance.read', 'courseInstance.write',
      'courseEnrollment.read', 'courseEnrollment.write',
      'room.read', 'room.write',
      'lessonSchedule.read', 'lessonSchedule.write',
      'order.read', 'order.write', 'order.pay',
      'lessonAttendance.read', 'lessonAttendance.write',
      'studentWork.read', 'studentWork.write',
      'points.read', 'pet.read',
      'recruit.read', 'recruit.write', 'recruit.convert',
      'org-promotion.read', 'org-promotion.write',
      'legal.read', 'legal.write',
      'report.read',
      'agent.read', 'agent.write'
    ]
  },
  {
    name: '教务',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'student.read', 'student.write',
      'subject.read', 'subject.write',
      'courseProduct.read', 'courseProduct.write',
      'courseInstance.read', 'courseInstance.write',
      'courseEnrollment.read', 'courseEnrollment.write',
      'room.read', 'room.write',
      'lessonSchedule.read', 'lessonSchedule.write',
      'order.read', 'order.write', 'order.pay',
      'lessonAttendance.read',
      'studentWork.read',
      'points.read', 'pet.read',
      'recruit.read', 'recruit.write', 'recruit.convert',
      'org-promotion.read', 'org-promotion.write',
      'legal.read', 'legal.write',
      'report.read',
      'agent.read', 'agent.write'
    ]
  },
  {
    name: '老师',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'student.read',
      'courseInstance.read',
      'courseEnrollment.read',
      'room.read',
      'lessonSchedule.read',
      'lessonAttendance.read', 'lessonAttendance.write',
      'studentWork.read', 'studentWork.write',
      'report.read'
    ]
  },
  {
    name: '家长',
    clientLevel: CLIENT_LEVEL.BASIC,
    permissions: [
      'student.read',
      'lessonSchedule.read',
      'lessonAttendance.read',
      'studentWork.read', 'studentWork.write',
      'points.read', 'pet.read',
      'report.read'
    ]
  },
  {
    name: '财务',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'order.read', 'order.write', 'order.pay',
      'student.read', 'studentProduct.read',
      'report.read'
    ]
  }
]

/**
 * 幂等：按 name 补齐缺失的默认职位，不动已存在的。
 * - 不会覆盖已有同名职位的 permissions / isSystem / clientLevel
 * - 同 org 内 clientLevel>0 唯一：若目标 level 已被占用，跳过该家长位
 * - 并发场景：依赖 name+org 唯一索引的 11000 错误兜底
 */
async function ensureDefaultPositions(orgId) {
  if (!orgId) return { created: 0, existing: 0 }
  const existing = await Position.find({ org: orgId }).select('name isSystem clientLevel').lean()
  const existingNames = new Set(existing.map((p) => p.name))
  // 已占用的 clientLevel>0 集合
  const usedClientLevels = new Set(
    existing.filter((p) => Number(p.clientLevel) > 0).map((p) => Number(p.clientLevel))
  )

  const toCreate = []
  for (const d of DEFAULT_POSITIONS) {
    if (existingNames.has(d.name)) continue
    if (Number(d.clientLevel) > 0 && usedClientLevels.has(Number(d.clientLevel))) continue
    toCreate.push({ ...d, org: orgId })
  }
  if (!toCreate.length) return { created: 0, existing: existing.length }

  let createdDocs = []
  try {
    createdDocs = await Position.insertMany(toCreate, { ordered: false })
  } catch (e) {
    // 并发兜底：被其他请求/进程抢先建好，逐条重试
    if (e && e.code === 11000) {
      for (const d of toCreate) {
        try {
          const r = await Position.create(d)
          createdDocs.push(r)
        } catch (e2) {
          if (!e2 || e2.code !== 11000) throw e2
        }
      }
    } else {
      throw e
    }
  }
  return { created: createdDocs.length, existing: existing.length }
}

async function list({ orgId, keyword, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }
  const [items, total] = await Promise.all([
    Position.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    Position.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(id, orgId) {
  const pos = await Position.findOne({ _id: id, org: orgId }).lean()
  if (!pos) throw ApiError.notFound('职位不存在')
  return pos
}

async function create({ orgId, name, permissions = [], clientLevel = 0 }) {
  try {
    const pos = await Position.create({ org: orgId, name, permissions, clientLevel })
    return pos.toObject()
  } catch (e) {
    if (e && e.code === 11000) {
      // (org, clientLevel) partial unique index 命中：同 org 内已存在该等级的职位
      if (Number(clientLevel) > 0) {
        throw ApiError.conflict(`本机构已存在 clientLevel=${clientLevel} 的家长岗位（每个等级至多一个）`)
      }
      // name 重复：兜底返回 409
      throw ApiError.conflict(`职位名称「${name}」已存在`)
    }
    throw e
  }
}

async function update(id, orgId, payload) {
  const pos = await Position.findOne({ _id: id, org: orgId })
  if (!pos) throw ApiError.notFound('职位不存在')
  if (pos.isSystem && payload.isSystem === false) {
    throw ApiError.badRequest('系统职位不可降级')
  }
  // 系统职位不允许改成 clientLevel>0（避免管理员把自己提升为家长）
  if (pos.isSystem && payload.clientLevel !== undefined && Number(payload.clientLevel) > 0) {
    throw ApiError.badRequest('系统职位不可改为家长岗位')
  }
  try {
    Object.assign(pos, payload)
    await pos.save()
    return pos.toObject()
  } catch (e) {
    if (e && e.code === 11000) {
      if (payload.clientLevel !== undefined && Number(payload.clientLevel) > 0) {
        throw ApiError.conflict(`本机构已存在 clientLevel=${payload.clientLevel} 的家长岗位`)
      }
      throw ApiError.conflict(`职位名称「${payload.name}」已存在`)
    }
    throw e
  }
}

/**
 * 物理删除职位。
 * 入口:超管+密码(routing);系统职位不可删(任何时候都不可)。
 * 业务校验:无任何员工持有(UserOrgRel.positions 是数组,$in 匹配)。
 */
async function remove({ id, orgId }) {
  const pos = await Position.findOne({ _id: id, org: orgId })
  if (!pos) throw ApiError.notFound('职位不存在')
  if (pos.isSystem) throw ApiError.badRequest('系统职位不可删除')

  // 互锁:有员工持有则挡
  const { assertUnused } = require('@utils/removable')
  await assertUnused(orgId, [
    {
      model: UserOrgRel, filter: { org: orgId, positions: id },
      label: '员工持有', hint: '请先把员工从该职位解除后再删'
    }
  ])

  await pos.deleteOne()
  return { success: true }
}

/**
 * 预检:返回该职位当前是否可删除。
 * 系统职位 / 仍有员工持有 → 阻挡。
 */
async function removableCheck({ id, orgId }) {
  const pos = await Position.findOne({ _id: id, org: orgId }).select('_id isSystem name').lean()
  if (!pos) return { canRemove: false, blockers: [{ entity: 'Position', label: '职位', count: 0, hint: '该职位不存在或不属于本机构' }] }
  if (pos.isSystem) {
    return { canRemove: false, blockers: [{ entity: 'Position', label: '系统职位', count: 1, hint: '系统职位不可删除' }] }
  }
  const { check } = require('@utils/removable')
  return check(orgId, [
    {
      model: UserOrgRel, filter: { org: orgId, positions: id },
      label: '员工持有', hint: '请先把员工从该职位解除后再删'
    }
  ])
}

async function setPermissions(id, orgId, permissions) {
  // 权威过滤: hidden 权限码(platform.* / org.*)即便前端传过来也直接 drop,
  // 不允许任何机构职位持有。这是服务端最后一道防线, 防止:
  //   - 前端 stale 缓存把旧码塞回来
  //   - 用户直接 curl 调本接口
  // 旧数据由 startupMigrations.pullHiddenPerms 一次性清, 见 utils/startupMigrations.js
  const cleaned = (permissions || []).filter(isAssignablePermission)
  const dropped = (permissions || []).filter((p) => !isAssignablePermission(p))
  if (dropped.length) {
    // 仅记日志, 不阻断 (前端不应该传, 真传了就静默 drop)
    console.warn(`[position.setPermissions] dropped hidden perms: ${dropped.join(', ')}`)
  }
  const pos = await Position.findOneAndUpdate(
    { _id: id, org: orgId },
    { $set: { permissions: cleaned } },
    { new: true }
  ).lean()
  if (!pos) throw ApiError.notFound('职位不存在')
  return pos
}

function permissionsCatalog() {
  // 只暴露 visible group (hidden 标记的 platform / org 不进 catalog)
  return { groups: visibleGroups, all: visibleAllPermissions }
}

/* ------------------------------------------------------------------
 * 跨机构同步（仅平台超管使用）
 * ------------------------------------------------------------------ */

/**
 * 列出可作为「同步源」的其他机构。排除当前目标机构（targetOrgId）。
 * 用于前端「从其他机构同步职位」弹窗中选源。
 */
async function listSourceOrgs({ keyword, targetOrgId }) {
  const filter = { isActive: true }
  if (targetOrgId && mongoose.isValidObjectId(targetOrgId)) {
    filter._id = { $ne: targetOrgId }
  }
  if (keyword) {
    const re = { $regex: keyword, $options: 'i' }
    filter.$or = [{ name: re }, { nameAbbreviation: re }, { unicode: re }]
  }
  const items = await Org.find(filter)
    .select('name nameAbbreviation unicode isActive')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
  return { items }
}

/**
 * 列出指定机构下的全部职位（不区分系统 / 自定义）。
 * 供平台超管在跨机构同步时预览。
 */
async function listByOrg(orgId) {
  if (!mongoose.isValidObjectId(orgId)) throw ApiError.badRequest('机构 id 不合法')
  const items = await Position.find({ org: orgId })
    .select('name permissions isSystem clientLevel')
    .sort({ createdAt: -1 })
    .lean()
  return { items }
}

/**
 * 从 sourceOrgId 复制所选职位到 targetOrgId。
 * 规则：
 *  - 源内同名（重复 id）只取第一个，其余 skip: 'duplicate-in-source'
 *  - 目标机构已存在的 name：skip: 'already-exists-in-target'（不覆盖）
 *  - 源端查不到的 id：skip: 'source-position-not-found'
 *  - 复制到新机构后，isSystem 一律置为 false、clientLevel 一律置为 0
 *    （系统/家长等级是 per-org 概念，由目标机构各自初始化）
 */
async function syncPositions({ targetOrgId, sourceOrgId, positionIds, operatorId }) {
  if (!targetOrgId) throw ApiError.badRequest('请先在顶部「机构切换」中选择目标机构')
  if (!sourceOrgId || !mongoose.isValidObjectId(sourceOrgId)) {
    throw ApiError.badRequest('源机构不合法')
  }
  if (!mongoose.isValidObjectId(targetOrgId)) {
    throw ApiError.badRequest('目标机构不合法')
  }
  if (String(sourceOrgId) === String(targetOrgId)) {
    throw ApiError.badRequest('源机构与目标机构不能相同')
  }
  if (!Array.isArray(positionIds) || positionIds.length === 0) {
    throw ApiError.badRequest('positionIds 不能为空')
  }
  if (positionIds.length > 200) {
    throw ApiError.badRequest('单次最多同步 200 个职位')
  }
  const validIds = positionIds.filter((id) => mongoose.isValidObjectId(id))
  if (validIds.length !== positionIds.length) {
    throw ApiError.badRequest('positionIds 含非法 id')
  }

  const [source, target] = await Promise.all([
    Org.findById(sourceOrgId).select('_id').lean(),
    Org.findById(targetOrgId).select('_id').lean()
  ])
  if (!source) throw ApiError.notFound('源机构不存在')
  if (!target) throw ApiError.notFound('目标机构不存在')

  const [sourcePositions, existing] = await Promise.all([
    Position.find({ _id: { $in: validIds }, org: sourceOrgId })
      .select('name permissions isSystem clientLevel')
      .lean(),
    Position.find({ org: targetOrgId }).select('name').lean()
  ])

  const existingNames = new Set(existing.map((p) => p.name))
  const seen = new Set()
  const toCreate = []
  const skipped = []

  for (const p of sourcePositions) {
    if (seen.has(p.name)) {
      skipped.push({ sourceId: String(p._id), name: p.name, reason: 'duplicate-in-source' })
      continue
    }
    seen.add(p.name)
    if (existingNames.has(p.name)) {
      skipped.push({ sourceId: String(p._id), name: p.name, reason: 'already-exists-in-target' })
      continue
    }
    toCreate.push({
      org: targetOrgId,
      name: p.name,
      permissions: Array.isArray(p.permissions) ? p.permissions : [],
      isSystem: false,
      clientLevel: CLIENT_LEVEL.NONE
    })
  }

  // 源端查不到的 id
  const foundIds = new Set(sourcePositions.map((p) => String(p._id)))
  for (const id of validIds) {
    if (!foundIds.has(String(id))) {
      skipped.push({ sourceId: String(id), name: null, reason: 'source-position-not-found' })
    }
  }

  let created = []
  if (toCreate.length) {
    const docs = await Position.insertMany(toCreate, { ordered: false })
    created = docs.map((d) => d.toObject())
  }

  // eslint-disable-next-line no-console
  console.log(
    `[position.sync] operator=${operatorId} target=${targetOrgId} source=${sourceOrgId} created=${created.length} skipped=${skipped.length}`
  )

  return {
    created,
    skipped,
    createdCount: created.length,
    skippedCount: skipped.length
  }
}

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  removableCheck,
  setPermissions,
  permissionsCatalog,
  listSourceOrgs,
  listByOrg,
  syncPositions,
  ensureDefaultPositions,
  DEFAULT_POSITIONS
}
