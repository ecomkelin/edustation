'use strict'

const StudentProduct = require('@models/StudentProduct.model')

/**
 * FIFO 选 StudentProduct：expireDate 升序选最早过期的。
 * 必须满足 isActive=true, remainingLessons>0, expireDate>now。
 * 找不到返回 null（调用方处理"无可用产品"分支）。
 *
 * 用于：
 *  - lessonSchedule.generateAttendancesForSchedule（排课生成时预选包）
 *  - lessonAttendance.bulkCompleteForSchedule（结束上课自动消课时兜底选包）
 *  - lessonAttendance.ensureAttendanceForStudent（新报名/购课后补考勤）
 */
async function pickStudentProductFIFO({ orgId, student, accepted, now = new Date() }) {
  if (!Array.isArray(accepted) || !accepted.length) return null
  return StudentProduct.findOne({
    org: orgId,
    student,
    courseProduct: { $in: accepted },
    isActive: true,
    remainingLessons: { $gt: 0 },
    expireDate: { $gt: now }
  }).sort({ expireDate: 1 }).select('_id').lean()
}

/**
 * 原子扣减 StudentProduct 1 课时。
 * 用 findOneAndUpdate({ _id, isActive, remainingLessons >= 1, expireDate > now },
 *                      { $inc: { remainingLessons: -1 } })
 * 单文档原子操作，避免并发"读-改-写"竞态超扣；同时把 isActive/expireDate/remainingLessons 全部
 * 放进 filter，让"已停用 / 已过期 / 余额不足"任一情况都直接不命中 → 返回 null.
 *
 * 2026-08-05: isActive/expireDate 加进原子 filter (审计 H7)
 *   之前只校验 remainingLessons≥1, 不校验 isActive/expireDate → 可扣已停用 / 已过期 / 余额不足(此处也校验)的课包
 *   现在 filter 同时限定 4 个条件, 配合 findOneAndUpdate 的原子性, 杜绝"扣前一刻被改/过期"竞态.
 *
 * 返回值：扣减成功 → 更新后的对象；任一条件不满足 → null
 * 当扣减到 0 时，额外把 isActive 置 false（与 LessonAttendance.service.complete 单条路径一致）。
 */
async function deductOneLesson(spId, now = new Date()) {
  if (!spId) return null
  const updated = await StudentProduct.findOneAndUpdate(
    {
      _id: spId,
      isActive: true,
      remainingLessons: { $gte: 1 },
      expireDate: { $gt: now }
    },
    { $inc: { remainingLessons: -1 } },
    { new: true }
  ).lean()
  if (!updated) return null
  if (updated.remainingLessons === 0) {
    await StudentProduct.updateOne({ _id: spId }, { $set: { isActive: false } })
  }
  return updated
}

module.exports = { pickStudentProductFIFO, deductOneLesson }