'use strict'

/**
 * L1: 退款浮点容差统一到 1e-6
 *   - paidAmount=100, refund 100.01 → 422 (之前 0.01 容差会通过)
 *   - paidAmount=100, refund 100.0000001 → ok
 *   - 累计到 100.0000001 → status=refunded
 */
require('./setup')
const request = require('supertest')
const { getApp, signAccessToken } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')
const CourseProduct = require('@models/CourseProduct.model')
const StudentProduct = require('@models/StudentProduct.model')

async function setupPaidOrder(orgA, adminA, studentA1) {
  const sp = await CourseProduct.create({
    org: orgA._id, name: '退款测试课', courseType: 'regular',
    totalLessons: 10, validDays: 90, originalPrice: 110, currentPrice: 100,
    discountPrice: 100, promotionPrice: 100, isActive: true
  })
  const createRes = await request(getApp())
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${signAccessToken(adminA)}`)
    .set('x-org-id', String(orgA._id))
    .send({
      student: studentA1._id,
      items: [{ courseProduct: sp._id, quantity: 1 }],
      paymentMethod: 'cash',
      paidAmount: 100,
      actualPrice: 100
    })
    .expect(201)
  // 线下收款返回 { order, studentProducts }, 线上返回 order 对象
  const order = createRes.body.data.order || createRes.body.data
  return { sp, order }
}

describe('L1 退款浮点容差 1e-6', () => {
  let fix
  beforeEach(async () => { fix = await makeFixture() })

  it('paidAmount=100, refund 100.01 → 409 (容差收紧 → $expr 拒)', async () => {
    const { order } = await setupPaidOrder(fix.orgA, fix.adminA, fix.studentA1)
    const res = await request(getApp())
      .post(`/api/v1/orders/${order.id || order._id}/refund`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ amount: 100.01, reason: '多退 1 分测试' })
    // 100.01 > 100 (paidAmount) → $expr 不命中 → matchedCount=0 → 409
    // 注: 之前早期校验返 422, 现统一靠 $expr 守卫, 单笔超退也返 409
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/退款并发冲突|超出可退余额/)
  })

  it('paidAmount=100, refund 100.0000001 → ok (EPS 容差)', async () => {
    const { order } = await setupPaidOrder(fix.orgA, fix.adminA, fix.studentA1)
    const res = await request(getApp())
      .post(`/api/v1/orders/${order.id || order._id}/refund`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ amount: 100.0000001, reason: '浮点误差测试' })
    expect(res.status).toBe(200)
    // 注: 100.0000001 在 EPS=1e-6 范围内, $expr 通过, refundedAmount ≈ 100.0000001
    //   100 - 100.0000001 = -0.0000001, abs < 1e-5 算"退完" → refunded
    expect(res.body.data.order.status).toBe('refunded')
  })

  it('累计到精确 paidAmount → refunded (容差范围内)', async () => {
    const { order } = await setupPaidOrder(fix.orgA, fix.adminA, fix.studentA1)
    // 退 50.0000001 + 50.0000001 = 100.0000002 → 应转 refunded
    await request(getApp())
      .post(`/api/v1/orders/${order.id || order._id}/refund`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ amount: 50.0000001, reason: '部分退 1' })
      .expect(200)
    const res2 = await request(getApp())
      .post(`/api/v1/orders/${order.id || order._id}/refund`)
      .set('Authorization', `Bearer ${signAccessToken(fix.adminA)}`)
      .set('x-org-id', String(fix.orgA._id))
      .send({ amount: 50.0000001, reason: '部分退 2' })
      .expect(200)
    expect(res2.body.data.order.status).toBe('refunded')
  })
})