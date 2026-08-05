'use strict'

/**
 * H3: requirePasswordChange 服务端守门
 *   - requirePasswordChange=true 用户调业务端点 → 403 require_password_change
 *   - 仅 /auth/change-password + /auth/me 放行
 */
require('./setup')
const request = require('supertest')
const { getApp, signAccessToken, asUser } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')
const User = require('@models/User.model')
const password = require('@utils/password')

describe('H3 requirePasswordChange 服务端门', () => {
  let fix
  beforeAll(async () => { fix = await makeFixture() })

  async function makeUserWithRequireChange() {
    return User.create({
      mobile: `139${Date.now().toString().slice(-8)}`,
      passwordHash: await password.hash('Temp1234!'),
      realName: '强制改密用户',
      isActive: true,
      requirePasswordChange: true
    })
  }

  it('requirePasswordChange=true 用户调 /students → 403 require_password_change', async () => {
    const u = await makeUserWithRequireChange()
    // 给他一个学生让他能调到 /students
    const client = asUser({ user: u, orgId: fix.orgA._id, studentId: fix.studentA1._id })
    const res = await client.get('/api/v1/students/me')
    expect(res.status).toBe(403)
    expect(res.body.data?.code).toBe('require_password_change')
  })

  it('requirePasswordChange=true 用户调 /auth/me 放行 (可拉自己资料)', async () => {
    const u = await makeUserWithRequireChange()
    const token = signAccessToken(u)
    const res = await request(getApp())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('requirePasswordChange=true 用户调 /auth/change-password 放行', async () => {
    const u = await makeUserWithRequireChange()
    const token = signAccessToken(u)
    const res = await request(getApp())
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'Temp1234!', newPassword: 'New1234!' })
    // 200 或 400 (字段校验), 都应该能进 (不返 require_password_change 403)
    expect(res.status).not.toBe(403)
  })

  it('requirePasswordChange=false 普通用户调业务端点正常', async () => {
    // fix.parentA 默认 requirePasswordChange=false
    const client = asUser({ user: fix.parentA, orgId: fix.orgA._id, studentId: fix.studentA1._id })
    const res = await client.get('/api/v1/course-enrollments/me')
    expect(res.status).not.toBe(403)
  })
})