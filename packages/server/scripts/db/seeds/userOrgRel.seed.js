'use strict'

const UserOrgRel = require('@models/UserOrgRel.model')

// 根据 mobile 前缀区分角色
function roleOf(user) {
  if (user.mobile.startsWith('13800000001')) return 'admin'
  if (user.mobile.startsWith('13800000002')) return 'staff'
  if (user.mobile.startsWith('138')) return 'teacher' // 13800000003~05
  if (user.mobile.startsWith('139')) return 'parent'
  return 'other'
}

async function run(ctx) {
  const { org, users, positions } = ctx
  await UserOrgRel.deleteMany({ org: org._id })

  const findPos = (name) => positions.find((p) => p.name === name)
  const admin = findPos('管理员')
  const jw = findPos('教务')
  const teacher = findPos('老师')
  const parent = findPos('家长')

  const rels = []
  for (const u of users) {
    const role = roleOf(u)
    let pos = []
    let isMain = false
    if (role === 'admin') pos = [admin._id]
    else if (role === 'staff') pos = [jw._id]
    else if (role === 'teacher') pos = [teacher._id]
    else if (role === 'parent') { pos = [parent._id]; isMain = true }

    rels.push({ user: u._id, org: org._id, positions: pos, isMain })
  }
  await UserOrgRel.insertMany(rels)
}

module.exports = { run }
