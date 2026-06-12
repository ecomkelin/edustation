'use strict'

/**
 * 数据迁移：LessonWork → StudentWork 改版（2026-06）
 *
 * 背景：
 *   原 LessonWork 通过 (lessonSchedule, student) 二元组定位作品，没有 lessonAttendance
 *   直接关联，也未冗余 courseInstance / subject。本脚本是新版 StudentWork 上线时的
 *   老数据回填工具。
 *
 * 行为（幂等）：
 *   1. 找出 student_works 集合内 lessonAttendance 字段不存在的文档（旧数据）
 *   2. 对每条：按 (lessonSchedule, student) 查找对应 LessonAttendance，拿到 attendanceId
 *      - 找不到 attendance（极少见：考勤已被物理删）→ 跳过并日志告警，**不删**（保留历史）
 *   3. 由 attendance.lessonSchedule 推导 courseInstance / subject
 *   4. $set 补齐四个 snapshot 字段（用 runValidators: false 绕过 immutable，迁完后即生效）
 *   5. 在 __migrations 集合留一条完成记录
 *
 * 运行：node packages/server/scripts/migrate-student-work.js
 * 重复运行：第二次找不到 lessonAttendance 缺失的文档 → 直接退出（幂等）。
 *
 * 重要：脚本运行前请确保：
 *   - StudentWork.model 已生效（require 即可触发）
 *   - 数据库可写
 *   - 不需要停止服务（脚本是只读 + $set，不锁表）
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { connect, disconnect } = require('@config/db')
const StudentWork = require('@models/StudentWork.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const CourseInstance = require('@models/CourseInstance.model')

const MIGRATION_NAME = 'student-work-v1'

async function ensureIndexes() {
  // 触发 StudentWork 所有索引的创建（包含新加的 4 个）
  await StudentWork.syncIndexes()
}

async function markDone() {
  const db = mongoose.connection.db
  await db.collection('__migrations').updateOne(
    { name: MIGRATION_NAME },
    { $set: { name: MIGRATION_NAME, doneAt: new Date() } },
    { upsert: true }
  )
}

async function isAlreadyDone() {
  const db = mongoose.connection.db
  const doc = await db.collection('__migrations').findOne({ name: MIGRATION_NAME })
  return !!doc
}

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-student-work] connected')

  if (await isAlreadyDone()) {
    // eslint-disable-next-line no-console
    console.log(`[migrate-student-work] migration "${MIGRATION_NAME}" already done; exit`)
    await ensureIndexes()
    await disconnect()
    process.exit(0)
  }

  // 1) 找老数据：lessonAttendance 字段不存在
  const legacyDocs = await StudentWork.find({ lessonAttendance: { $exists: false } })
    .select('_id org lessonSchedule student')
    .lean()

  if (!legacyDocs.length) {
    // eslint-disable-next-line no-console
    console.log('[migrate-student-work] no legacy rows; nothing to backfill')
    await ensureIndexes()
    await markDone()
    await disconnect()
    // eslint-disable-next-line no-console
    console.log('[migrate-student-work] done (no-op)')
    process.exit(0)
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate-student-work] found ${legacyDocs.length} legacy rows to backfill`)

  let backfilled = 0
  let orphan = 0
  let noSchedule = 0
  let noInstance = 0
  let nullSubject = 0
  let errCount = 0

  for (const doc of legacyDocs) {
    try {
      // 2) 找 attendance
      const att = await LessonAttendance.findOne({
        org: doc.org,
        lessonSchedule: doc.lessonSchedule,
        student: doc.student
      })
        .select('_id lessonSchedule')
        .lean()
      if (!att) {
        orphan++
        // eslint-disable-next-line no-console
        console.log(`  [warn] legacy work ${doc._id} has no matching attendance; skip`)
        continue
      }

      // 3) 推导 courseInstance
      const sched = await LessonSchedule.findOne({ _id: att.lessonSchedule, org: doc.org })
        .select('courseInstance')
        .lean()
      if (!sched) {
        noSchedule++
        // eslint-disable-next-line no-console
        console.log(`  [warn] legacy work ${doc._id} schedule ${att.lessonSchedule} not found; skip`)
        continue
      }

      // 4) 推导 subject
      let subject = null
      if (sched.courseInstance) {
        const ci = await CourseInstance.findOne({ _id: sched.courseInstance, org: doc.org })
          .select('subject')
          .lean()
        if (!ci) {
          noInstance++
          // eslint-disable-next-line no-console
          console.log(`  [warn] legacy work ${doc._id} courseInstance ${sched.courseInstance} not found; skip`)
          continue
        }
        subject = ci.subject || null
        if (subject === null) nullSubject++
      } else {
        nullSubject++
      }

      // 5) 写回
      await StudentWork.updateOne(
        { _id: doc._id },
        {
          $set: {
            lessonAttendance: att._id,
            courseInstance: sched.courseInstance || null,
            subject
          }
        },
        { runValidators: false }
      )
      backfilled++
    } catch (e) {
      errCount++
      // eslint-disable-next-line no-console
      console.error(`  [error] legacy work ${doc._id} failed:`, e.message)
    }
  }

  // eslint-disable-next-line no-console
  console.log('[migrate-student-work] summary:')
  // eslint-disable-next-line no-console
  console.log(`  backfilled:        ${backfilled}`)
  // eslint-disable-next-line no-console
  console.log(`  orphan (no att):   ${orphan}`)
  // eslint-disable-next-line no-console
  console.log(`  no schedule:       ${noSchedule}`)
  // eslint-disable-next-line no-console
  console.log(`  no courseInstance: ${noInstance}`)
  // eslint-disable-next-line no-console
  console.log(`  null subject:      ${nullSubject}`)
  // eslint-disable-next-line no-console
  console.log(`  errors:            ${errCount}`)

  await ensureIndexes()
  await markDone()
  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-student-work] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-student-work] failed:', e)
  process.exit(1)
})
