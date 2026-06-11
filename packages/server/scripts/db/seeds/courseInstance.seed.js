'use strict'

const CourseInstance = require('@models/CourseInstance.model')

async function run(ctx) {
  const { org, courseProducts, users, rooms } = ctx
  await CourseInstance.deleteMany({ org: org._id })

  const teachers = users.filter((u) => /^1380000000[3-5]$/.test(u.mobile))
  const docs = courseProducts.slice(0, 3).map((p, i) => ({
    org: org._id,
    courseProduct: p._id,
    teacher: teachers[i % teachers.length]._id,
    room: rooms[i % rooms.length]._id,
    startDate: new Date(),
    maxStudents: 10,
    status: 'active'
  }))
  return CourseInstance.insertMany(docs)
}

module.exports = { run }
