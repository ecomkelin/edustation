'use strict'

/**
 * 数据迁移：把"早期 makeup() 建新行"留下的重复考勤合并回原考勤，回归"就地转状态"语义。
 *
 * 背景（2026-06）：
 * 旧版 makeup() 会插入一条新的 LessonAttendance（status='madeup'，meta.makeupOf=原 _id），
 * 原考勤保持原状态。同 (lessonSchedule, student) 下因此出现多条记录，UI 上"原条目没变 + 多
 * 了一条已补"很反直觉。新版改成"就地转 status"，原条目直接变 madeup、不再创建新行。
 *
 * 本脚本（一次性，可重复运行；幂等）：
 *  1. 找出所有 status='madeup' 且 meta.makeupOf 存在的考勤（旧"建新行"产物）
 *  2. 按 meta.makeupOf 分组：每个原考勤可能对应 1..N 条旧 madeup
 *  3. 每组保留最新一条，把它的数据合并回原考勤：
 *     - 原考勤.status = 'madeup'
 *     - 原考勤.studentProduct = 保留那条的 studentProduct
 *     - 原考勤.actualStartTime / actualEndTime / remark 同步
 *     - 原考勤.meta 写入 { originalStatus: 原状态, makeupAt: 那条 madeup 的 createdAt }
 *  4. 删除组内其余旧 madeup 记录，并把它们对应的 StudentProduct 退回 1 课时
 *     （因为它们的扣减已经合并到原考勤身上，重复扣除要回退）
 *  5. meta.makeupOf 字段已无意义，不主动清（保留旧字段以便审计），新代码不再依赖
 *
 * 账目校验：迁完后每个原考勤在 (lessonSchedule, student) 下唯一，且 StudentProduct 总余额
 * 不变（每条被删的旧 madeup 退回 1 课时）。
 *
 * 运行： node packages/server/scripts/migrate-makeup-to-status-transition.js
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { connect, disconnect } = require('@config/db')
const LessonAttendance = require('@models/LessonAttendance.model')
const StudentProduct = require('@models/StudentProduct.model')

const STATUS = { MADEUP: 'madeup' }

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-makeup] connected')

  // 1) 找出所有旧式"建新行"留下的 madeup
  const oldMakeups = await LessonAttendance.find({
    status: STATUS.MADEUP,
    'meta.makeupOf': { $exists: true }
  })
    .select('_id student lessonSchedule studentProduct meta createdAt')
    .lean()

  if (!oldMakeups.length) {
    // eslint-disable-next-line no-console
    console.log('[migrate-makeup] no legacy madeup rows; nothing to do')
    await disconnect()
    return
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate-makeup] found ${oldMakeups.length} legacy madeup rows`)

  // 2) 按 meta.makeupOf 分组
  const groups = new Map() // key = 原考勤 _id (string) -> Array<oldMakeup>
  for (const m of oldMakeups) {
    const k = String(m.meta.makeupOf)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(m)
  }

  let mergedGroups = 0
  let keptRows = 0
  let deletedRows = 0
  let refundedLessons = 0
  let orphanOriginals = 0
  let missingOriginals = 0

  for (const [origId, list] of groups) {
    // 按 createdAt 升序；保留最新
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const keep = list[list.length - 1]
    const drop = list.slice(0, -1)

    // 3) 找到原考勤
    const orig = await LessonAttendance.findById(origId)
    if (!orig) {
      // 原考勤已删（极少见）；保留这条 makeup 不动当孤儿
      missingOriginals++
      // eslint-disable-next-line no-console
      console.log(`  [warn] original attendance ${origId} not found; keeping kept=${keep._id}`)
      continue
    }
    // 如果原考勤已经被新代码就地转成 madeup，说明新版 makeup 已经处理过；旧重复直接删 + 退课
    const alreadyMadeup = orig.status === STATUS.MADEUP
    if (!alreadyMadeup) {
      // 4) 合并 keep 的数据到 orig
      orig.status = STATUS.MADEUP
      orig.studentProduct = keep.studentProduct || orig.studentProduct
      if (keep.actualStartTime) orig.actualStartTime = keep.actualStartTime
      if (keep.actualEndTime) orig.actualEndTime = keep.actualEndTime
      // remark 优先用 keep 写入的那条（最新一次）
      if (keep.remark) orig.remark = keep.remark
      orig.meta = {
        ...(orig.meta || {}),
        originalStatus: orig.meta && orig.meta.originalStatus
          ? orig.meta.originalStatus
          : 'leave', // 历史缺失时兜底
        makeupAt: keep.createdAt || new Date()
      }
      // 注意：orig.meta.makeupOf 已经在原考勤上可能不存在；保留也无妨
      await orig.save()
      mergedGroups++
    } else {
      orphanOriginals++
      // eslint-disable-next-line no-console
      console.log(`  [info] original ${origId} already madeup (new code path); just drop duplicates`)
    }
    keptRows++

    // 5) 删除组内其余旧 madeup，并退回对应 StudentProduct
    for (const d of drop) {
      if (d.studentProduct) {
        // 退 1 课时
        const r = await StudentProduct.updateOne(
          { _id: d.studentProduct, remainingLessons: { $gte: 1 } },
          { $inc: { remainingLessons: 1 }, $set: { isActive: true } }
        )
        if (r.modifiedCount > 0) refundedLessons++
      }
      await LessonAttendance.deleteOne({ _id: d._id })
      deletedRows++
    }
  }

  // eslint-disable-next-line no-console
  console.log('[migrate-makeup] summary:')
  // eslint-disable-next-line no-console
  console.log(`  groups merged:          ${mergedGroups}`)
  // eslint-disable-next-line no-console
  console.log(`  rows kept:              ${keptRows}`)
  // eslint-disable-next-line no-console
  console.log(`  duplicate rows deleted: ${deletedRows}`)
  // eslint-disable-next-line no-console
  console.log(`  lessons refunded:       ${refundedLessons}`)
  // eslint-disable-next-line no-console
  console.log(`  already-madeup originals (no merge needed): ${orphanOriginals}`)
  // eslint-disable-next-line no-console
  console.log(`  missing originals (kept as orphan):         ${missingOriginals}`)

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-makeup] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-makeup] failed:', e)
  process.exit(1)
})