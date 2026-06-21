'use strict'

const { CLIENT_LEVEL } = require('@shared/enums')

const DEFINITIONS = [
  {
    name: '管理员',
    isSystem: true,
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'user.read', 'user.write', 'user.resetPassword',
      'position.read', 'position.write',
      'student.read', 'student.write',
      'subject.read', 'subject.write',
      'courseProduct.read', 'courseProduct.write',
      'courseInstance.read', 'courseInstance.write',
      'courseEnrollment.read', 'courseEnrollment.write',
      'room.read', 'room.write',
      'lessonSchedule.read', 'lessonSchedule.write',
      'order.read', 'order.write', 'order.pay',
      'lessonAttendance.read', 'lessonAttendance.write',
      'studentWork.read', 'studentWork.write',
      'points.read', 'points.write', 'pet.read'
    ]
  },
  {
    name: '教务',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'student.read', 'student.write',
      'subject.read', 'subject.write',
      'courseProduct.read', 'courseProduct.write',
      'courseInstance.read', 'courseInstance.write',
      'courseEnrollment.read', 'courseEnrollment.write',
      'room.read', 'room.write',
      'lessonSchedule.read', 'lessonSchedule.write',
      'order.read', 'order.write', 'order.pay',
      'lessonAttendance.read',
      'studentWork.read',
      'points.read', 'points.write', 'pet.read'
    ]
  },
  {
    name: '老师',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'student.read',
      'courseInstance.read',
      'room.read',
      'lessonSchedule.read',
      'lessonAttendance.read', 'lessonAttendance.write',
      'studentWork.read', 'studentWork.write'
    ]
  },
  {
    name: '家长',
    clientLevel: CLIENT_LEVEL.BASIC,
    permissions: [
      'student.read',
      'lessonSchedule.read',
      'lessonAttendance.read',
      'studentWork.read', 'studentWork.write',
      'points.read', 'pet.read'
    ]
  },
  {
    name: '财务',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'order.read', 'order.write', 'order.pay',
      'student.read', 'studentProduct.read'
    ]
  }
]

async function run(org) {
  const { Position } = require('@models/Position.model')
  await Position.deleteMany({ org: org._id })
  const docs = await Position.insertMany(DEFINITIONS.map((d) => ({ ...d, org: org._id })))
  return docs
}

module.exports = { run }
