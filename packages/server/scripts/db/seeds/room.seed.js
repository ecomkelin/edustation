'use strict'

const Room = require('@models/Room.model')

const DEFINITIONS = [
  { name: '101 教室', capacity: 12, location: '1 楼东' },
  { name: '102 教室', capacity: 15, location: '1 楼西' },
  { name: '201 教室', capacity: 8, location: '2 楼北' }
]

async function run(org) {
  await Room.deleteMany({ org: org._id })
  return Room.insertMany(DEFINITIONS.map((r) => ({ ...r, org: org._id, isActive: true })))
}

module.exports = { run }
