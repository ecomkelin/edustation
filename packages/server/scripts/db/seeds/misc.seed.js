'use strict'

const PointsAccount = require('@models/PointsAccount.model')
const Pet = require('@models/Pet.model')
const { PET_TYPES } = require('@shared/enums')

async function run(ctx) {
  const { org, students } = ctx

  await PointsAccount.deleteMany({ org: org._id })
  await PointsAccount.insertMany(
    students.map((s) => ({ org: org._id, student: s._id, balance: 100 }))
  )

  await Pet.deleteMany({ org: org._id })
  await Pet.insertMany(
    students.map((s, i) => ({
      org: org._id,
      student: s._id,
      petType: PET_TYPES[i % PET_TYPES.length],
      level: 1,
      experience: 0,
      nickname: `${s.name}的小宠物`
    }))
  )
}

module.exports = { run }
