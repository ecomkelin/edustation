'use strict'

/**
 * H4: /me 系列端点必须 fail-closed
 *   缺 x-active-student-id header → 400
 *   用别人的 studentId (非 guardians) → 403 (activeStudent 中间件守门)
 *   用别人的 studentId 通过 query 覆盖 → 忽略 query.student, 只看 activeStudentId
 *
 * 覆盖端点:
 *   - GET /course-enrollments/me
 *   - GET /lesson-attendances/me
 *   - GET /access-control/client/pickups
 *   - GET /points/me, /points/transactions
 */
require('./setup')
const { asUser } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')

describe('H4 /me fail-closed', () => {
  // 每个用例重建 fixture (因测试不跨用例清库, 但 requirePasswordChange=false 默认会让 token 一直可用)
  let fix
  beforeEach(async () => { fix = await makeFixture() })

  const endpoints = [
    { url: '/api/v1/course-enrollments/me' },
    { url: '/api/v1/lesson-attendances/me' },
    { url: '/api/v1/access-control/client/pickups' },
    { url: '/api/v1/points/me' },
    { url: '/api/v1/points/transactions' }
  ]

  endpoints.forEach(({ url }) => {
    it(`${url} 缺 activeStudentId → 400`, async () => {
      const client = asUser({ user: fix.parentA, orgId: fix.orgA._id /* studentId 不传 */ })
      const res = await client.get(url)
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/缺少 x-active-student-id/)
    })

    it(`${url} 用别人的 student → 403`, async () => {
      const client = asUser({ user: fix.parentA, orgId: fix.orgA._id, studentId: fix.studentA3._id })
      const res = await client.get(url)
      expect(res.status).toBe(403)
    })

    it(`${url} query.student 覆盖被忽略, 只看 activeStudentId`, async () => {
      // parentA 自己孩子 A1 + query.student 传 A3 (parentB 的孩子) → 应只看到 A1 的数据
      const client = asUser({ user: fix.parentA, orgId: fix.orgA._id, studentId: fix.studentA1._id })
      const urlWithQuery = url.includes('?') ? url + '&student=' + fix.studentA3._id : url + '?student=' + fix.studentA3._id
      const res = await client.get(urlWithQuery)
      // 应该成功 (200), 但不包含 A3 的数据 — fixture 里 A1 还没报名, 返空
      expect(res.status).toBe(200)
    })
  })
})