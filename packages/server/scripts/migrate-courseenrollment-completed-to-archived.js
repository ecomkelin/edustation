'use strict'

/**
 * 数据迁移：把"旧版结业"留下的 status='completed' 报名升级为 status='archived'。
 *
 * 背景（2026-06）：
 * 业务上"结业"按钮从管理端下线，报名新增"归档"（ARCHIVED）状态；语义上：
 *  - 旧 completed = "教务手动把这个学生标为已结业"
 *  - 新 archived  = "开班 active→closed 时由后端自动级联；个别学生可由管理员经
 *                   setStatus 手工覆盖"
 * 重命名后旧数据要平稳过渡到新状态，并保留原时间戳作为审计依据。
 *
 * 本脚本（一次性，可重复运行；幂等）：
 *  1. 找出所有 status='completed' 的 CourseEnrollment
 *  2. 聚合管道一次写完：status='archived'，archivedAt = 原 completedAt
 *  3. $unset 老字段 completedAt（schema 已移除，留着只会脏）
 *  4. log summary：scanned / migrated / skipped
 *
 * 账目校验：迁完后所有 completed 行都被改成 archived；archivedAt 与原 completedAt 一致；
 *          schema 里没有 completedAt 字段。
 *
 * 运行： node packages/server/scripts/migrate-courseenrollment-completed-to-archived.js
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { connect, disconnect } = require('@config/db')
const CourseEnrollment = require('@models/CourseEnrollment.model')

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-ce-completed] connected')

  const total = await CourseEnrollment.countDocuments({ status: 'completed' })
  // eslint-disable-next-line no-console
  console.log(`[migrate-ce-completed] scanned ${total} legacy status='completed' rows`)

  if (total === 0) {
    // eslint-disable-next-line no-console
    console.log('[migrate-ce-completed] nothing to do')
    await disconnect()
    // eslint-disable-next-line no-console
    console.log('[migrate-ce-completed] done')
    process.exit(0)
  }

  // 聚合管道形式（MongoDB 4.2+；mongoose 8 锁的最低支持 ≥ 4.2，可放心用）：
  //  - $set.status = 'archived'
  //  - $set.archivedAt = '$completedAt'  （保留原时间戳；null 时也置 null）
  //  - $unset.completedAt                （schema 已删，留着会脏）
  const r = await CourseEnrollment.updateMany(
    { status: 'completed' },
    [
      { $set: { status: 'archived', archivedAt: '$completedAt' } },
      { $unset: ['completedAt'] }
    ]
  )

  // 二次校验：是否还有遗留的 completed（理论上 r.modifiedCount 应该 === total）
  const leftover = await CourseEnrollment.countDocuments({ status: 'completed' })
  const skipped = leftover // 兜底：可能因并发写入或 filter 在中途失效而漏掉

  // eslint-disable-next-line no-console
  console.log('[migrate-ce-completed] summary:')
  // eslint-disable-next-line no-console
  console.log(`  scanned:  ${total}`)
  // eslint-disable-next-line no-console
  console.log(`  migrated: ${r.modifiedCount || 0}`)
  // eslint-disable-next-line no-console
  console.log(`  skipped:  ${skipped} (left in 'completed' — likely concurrent overwrite)`)

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-ce-completed] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-ce-completed] failed:', e)
  process.exit(1)
})
