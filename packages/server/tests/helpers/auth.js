'use strict'

/**
 * 测试用 supertest 包装: 自动带上 x-org-id / x-active-student-id / Authorization
 */

const request = require('supertest')
const JwtUtil = require('@utils/JwtUtil')

// 关键: 不在 helpers 加载时 require('@app/app'),
//   否则 setup-env 阶段 setup.js beforeAll 还没注入真 MONGODB_URI,
//   config/index 已被 helpers 链同步 require, db.uri 锁为 placeholder, 后续改 env 也不生效.
//   改为在 asUser() 调用时才 lazy require, 此时 beforeAll 已让 setup.js 注完真 URI.
let _app
function getApp() {
  if (!_app) _app = require('@app/app').createApp()
  return _app
}

/**
 * 生成 access token 用于 Authorization: Bearer
 */
function signAccessToken(user) {
  return JwtUtil.signAccessToken({ userId: String(user._id) })
}

/**
 * 标准 GET/POST/PUT/PATCH/DELETE 包装, 默认带 token + org + activeStudent
 * @param {object} opts
 * @param {object} opts.user - 测试用户
 * @param {string} opts.orgId - x-org-id
 * @param {string} [opts.studentId] - x-active-student-id
 * @param {string} [opts.password] - body.password (物理删除用)
 */
function asUser({ user, orgId, studentId, password }) {
  const token = signAccessToken(user)
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(orgId ? { 'x-org-id': String(orgId) } : {}),
    ...(studentId ? { 'x-active-student-id': String(studentId) } : {})
  }
  const wrap = (method) => (url) => {
    let r = request(getApp())[method](url)
    Object.entries(headers).forEach(([k, v]) => r = r.set(k, v))
    if (password) r = r.send({ password })
    return r
  }
  return {
    get: wrap('get'),
    post: wrap('post'),
    put: wrap('put'),
    patch: wrap('patch'),
    delete: wrap('delete'),
    raw: request(getApp()),
    headers
  }
}

module.exports = { asUser, signAccessToken, getApp }