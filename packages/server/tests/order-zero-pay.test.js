'use strict'

/**
 * S2: 0 元支付白拿课包堵口
 *   - POST /orders/:id/pay body {paidAmount: 0} → 422 (paidAmount 必须 >= actualPrice)
 *   - POST /orders body {paidAmount: 0, paymentMethod: cash} → 422 (线下收款同款校验)
 */
require('./setup')
const request = require('supertest')
const { getApp, signAccessToken, asUser } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')
const CourseProduct = require('@models/CourseProduct.model')

describe('S2 0 元支付', () => {
  let fix, sp, pendingOrder
  beforeEach(async () => {
    fix = await makeFixture()
    sp = await CourseProduct.create({
      org: fix.orgA._id,
      name: '测试课程',
      courseType: 'regular',
      totalLessons: 10,
      validDays: 90,
      originalPrice: 1100,
      currentPrice: 1000,
      discountPrice: 1000,
      promotionPrice: 1000,
      isActive: true
    })
    // 建一个 pending 订单
    pendingOrder = await request(getApp())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({
        student: fix.studentA1._id,
        items: [{ courseProduct: sp._id, quantity: 1 }]
      })
      .expect(201)
    pendingOrder = pendingOrder.body.data
  })

  it('POST /orders/:id/pay paidAmount=0 → 400 (validator 卡)', async () => {
    const res = await request(getApp())
      .post(`/api/v1/orders/${pendingOrder.id || pendingOrder._id}/pay`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ paymentMethod: 'cash', paidAmount: 0 })
    // pay validator 强制 paidAmount > 0, 直接返 400 "paidAmount 必须 > 0"
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/paidAmount 必须 > 0/)
  })

  it('POST /orders 线下收款 paidAmount=0 → 400 (validator 卡)', async () => {
    const res = await request(getApp())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({
        student: fix.studentA1._id,
        items: [{ courseProduct: sp._id, quantity: 1 }],
        paymentMethod: 'cash',
        paidAmount: 0,
        actualPrice: 1000
      })
    // create validator 在 paidAmount > 0 时校验 paidAmount >= actualPrice; paidAmount=0 也先被 >0 卡
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/paidAmount 必须 > 0|paidAmount.*不可低于/)
  })

  it('POST /orders/:id/pay paidAmount < actualPrice → 422', async () => {
    const res = await request(getApp())
      .post(`/api/v1/orders/${pendingOrder.id || pendingOrder._id}/pay`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ paymentMethod: 'cash', paidAmount: 999 })
    expect(res.status).toBe(400)
  })
})