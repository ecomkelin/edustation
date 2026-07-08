'use strict'

/**
 * 员工任务模块种子 (2026-07-08 立项, MM=36)
 *
 * 预置内容:
 *   1) 给所有系统岗位 (isSystem=true) 批量加 task 权限码 (按岗位语义分级)
 *   2) 给梓潼/绵阳 启用 org 各创建 1 个示例模板（每日清洁任务）
 *
 * 权限码分配规则 (与业务域对齐):
 *   - 管理员 (admin):        read + write + assign + review + delete (5 全开)
 *   - 教务 (jiaowu):         read + write + assign + review (4 开, delete 给平台超管)
 *   - 老师 (teacher):        read + write (创建/查看自己的任务, 不分派他人, 无 delete)
 *   - 财务 (finance):        read (只查看与自己相关的)
 *   - 招生 (zhaosheng):      read (只查看与自己相关的)
 *   - 平台超管 (platform):   read + delete
 *
 * 幂等:
 *   - Position.permissions 用 $addToSet (重复加无副作用)
 *   - TaskTemplate 用 (org, title) 唯一检查, 已存在跳过
 *
 * 调用:
 *   node -e "require('module-alias/register'); require('./scripts/db/seeds/task.seed').run().then(()=>process.exit())"
 *   或通过 init-seeds.js 一并跑 (默认)
 */

const mongoose = require('mongoose')
const Position = require('@models/Position.model')
const Org = require('@models/Org.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const TaskTemplate = require('@models/TaskTemplate.model')
const { computeNextRunAt } = require('@modules/task/task.service')

// ─── 权限码 → 岗位名映射 ──────────────────────────
// 匹配 Position.name (与 dump 里的实际名称一致, 见 initial.data.json)
const POSITION_PERMS = [
  { name: '管理员', perms: ['task.read', 'task.write', 'task.assign', 'task.review', 'task.delete'] },
  { name: '教务',   perms: ['task.read', 'task.write', 'task.assign', 'task.review'] },
  { name: '老师',   perms: ['task.read', 'task.write'] },
  { name: '财务',   perms: ['task.read'] },
  { name: '招生',   perms: ['task.read'] }
]

/**
 * 给所有启用的 org 的对应系统岗位加 task 权限码 (幂等)
 */
async function seedPositionPermissions() {
  const orgs = await Org.find({ isActive: true }).select('_id').lean()
  let updated = 0
  for (const org of orgs) {
    for (const m of POSITION_PERMS) {
      const r = await Position.updateOne(
        { org: org._id, name: m.name, isSystem: true },
        { $addToSet: { permissions: { $each: m.perms } } }
      )
      if (r.modifiedCount > 0) updated++
    }
  }
  return updated
}

/**
 * 给每个启用 org 创建一个示例模板：每日清洁任务（演示用）
 */
async function seedSampleTemplates() {
  const orgs = await Org.find({ isActive: true }).select('_id').lean()
  let created = 0
  for (const org of orgs) {
    // 找一个 org 下第一个有 task.write 权限的员工作为 createdBy
    const writePos = await Position.findOne({ org: org._id, name: '教务', isSystem: true }).select('_id').lean()
    let creator = null
    if (writePos) {
      const rel = await UserOrgRel.findOne({ org: org._id, positions: writePos._id, isActive: true })
        .select('user').lean()
      if (rel) creator = rel.user
    }
    if (!creator) {
      const u = await User.findOne({ isPlatformAdmin: true }).select('_id').lean()
      if (u) creator = u._id
    }
    if (!creator) {
      console.warn(`[seed.task] org=${org._id} 找不到 createdBy, 跳过示例模板`)
      continue
    }

    const schedule = { kind: 'daily', hour: [9], weekdays: [], daysOfMonth: [] }
    const exists = await TaskTemplate.findOne({ org: org._id, title: '每日清洁检查' }).select('_id').lean()
    if (exists) continue

    await TaskTemplate.create({
      org: org._id,
      title: '每日清洁检查',
      description: '每天 9:00 自动生成, 教务分派给值班老师。3 条 checklist: 教室地面/桌椅/设备。',
      type: 'facility',
      priority: 'normal',
      defaultAssignees: [{ user: creator }],
      defaultSupervisors: [creator],
      itemTemplates: [
        { title: '教室地面清洁', order: 0 },
        { title: '桌椅归位摆放', order: 1 },
        { title: '教学设备检查 (投影/电脑)', order: 2 }
      ],
      schedule,
      nextRunAt: computeNextRunAt(schedule),
      isActive: false, // 默认关闭,让用户自己启用
      createdBy: creator
    })
    created++
  }
  return created
}

async function run() {
  // eslint-disable-next-line no-console
  console.log('[seed.task] 给系统岗位加 task 权限码...')
  const posUpdated = await seedPositionPermissions()
  // eslint-disable-next-line no-console
  console.log(`[seed.task]   ✓ Position 更新 ${posUpdated} 条`)

  // eslint-disable-next-line no-console
  console.log('[seed.task] 写入示例模板...')
  const tplCreated = await seedSampleTemplates()
  // eslint-disable-next-line no-console
  console.log(`[seed.task]   ✓ TaskTemplate 新建 ${tplCreated} 条`)

  return { positionsUpdated: posUpdated, templatesCreated: tplCreated }
}

module.exports = { run }