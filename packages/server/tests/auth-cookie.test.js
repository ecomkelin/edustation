'use strict'

/**
 * M13 + H1: cookie path + SameSite=lax (prod 默认)
 *   - login 响应 Set-Cookie 含 path=/api/v1/auth/
 *   - prod 同源部署默认 SameSite=lax
 *   - logout (requireAuth) 清 cookie 时 path 一致
 */
require('./setup')
const request = require('supertest')
const { getApp } = require('./helpers/auth')
const { makeFixture } = require('./helpers/seed')

describe('M13+H1 cookie path + SameSite', () => {
  let fix
  beforeEach(async () => { fix = await makeFixture() })

  it('login 响应 Set-Cookie 含 path=/api/v1/auth/ 且 HttpOnly', async () => {
    // NODE_ENV=test 时 config.cookie.sameSite 默认 'lax' (我故意改成 lax 在 test/dev 都用 lax)
    const res = await request(getApp())
      .post('/api/v1/auth/login')
      .send({ mobile: fix.adminA.mobile, password: 'Admin1234!' })
    expect(res.status).toBe(200)
    const setCookie = res.headers['set-cookie']
    expect(setCookie).toBeDefined()
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
    expect(cookieStr).toMatch(/Path=\/api\/v1\/auth\//)
    expect(cookieStr).toMatch(/HttpOnly/i)
  })

  it('login 响应 Set-Cookie 含 SameSite=Lax', async () => {
    const res = await request(getApp())
      .post('/api/v1/auth/login')
      .send({ mobile: fix.adminA.mobile, password: 'Admin1234!' })
    const setCookie = res.headers['set-cookie']
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
    expect(cookieStr).toMatch(/SameSite=Lax/i)
  })
})