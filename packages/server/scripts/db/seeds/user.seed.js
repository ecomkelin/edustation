'use strict'

const User = require('@models/User.model')
const password = require('@utils/password')
const config = require('@config/index')

async function runPlatformAdmin() {
  await User.deleteMany({ mobile: '13800000000' })
  const hash = await password.hash(config.seed.defaultPassword)
  return User.create({
    mobile: '13800000000',
    passwordHash: hash,
    realName: '平台超管',
    isPlatformAdmin: true
  })
}

async function runOrgUsers() {
  const list = [
    { mobile: '13800000001', realName: '李管理', role: 'admin' },
    { mobile: '13800000002', realName: '王教务', role: 'staff' },
    { mobile: '13800000003', realName: '张老师', role: 'teacher' },
    { mobile: '13800000004', realName: '陈老师', role: 'teacher' },
    { mobile: '13800000005', realName: '刘老师', role: 'teacher' },
    { mobile: '13900000001', realName: '家长-赵', role: 'parent' },
    { mobile: '13900000002', realName: '家长-钱', role: 'parent' },
    { mobile: '13900000003', realName: '家长-孙', role: 'parent' },
    { mobile: '13900000004', realName: '家长-李', role: 'parent' }
  ]
  await User.deleteMany({ mobile: { $in: list.map((u) => u.mobile) } })
  const hash = await password.hash(config.seed.defaultPassword)
  const docs = await User.insertMany(
    list.map((u) => ({ ...u, passwordHash: hash, isActive: true }))
  )
  return docs
}

module.exports = { runPlatformAdmin, runOrgUsers }
