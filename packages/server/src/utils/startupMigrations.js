'use strict'

/**
 * 服务端启动时跑的"轻量级迁移"集中点.
 *
 * 与一次性 scripts/ 下的迁移脚本的差异:
 *   - scripts/ 是手工/运维触发, 一次性, 跑完即弃
 *   - 这里的是启动时**自动**跑的"补救型"修复, 必须**幂等**, 业务运行中无害
 *
 * 设计:
 *   - 每条迁移独立 try/catch; 一条失败**不**阻塞 server 启动, 只 log
 *   - 重复启动 N 次效果一样 (no-op)
 *   - 不引入 mongoose 事务; 都是 metadata 操作
 *
 * 新增迁移: 在 migrations 数组里 push 一个 async () => {} 即可
 */

const mongoose = require('mongoose')
const { hiddenPerms } = require('@shared/permissions')

/* ─── 迁移 1: 清理旧 Lead collection (2026-06 大重构) ────────────
 * 背景:
 *   2026-06 招生模块从 Lead (孩子维度) 重构为 Parent + ChildLead (家长 + 孩子维度).
 *   旧 leads / lead_activities collection 与新 model 不兼容, 需在 server 启动时主动 drop.
 *   开发期 (无真实数据) 阶段直接清空; 阶段 2 上线前需要先备份再删.
 *
 * 幂等: 库无该 collection → no-op-empty; 库有 → drop 一次.
 */
async function dropLegacyLeadCollections() {
  const names = ['leads', 'lead_activities']
  const dropped = []
  for (const name of names) {
    try {
      const collections = await mongoose.connection.db
        .listCollections({ name })
        .toArray()
      if (collections.length === 0) continue
      // eslint-disable-next-line no-console
      console.log(`[startup-migrations] dropping legacy collection: ${name}`)
      await mongoose.connection.db.collection(name).drop()
      dropped.push(name)
    } catch (e) {
      // 兼容: NamespaceNotFound / collection 已被人手动 drop 掉
      if (e && (e.codeName === 'NamespaceNotFound' || e.code === 26)) continue
      throw e
    }
  }
  return dropped.length ? `dropped:${dropped.join(',')}` : 'no-op'
}

/* ─── 迁移 2: 从 Position.permissions 移除 hidden 权限码 (2026-06) ─────
 * 背景:
 *   `platform.*` (4 个) + `org.*` (2 个) 已从「机构职位 - 可分配权限」列表移除
 *   (它们是平台超管专属或已并入独立 group). 但历史数据可能仍在某些机构的
 *   Position.permissions 数组里, 而且这些码**完全无效** (无任何路由 requirePermission 它们).
 *
 * 动作: 对所有 Position 做 $pull, 把 hidden 码一次性清掉. 幂等: 第二次跑 no-op.
 */
async function pullHiddenPermsFromPositions() {
  if (!hiddenPerms || hiddenPerms.size === 0) return 'no-hidden-perms'
  const codes = Array.from(hiddenPerms)
  // 注意: 故意**不**加 org 过滤 —— hidden 码全局不应出现, 跨机构清理
  const Position = require('@models/Position.model')
  const before = await Position.countDocuments({ permissions: { $in: codes } })
  if (before === 0) return 'no-op'
  const r = await Position.updateMany(
    { permissions: { $in: codes } },
    { $pull: { permissions: { $in: codes } } }
  )
  return `pulled:${codes.join(',')}|matched=${before}|modified=${r.modifiedCount || 0}`
}

/* ─── 迁移 3: 给已有机构的「管理员」「教务」补 legal.* 权限码 (2026-06) ─────
 * 背景:
 *   2026-06 新增「法律协议」模块, 默认权限码 legal.read / legal.write 加进了
 *   DEFAULT_POSITIONS 的"管理员"和"教务"。但已落地的历史机构 Position 还没有,
 *   导致他们登录后看不到"机构协议"菜单 / 调 API 403.
 *
 * 动作: 对所有 name ∈ {管理员, 教务} 的 Position 做 $addToSet, 一次性补码. 幂等.
 */
async function addLegalPermsToExistingPositions() {
  const Position = require('@models/Position.model')
  const codes = ['legal.read', 'legal.write']
  // 用 $nin 前置过滤, 避免对已有码的 position 重复写入 (虽然 $addToSet 也幂等,
  // 但 modifiedCount 才能准确反映"真正补码的数量")
  const filter = { name: { $in: ['管理员', '教务'] }, permissions: { $nin: codes } }
  const before = await Position.countDocuments(filter)
  if (before === 0) return 'no-op'
  const r = await Position.updateMany(filter, { $addToSet: { permissions: { $each: codes } } })
  return `added:${codes.join(',')}|matched=${before}|modified=${r.modifiedCount || 0}`
}

/* ─── 迁移 4: 已下线 (2026-06-20) ────────────────────────────────────
 * 背景:
 *   原 clearLegacyTrialSubjectRefs 把 child_leads.trialSubject(s) / trial_bookings.subject
 *   无差别清空, 但 2026-06-20 之后写入的 seed 数据 (梓潼 per-org 字典 + 新录入的 47 个 child_lead)
 *   trialSubjects 字段值是**新 Category id** (model='Subject'), 是合法数据, 不该被清。
 *
 *   老数据 (2026-06-18 之前的 Subject id 引用) 在上次启动时已被清空; 该 migration 任务已完成,
 *   继续保留只会把新数据擦掉。下线。
 */
// (no-op stub 保留以避免 lint 报错; 见下 migrations 数组的注释)
/* eslint-disable-next-line no-unused-vars */
function clearLegacyTrialSubjectRefs() { return 'disabled' }

/* ─── 迁移 5: 给已有机构的「管理员」「教务」补 points.write 权限码 (2026-06-21) ─────
 * 背景:
 *   积分管理 (PointsAdmin) 模块上线, 默认权限码 points.write 加进了
 *   DEFAULT_POSITIONS 的"管理员"和"教务"。但已落地的历史机构 Position 还没有,
 *   导致他们登录后看不到"积分管理"菜单 / 调 API 403。
 *
 * 动作: 对所有 name ∈ {管理员, 教务} 的 Position 做 $addToSet, 一次性补码. 幂等.
 */
async function addPointsWritePermToExistingPositions() {
  const Position = require('@models/Position.model')
  const codes = ['points.write']
  const filter = { name: { $in: ['管理员', '教务'] }, permissions: { $nin: codes } }
  const before = await Position.countDocuments(filter)
  if (before === 0) return 'no-op'
  const r = await Position.updateMany(filter, { $addToSet: { permissions: { $each: codes } } })
  return `added:${codes.join(',')}|matched=${before}|modified=${r.modifiedCount || 0}`
}

/* ─── 迁移 6: 清 TrialBooking / Parent 老字段 (2026-06-21) ───────────
 * 背景:
 *   试听课完全独立于排课系统, attached 模式 (joinMode / lessonSchedule) 下线;
 *   result.negotiateTeacher 合并到顶级 consultant; Parent.consultant 字段删了
 *   (谈单老师挂到 TrialBooking)。
 *
 * 动作: 把残留老字段清掉, 避免 populate 找不到 / 读出 undefined。
 *   - TrialBooking.joinMode / lessonSchedule 字段已从 schema 删; 老文档保留无害 (写操作 $set 不带就忽略)
 *   - TrialBooking.result.negotiateTeacher: 保留字段定义已删, 残留字段被 mongoose 严格模式静默忽略
 *   - Parent.consultant: 保留字段定义已删, 残留字段被忽略
 *   本次清理只是把"明确遗留"清掉, 防止调试时混淆。
 *   幂等: 已 null 的不动; 没字段的 no-op。
 */
async function dropLegacyTrialBookingFields() {
  const db = mongoose.connection.db
  const tb = await db.collection('trial_bookings')
  const parent = await db.collection('parents')

  // TrialBooking.joinMode = null (老 attached 模式记录保留, 但 joinMode 字段清空避免歧义)
  const r1 = await tb.updateMany(
    { joinMode: { $exists: true, $ne: null } },
    { $set: { joinMode: null } }
  )
  // TrialBooking.lessonSchedule = null
  const r2 = await tb.updateMany(
    { lessonSchedule: { $exists: true, $ne: null } },
    { $set: { lessonSchedule: null } }
  )
  // TrialBooking.result.negotiateTeacher = null
  const r3 = await tb.updateMany(
    { 'result.negotiateTeacher': { $exists: true, $ne: null } },
    { $set: { 'result.negotiateTeacher': null } }
  )
  // Parent.consultant = null
  const r4 = await parent.updateMany(
    { consultant: { $exists: true, $ne: null } },
    { $set: { consultant: null } }
  )

  const total = (r1.modifiedCount || 0) + (r2.modifiedCount || 0)
    + (r3.modifiedCount || 0) + (r4.modifiedCount || 0)
  if (total === 0) return 'no-op'
  return `cleaned:joinMode=${r1.modifiedCount || 0}|lessonSchedule=${r2.modifiedCount || 0}|result.negotiateTeacher=${r3.modifiedCount || 0}|parent.consultant=${r4.modifiedCount || 0}`
}

/* ─── 迁移 7: 把 user_org_rels.positions 从 string 转 ObjectId (2026-06-21) ─────────
 * 背景:
 *   历史 raw insert (mongosh dump / 老导入脚本) 让 rel.positions 存的是 string 形式的 ObjectId,
 *   而 schema 定义的是 ObjectId. Mongoose 读时会自动 cast 回来, 但 $in / $nin 这种数组查询
 *   mongoose 会按 schema cast, 把查询参数也转成 ObjectId, 结果跟存的 string 对不上, 命中 0 条.
 *
 *   这导致 user.service.js#list 的 roleScope='staff' 永远返回 0 (修不了纯家长过滤).
 *
 * 动作: 把所有 rel.positions 的 string 元素转回 ObjectId. 幂等: 已经 ObjectId 的跳过.
 *   用 $type='string' 过滤, 不会误伤 ObjectId 元素.
 *   用 findOneAndUpdate 逐条改 (用 aggregation pipeline $set + $map 数组转换).
 */
async function castRelPositionsToObjectId() {
  const mongoose = require('mongoose')
  const rels = mongoose.connection.db.collection('user_org_rels')

  // 找出还有 string 元素的 rels
  const stringRels = await rels.find({
    positions: { $exists: true, $type: 'array' },
    'positions.0': { $type: 'string' }
  }).project({ _id: 1 }).toArray()

  if (stringRels.length === 0) return 'no-op'

  // 用 aggregation pipeline $set 把数组每个 string 转 ObjectId (mongosh 5.0+ / MongoDB 4.2+ 支持)
  let updated = 0
  for (const r of stringRels) {
    const res = await rels.updateOne(
      { _id: r._id },
      [{
        $set: {
          positions: {
            $map: {
              input: '$positions',
              as: 'p',
              in: { $toObjectId: '$$p' }
            }
          }
        }
      }]
    )
    if (res.modifiedCount > 0) updated++
  }
  return `cast:stringRels=${stringRels.length}|updated=${updated}`
}

/* ─── 注册: 按顺序跑 ─────────────────────────────────── */
const migrations = [
  { name: 'drop-legacy-lead-collections', run: dropLegacyLeadCollections },
  { name: 'pull-hidden-perms-from-positions', run: pullHiddenPermsFromPositions },
  { name: 'add-legal-perms-to-existing-positions', run: addLegalPermsToExistingPositions },
  { name: 'add-points-write-perm-to-existing-positions', run: addPointsWritePermToExistingPositions },
  { name: 'drop-legacy-trial-booking-fields', run: dropLegacyTrialBookingFields },
  { name: 'cast-rel-positions-to-objectid', run: castRelPositionsToObjectId }
  // clear-legacy-trial-subject-refs (2026-06-20 下线)
]

/**
 * 跑所有启动迁移, 任一失败不阻塞.
 * @returns {Promise<Array<{name, status, error?}>>}
 */
async function runStartupMigrations() {
  const results = []
  for (const m of migrations) {
    try {
      const status = await m.run()
      // eslint-disable-next-line no-console
      console.log(`[startup-migrations] ${m.name}: ${status}`)
      results.push({ name: m.name, status })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[startup-migrations] ${m.name} FAILED: ${e && e.message}`)
      results.push({ name: m.name, status: 'failed', error: e && e.message })
    }
  }
  return results
}

module.exports = { runStartupMigrations }
