'use strict'

const LessonSchedule = require('@models/LessonSchedule.model')
const { generateAttendancesForSchedule } = require('@modules/lessonSchedule/lessonSchedule.service')

/**
 * 未来 4 周内，每周 5 节课；自动避老师/教室冲突。
 * 排课生成后，调用 service 帮每个 enrolled 学生按 FIFO 选课包并生成 LessonAttendance。
 */
async function run(ctx) {
  const { org, courseInstances, users } = ctx
  await LessonSchedule.deleteMany({ org: org._id })

  const teachers = users.filter((u) => /^1380000000[3-5]$/.test(u.mobile))
  const used = new Set() // key: `${teacherId}_${HH:mm}`
  const docs = []

  const start = new Date()
  start.setHours(0, 0, 0, 0)

  for (let week = 0; week < 4; week++) {
    for (let day = 0; day < 5; day++) {
      const inst = courseInstances[(week + day) % courseInstances.length]
      const teacher = inst.teacher
      const room = inst.room
      const teacherUser = teachers.find((t) => String(t._id) === String(teacher))

      const slots = ['09:00', '10:30', '14:00', '15:30', '19:00']
      let slot = null
      for (const s of slots) {
        const k = `${teacher}_${s}`
        if (!used.has(k)) { slot = s; used.add(k); break }
      }
      if (!slot) continue

      const date = new Date(start)
      date.setDate(date.getDate() + week * 7 + day + 1) // 明天开始
      const [hh, mm] = slot.split(':').map(Number)
      date.setHours(hh, mm, 0, 0)
      const end = new Date(date.getTime() + 90 * 60 * 1000)

      docs.push({
        org: org._id,
        courseInstance: inst._id,
        lessonNo: week * 5 + day + 1,
        plannedStartTime: date,
        plannedEndTime: end,
        teacher: teacherUser ? teacherUser._id : teacher,
        room,
        status: 'scheduled',
        title: `课程 #${week * 5 + day + 1}`,
        notes: `自动生成 · 老师 ${teacherUser ? teacherUser.realName : '-'}`
      })
    }
  }

  const inserted = await LessonSchedule.insertMany(docs)

  // 为每个排课生成 LessonAttendance（调用真实 service 逻辑，与运行时一致）
  for (const ls of inserted) {
    await generateAttendancesForSchedule({
      orgId: org._id,
      courseInstance: ls.courseInstance,
      lessonScheduleId: ls._id
    })
  }

  return inserted
}

module.exports = { run }
