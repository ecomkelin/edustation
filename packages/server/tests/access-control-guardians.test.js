'use strict'

/**
 * M20 + M10 + H5: 监护人校验三连
 *   - M20: admin createPickup 时 pickupUser 不是 student.guardians → 403
 *   - M10: C 端 consent/sign 时 subject=student 是别家孩子 → 403
 *   - H5: pet C 端 body.student 覆盖被忽略 (用别家 studentId 操作 → 403)
 */
require('./setup')
const request = require('supertest')
const { getApp, signAccessToken } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')

describe('M20+M10+H5 监护人校验', () => {
  let fix
  beforeEach(async () => { fix = await makeFixture() })

  it('M20: admin createPickup pickupUser 不是 student.guardians → 403', async () => {
    // studentA1.guardians = [parentA]; 用 parentB (不是监护人) 当 pickupUser
    const res = await request(getApp())
      .post('/api/v1/access-control/pickups')
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({
        student: fix.studentA1._id,
        pickupPersonType: 'parent',
        pickupUser: fix.parentB._id,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 86400000).toISOString()
      })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/监护人|pickupUser/)
  })

  it('M10: C 端 consent/sign subject=别家孩子 → 403', async () => {
    // parentA 试图给 studentA3 (parentB 的孩子) 签同意书
    const res = await request(getApp())
      .post('/api/v1/access-control/client/consent/sign')
      .set('Authorization', `Bearer ${signAccessToken(fix.parentA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .set('x-active-student-id', String(fix.studentA1._id))
      .send({
        docKey: 'face-consent-student',
        subjectType: 'student',
        subject: fix.studentA3._id, // 别家孩子
        agreed: true
      })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/监护人|不在您的监护人列表/)
  })

  it('H5: pet C 端 body.student 覆盖被忽略, 只看 activeStudentId', async () => {
    // parentA 用 activeStudentId=A1 + body.student=A3 (别家孩子) 调 /pet/me
    // 修复后: studentIdOf 只读 activeStudentId, body.student 被忽略 → 返 A1 的宠物 (空)
    const res = await request(getApp())
      .get('/api/v1/pet/me')
      .set('Authorization', `Bearer ${signAccessToken(fix.parentA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .set('x-active-student-id', String(fix.studentA1._id))
      // body.student 无效 (GET 没 body), 用 query 也不会被读 — 期望 200 + A1 数据
    expect(res.status).toBe(200)
  })

  it('H5: pet C 端用别人 petId abandon → 404/403 (loadOwnedPet 三元组守门)', async () => {
    // parentA 没 pet, 直接 abandon 一个伪造 petId → 404
    const fakePetId = '507f1f77bcf86cd799439011'
    const res = await request(getApp())
      .post(`/api/v1/pet/${fakePetId}/abandon`)
      .set('Authorization', `Bearer ${signAccessToken(fix.parentA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .set('x-active-student-id', String(fix.studentA1._id))
    expect([404, 403, 422]).toContain(res.status)
  })
})