'use strict'

/**
 * 测试数据工厂: 快速建 Org / User / Position / Student / 关联关系.
 * 返回所有 _id 供测试用例组装请求.
 */

const Org = require('@models/Org.model')
const User = require('@models/User.model')
const Position = require('@models/Position.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Student = require('@models/Student.model')
// 延迟 require password 让 helpers 加载不强制触发更多 @config/db 依赖链
let _password
async function password() {
  if (!_password) _password = require('@utils/password')
  return _password
}

let counter = 0
function uniq() {
  counter += 1
  return Date.now().toString(36) + counter.toString(36)
}

async function makeOrg(overrides = {}) {
  const tag = uniq()
  return Org.create({
    name: `org-${tag}`,
    nameAbbreviation: `org-${tag}`.slice(0, 16), // 必须 unique; 取 16 字符避免碰撞
    unicode: `unicode-${tag}`,
    type: 'arts',
    isActive: true,
    ...overrides
  })
}

async function makeUser({ pwd = 'Pass1234!', requirePasswordChange = false, isActive = true, ...rest } = {}) {
  const mobile = rest.mobile || `138${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 100)}`.slice(0, 11)
  const pwdUtil = await password()
  return User.create({
    mobile,
    passwordHash: await pwdUtil.hash(pwd),
    realName: rest.realName || '测试用户',
    isActive,
    requirePasswordChange,
    isPlatformAdmin: !!rest.isPlatformAdmin,
    ...rest
  })
}

async function makePosition(orgId, { permissions = ['student.read'], name = 'staff' } = {}) {
  return Position.create({
    org: orgId,
    name: `${name}-${uniq()}`,
    permissions,
    clientLevel: 0
  })
}

async function makeRel(userId, orgId, { positions = [], isMain = true } = {}) {
  return UserOrgRel.create({ user: userId, org: orgId, positions, isMain })
}

async function makeStudent(orgId, { guardians = [], ...rest } = {}) {
  return Student.create({
    org: orgId,
    name: rest.name || `kid-${uniq()}`,
    isActive: true,
    guardians,
    ...rest
  })
}

/**
 * 一站式: 建 org + admin(user + position + rel) + 普通员工 + student + 监护关系
 * 返回 ids 与密码
 */
async function makeFixture() {
  const orgA = await makeOrg({ name: `orgA-${uniq()}` })
  const orgB = await makeOrg({ name: `orgB-${uniq()}` })

  // 平台超管 (跨机构)
  const platformAdmin = await makeUser({ isPlatformAdmin: true })

  // orgA 管理员
  const adminPwd = 'Admin1234!'
  const adminA = await makeUser({ pwd: adminPwd, realName: 'orgA管理员' })
  const adminPosition = await makePosition(orgA._id, {
    name: '管理员',
    permissions: ['student.write', 'student.read', 'order.write', 'order.read', 'order.pay', 'order.delete',
      'studentProduct.gift', 'task.write', 'task.read', 'task.delete',
      'user.write', 'user.resetPassword',
      'lessonSchedule.write', 'lessonSchedule.read',
      'accessControl.write', 'accessControl.read', 'accessControl.pickup',
      'position.write',
      'finance.write', 'finance.read',
      'points.write', 'points.read',
      'pet.write', 'pet.read',
      'recruit.write', 'recruit.read',
      'lessonAttendance.write', 'lessonAttendance.read',
      'studentWork.write', 'studentWork.read',
      'studentProduct.write', 'studentProduct.read',
      'courseProduct.write', 'courseProduct.read',
      'courseInstance.write', 'courseInstance.read',
      'courseEnrollment.write', 'courseEnrollment.read',
      'org-promotion.write', 'org-promotion.read',
      'subject.write', 'subject.read',
      'room.write', 'room.read',
      'category.write', 'category.read',
      'legal.write', 'legal.read',
      'storage.write', 'storage.read',
      'report.read',
      'agent.write', 'agent.read']
  })
  await makeRel(adminA._id, orgA._id, { positions: [adminPosition._id] })

  // 家长 (orgA 下)
  const parentA = await makeUser({ pwd: 'Parent1234!', realName: '家长A' })
  const parentPosition = await makePosition(orgA._id, {
    name: '家长',
    permissions: ['student.read'],
    clientLevel: 1
  })
  await makeRel(parentA._id, orgA._id, { positions: [parentPosition._id] })

  // 学生 (orgA 下, 归属于 parentA)
  const studentA1 = await makeStudent(orgA._id, { guardians: [parentA._id], name: '张小明' })
  const studentA2 = await makeStudent(orgA._id, { guardians: [parentA._id], name: '张小红' })

  // 别人家的家长 + 别人家的学生 (orgA 下, 但不属于 parentA)
  const parentB = await makeUser({ pwd: 'Parent1234!', realName: '家长B' })
  await makeRel(parentB._id, orgA._id, { positions: [parentPosition._id] })
  const studentA3 = await makeStudent(orgA._id, { guardians: [parentB._id], name: '别人家孩子' })

  return {
    orgA, orgB, platformAdmin, adminA, adminPwd, parentA, parentB,
    studentA1, studentA2, studentA3, // A1/A2 是 parentA 的孩子, A3 是 parentB 的孩子
    adminPosition
  }
}

module.exports = {
  makeOrg, makeUser, makePosition, makeRel, makeStudent,
  makeFixture, uniq
}