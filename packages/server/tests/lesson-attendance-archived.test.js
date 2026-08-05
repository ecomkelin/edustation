'use strict'

/**
 * M2 + M3 + L8: lessonAttendance 写操作约束
 *   - M2: archive 后 complete/checkIn/markStatus/makeup/bulkMark 返 422
 *   - M3: bulkMark 把 madeup 翻 leave → 400
 *   - L8: markStatus leave/no_show 清 studentProduct (后续报表准确)
 */
require('./setup')
const request = require('supertest')
const { getApp, signAccessToken } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')
const LessonAttendance = require('@models/LessonAttendance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const CourseInstance = require('@models/CourseInstance.model')
const CourseProduct = require('@models/CourseProduct.model')
const StudentProduct = require('@models/StudentProduct.model')
const Room = require('@models/Room.model')
const { AttendanceStatus, LessonScheduleStatus } = require('@shared/enums')

async function setupAttendanceFixture(fix) {
  // 建 CourseProduct + CourseInstance + Room + LessonSchedule + StudentProduct + LessonAttendance
  const cp = await CourseProduct.create({
    org: fix.orgA._id, name: '考勤测试', courseType: 'regular',
    totalLessons: 10, validDays: 90, originalPrice: 1100, currentPrice: 1000,
    discountPrice: 1000, promotionPrice: 1000, isActive: true
  })
  const room = await Room.create({ org: fix.orgA._id, name: '教室1', isActive: true })
  const ci = await CourseInstance.create({
    org: fix.orgA._id, courseProduct: cp._id, acceptedCourseProducts: [cp._id],
    name: '考勤班', status: 'active', room: room._id,
    startDate: new Date(),
    schedulePlan: { mode: 'weekly', totalPlannedLessons: 5 }
  })
  const schedule = await LessonSchedule.create({
    org: fix.orgA._id, courseInstance: ci._id,
    teacher: fix.adminA._id, room: room._id,
    lessonNo: 1, title: '第1节',
    plannedStartTime: new Date(Date.now() + 3600000),
    plannedEndTime: new Date(Date.now() + 7200000),
    status: LessonScheduleStatus.IN_PROGRESS
  })
  const sp = await StudentProduct.create({
    org: fix.orgA._id, student: fix.studentA1._id, courseProduct: cp._id,
    source: 'gift', totalLessons: 10, remainingLessons: 10,
    expireDate: new Date(Date.now() + 90 * 86400000), isActive: true,
    giftReason: '测试', giftedBy: fix.adminA._id
  })
  const att = await LessonAttendance.create({
    org: fix.orgA._id, lessonSchedule: schedule._id,
    student: fix.studentA1._id, studentProduct: sp._id,
    status: AttendanceStatus.SCHEDULED
  })
  return { cp, room, ci, schedule, sp, att }
}

describe('M2+M3+L8 lessonAttendance 写操作约束', () => {
  let fix
  beforeEach(async () => { fix = await makeFixture() })

  it('M2: archive 后 complete → 422', async () => {
    const { att } = await setupAttendanceFixture(fix)
    await LessonAttendance.updateOne({ _id: att._id }, { $set: { archived: true } })
    const res = await request(getApp())
      .put(`/api/v1/lesson-attendances/${att._id}/complete`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({})
    expect(res.status).toBe(422)
    expect(res.body.message).toMatch(/已归档/)
  })

  it('M2: archive 后 checkIn → 422', async () => {
    const { att } = await setupAttendanceFixture(fix)
    await LessonAttendance.updateOne({ _id: att._id }, { $set: { archived: true } })
    const res = await request(getApp())
      .post('/api/v1/lesson-attendances/check-in')
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ lessonSchedule: att.lessonSchedule, student: fix.studentA1._id })
    expect(res.status).toBe(422)
  })

  it('M2: archive 后 markStatus (no_show) → 422', async () => {
    const { att } = await setupAttendanceFixture(fix)
    await LessonAttendance.updateOne({ _id: att._id }, { $set: { archived: true } })
    const res = await request(getApp())
      .put(`/api/v1/lesson-attendances/${att._id}/no-show`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({})
    expect(res.status).toBe(422)
  })

  it('M3: bulkMark 把 madeup 翻 leave → 400 (终态锁)', async () => {
    const { att, schedule } = await setupAttendanceFixture(fix)
    // 把考勤设为 madeup (已补课)
    await LessonAttendance.updateOne({ _id: att._id }, { $set: { status: AttendanceStatus.MADEUP } })
    const res = await request(getApp())
      .post('/api/v1/lesson-attendances/bulk-mark')
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({
        lessonSchedule: schedule._id,
        items: [{ attendance: att._id, status: AttendanceStatus.LEAVE }]
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/已完成消课.*已补课.*不可再修改/)
  })

  it('L8: markStatus leave 清 studentProduct', async () => {
    const { att } = await setupAttendanceFixture(fix)
    // att 当前 status=scheduled, studentProduct 已绑; markStatus → leave 应清空
    const res = await request(getApp())
      .put(`/api/v1/lesson-attendances/${att._id}/no-show`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({})
    expect(res.status).toBe(200)
    const fresh = await LessonAttendance.findById(att._id).lean()
    expect(fresh.studentProduct).toBeNull()
  })
})