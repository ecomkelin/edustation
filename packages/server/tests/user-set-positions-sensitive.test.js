'use strict'

/**
 * M17: setPositions 不绕过敏感权限闸门
 *   - 普通管理员 (非超管) setPositions 到含 pet.write 的 position → 403
 *   - 即使该 position 是超管预先在本机构建的
 */
require('./setup')
const request = require('supertest')
const { getApp, signAccessToken } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')
const Position = require('@models/Position.model')

describe('M17 setPositions sensitive 闸门', () => {
  let fix
  beforeEach(async () => { fix = await makeFixture() })

  it('普通管理员 setPositions 到含 pet.write 的 position → 403', async () => {
    // 模拟超管预先在本机构建一个含 sensitive 权限的 position
    const sensitivePos = await Position.create({
      org: fix.orgA._id,
      name: '内容主编(敏感)',
      permissions: ['pet.write', 'article.write'],
      clientLevel: 0
    })
    // 普通管理员 (adminA, 非 platformAdmin) 试图把自己 setPositions 到 sensitivePos
    const res = await request(getApp())
      .put(`/api/v1/users/${fix.adminA._id}/positions`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ positions: [sensitivePos._id] })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/敏感权限|pet\.write|article\.write/)
  })

  it('普通管理员 setPositions 到普通 position (无 sensitive) → ok', async () => {
    const normalPos = await Position.create({
      org: fix.orgA._id,
      name: '普通岗',
      permissions: ['student.read'],
      clientLevel: 0
    })
    const res = await request(getApp())
      .put(`/api/v1/users/${fix.adminA._id}/positions`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ positions: [normalPos._id] })
    expect(res.status).toBe(200)
  })
})