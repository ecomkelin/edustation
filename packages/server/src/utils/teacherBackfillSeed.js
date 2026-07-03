'use strict'

const mongoose = require('mongoose')
const Org = require('@models/Org.model')
const UserOrgRel = require('@models/UserOrgRel.model')

/**
 * 2026-06 名师团队回填（"开发阶段不向前兼容"约束）。
 *
 * 设计：给历史机构补默认值，避免"加了开关后所有老机构不展示"
 * 这种回归行为。
 *   - Org.showTeacherTeam: undefined → true (历史行为是默认展示)
 *   - UserOrgRel.showAsTeacher: undefined → 按"是否纯员工岗"派生 (兼容老 isMain 行为)
 *       - 任意一个 positions.clientLevel > 0 → 仍保持 false (纯家长)
 *       - 否则 (纯 staff) → true
 *
 * 已有显式值的记录不动（不覆盖管理员已选的开关/勾选）。
 *
 * 仅跑一次：完成后写 marker 到 process globalThis，下次启动 no-op。
 */
let _runOnce = false

async function backfillTeacherFlags() {
  if (_runOnce) return { skipped: true, reason: 'already ran in this process' }
  _runOnce = true

  // Org 总开关回填 (只填 undefined, 已显式 false 的不动)
  const orgRes = await Org.updateMany(
    { showTeacherTeam: { $in: [null, undefined] } },
    { $set: { showTeacherTeam: true } }
  )

  // UserOrgRel 行级回填: 用 aggregation 看 staff 岗数量, 派生 showAsTeacher
  // (只填 undefined, 已显式 false/true 的不动)
  const rels = await UserOrgRel.find({ showAsTeacher: { $in: [null, undefined] } })
    .populate({ path: 'positions', select: 'clientLevel' })
    .lean()

  let staffSet = 0
  let guardianKeep = 0
  for (const r of rels) {
    const positions = Array.isArray(r.positions) ? r.positions : []
    const isGuardian = positions.some((p) => Number(p.clientLevel) > 0)
    const next = !isGuardian
    await UserOrgRel.updateOne(
      { _id: r._id },
      { $set: { showAsTeacher: next } }
    )
    if (next) staffSet++
    else guardianKeep++
  }

  return {
    orgsUpdated: orgRes.modifiedCount || 0,
    staffRelsSet: staffSet,
    guardianRelsKept: guardianKeep
  }
}

module.exports = backfillTeacherFlags
