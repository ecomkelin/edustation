'use strict'

/**
 * H9: 退款并发乐观锁
 *   - 两笔 refund 并发 (paidAmount=1000, 各退 600) → 一笔成功一笔 409
 *   - 之前 last-write-wins 会导致累计退 1200; 现在 refundedAmount 旧值守卫撞键
 */
require('./setup')
const request = require('supertest')
const { getApp, signAccessToken } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')
const CourseProduct = require('@models/CourseProduct.model')

async function setupPaidOrder(orgA, adminA, studentA1, paidAmount = 1000) {
  const sp = await CourseProduct.create({
    org: orgA._id, name: '并发退款测试', courseType: 'regular',
    totalLessons: 10, validDays: 90, originalPrice: paidAmount + 100, currentPrice: paidAmount,
    discountPrice: paidAmount, promotionPrice: paidAmount, isActive: true
  })
  const res = await request(getApp())
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${signAccessToken(adminA)}`)
    .set('x-org-id', String(orgA._id))
    .send({
      student: studentA1._id,
      items: [{ courseProduct: sp._id, quantity: 1 }],
      paymentMethod: 'cash',
      paidAmount,
      actualPrice: paidAmount
    })
    .expect(201)
  return res.body.data.order || res.body.data
}

describe('H9 退款并发乐观锁', () => {
  let fix
  beforeEach(async () => { fix = await makeFixture() })

  it('两笔 refund 并发 (各 600 / paidAmount 1000) → 一笔 200 一笔 409', async () => {
    const order = await setupPaidOrder(fix.orgA, fix.adminA, fix.studentA1, 1000)
    const token = signAccessToken(fix.adminA)
    const fire = (amount) => request(getApp())
      .post(`/api/v1/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ amount, reason: '并发退款测试' })

    const [resA, resB] = await Promise.all([fire(600), fire(600)])
    // eslint-disable-next-line no-console
    console.log('[debug] concurrent 600+600:', resA.status, resB.status)
    // 至少一笔应成功 (200), 至少一笔应被乐观锁拒 (409)
    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([200, 409])
    // 累计退款金额 = 600, 不会超 1000
    const finalRes = await request(getApp())
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-org-id', String(fix.orgA._id))
    expect(finalRes.body.data.refundedAmount).toBe(600)
  })

  it('两笔 refund 各 400 → 都应成功 (累计 800 < 1000)', async () => {
    const order = await setupPaidOrder(fix.orgA, fix.adminA, fix.studentA1, 1000)
    const token = signAccessToken(fix.adminA)
    const fire = (amount) => request(getApp())
      .post(`/api/v1/orders/${order._id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ amount, reason: '合法累计' })

    const [resA, resB] = await Promise.all([fire(400), fire(400)])
    // 两笔乐观锁错开 (第二笔看到 400, 第一笔已 OK 写入 400) → 都应成功
    expect([resA.status, resB.status].sort()).toEqual([200, 200])
  })
})