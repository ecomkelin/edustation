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
 * 用 findOneAndUpdate({ remainingLessons: { $gte: 1 } }, { $inc: { remainingLessons: -1 } })
 * 单文档原子操作，避免并发"读-改-写"竞态超扣。
 *
 * 返回值：扣减成功 → 更新后的对象；余额不足或产品不存在 → null
 * 当扣减到 0 时，额外把 isActive 置 false（与 LessonAttendance.service.complete 单条路径一致）。
 */
async function deductOneLesson(spId) {
  if (!spId) return null
  const updated = await StudentProduct.findOneAndUpdate(
    { _id: spId, remainingLessons: { $gte: 1 } },
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