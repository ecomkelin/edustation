'use strict'

/**
 * H12 + H13 + M7: lessonSchedule 互锁 + 冲突检测 + teacher org 校验
 *   - H12: 有 checked_in/no_show/leave 三态考勤时 removable-check 返 canRemove=false
 *   - H13: detectConflict 在 PREPARING 状态也命中 (老师不能双预订)
 *   - M7: teacher 不在本机构 → 创建排课被拒
 */
require('./setup')
const request = require('supertest')
const { getApp, signAccessToken } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')
const LessonAttendance = require('@models/LessonAttendance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const CourseInstance = require('@models/CourseInstance.model')
const CourseProduct = require('@models/CourseProduct.model')
const Room = require('@models/Room.model')
const { AttendanceStatus, LessonScheduleStatus } = require('@shared/enums')

async function setupFixture(fix) {
  const cp = await CourseProduct.create({
    org: fix.orgA._id, name: '互锁测试', courseType: 'regular',
    totalLessons: 10, validDays: 90, originalPrice: 1100, currentPrice: 1000,
    discountPrice: 1000, promotionPrice: 1000, isActive: true
  })
  const room = await Room.create({ org: fix.orgA._id, name: '教室1', isActive: true })
  const ci = await CourseInstance.create({
    org: fix.orgA._id, courseProduct: cp._id, acceptedCourseProducts: [cp._id],
    name: '互锁班', status: 'active', room: room._id, startDate: new Date(),
    schedulePlan: { mode: 'weekly', totalPlannedLessons: 5 }
  })
  return { cp, room, ci }
}

describe('H12+H13+M7 lessonSchedule', () => {
  let fix
  beforeEach(async () => { fix = await makeFixture() })

  it('H12: 有 checked_in 考勤时 removable-check 返 canRemove=false', async () => {
    const { cp, room, ci } = await setupFixture(fix)
    const start = new Date(Date.now() + 3600000)
    const schedule = await LessonSchedule.create({
      org: fix.orgA._id, courseInstance: ci._id,
      teacher: fix.adminA._id, room: room._id,
      lessonNo: 1, title: '第1节',
      plannedStartTime: start, plannedEndTime: new Date(start.getTime() + 3600000),
      status: LessonScheduleStatus.SCHEDULED
    })
    await LessonAttendance.create({
      org: fix.orgA._id, lessonSchedule: schedule._id,
      student: fix.studentA1._id, status: AttendanceStatus.CHECKED_IN
    })
    const res = await request(getApp())
      .get(`/api/v1/lesson-schedules/${schedule._id}/removable-check`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
    expect(res.status).toBe(200)
    expect(res.body.data.canRemove).toBe(false)
    // blockers 应含三态考勤条目
    const labels = (res.body.data.blockers || []).map((b) => b.label).join(',')
    expect(labels).toMatch(/签到|缺席|请假|考勤/)
  })

  it('H13: PREPARING 状态排课仍能被冲突检测命中 (创建第二条同老师同时段 → 422)', async () => {
    const { ci, room } = await setupFixture(fix)
    // 1) 已有一个 preparing 状态的排课 (老师 adminA, 明天 9:00-10:00)
    const start1 = new Date(Date.now() + 86400000)
    start1.setHours(9, 0, 0, 0)
    const end1 = new Date(start1.getTime() + 3600000)
    await LessonSchedule.create({
      org: fix.orgA._id, courseInstance: ci._id,
      teacher: fix.adminA._id, room: room._id,
      lessonNo: 1, title: '已准备上课的课',
      plannedStartTime: start1, plannedEndTime: end1,
      status: LessonScheduleStatus.PREPARING
    })
    // 2) 创建第二条同老师同时段 → detectConflict 命中 PREPARING → 422
    const res = await request(getApp())
      .post('/api/v1/lesson-schedules')
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({
        courseInstance: ci._id,
        teacher: fix.adminA._id,
        room: room._id,
        lessonNo: 2,
        plannedStartTime: start1.toISOString(),
        plannedEndTime: end1.toISOString()
      })
    expect(res.status).toBe(422)
    expect(res.body.message).toMatch(/该老师在此时间段已有排课|该教室在此时间段已被占用/)
  })

  it('M7: teacher 不在本机构 → 创建排课被拒', async () => {
    const { ci, room } = await setupFixture(fix)
    // orgB 的员工 (不属 orgA) 当 teacher
    const orgBStaff = await (require('@models/User.model')).create({
      mobile: `139${Date.now().toString().slice(-8)}`,
      passwordHash: await require('@utils/password').hash('x'),
      realName: 'orgB员工', isActive: true
    })
    const start = new Date(Date.now() + 86400000)
    const res = await request(getApp())
      .post('/api/v1/lesson-schedules')
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({
        courseInstance: ci._id,
        teacher: orgBStaff._id,
        room: room._id,
        lessonNo: 2,
        plannedStartTime: start.toISOString(),
        plannedEndTime: new Date(start.getTime() + 3600000).toISOString()
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/teacher 不属于本机构/)
  })
})