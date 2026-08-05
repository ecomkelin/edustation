'use strict'

/**
 * L14 + L16: JWT 加固
 *   - sign + verify 用 HS256
 *   - iss=edustation / aud=edustation-api
 *   - jti 是 32 hex 加密随机 (不重)
 *   - 旧无 iss/aud 的 token 被拒
 *   - jti 在 payload, 不在 options (jsonwebtoken@9 严格校验)
 */
require('./setup')
const jwt = require('jsonwebtoken')
const JwtUtil = require('@utils/JwtUtil')

describe('L14+L16 JWT 加固', () => {
  it('access token 必含 iss/aud/algorithm=HS256', () => {
    const token = JwtUtil.signAccessToken({ userId: 'u1' })
    const payload = JwtUtil.verifyAccessToken(token)
    expect(payload.iss).toBe('edustation')
    expect(payload.aud).toBe('edustation-api')
    // 解码 header 看 alg
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
    expect(header.alg).toBe('HS256')
  })

  it('refresh token 必含 iss/aud/algorithm=HS256', () => {
    const token = JwtUtil.signRefreshToken({ userId: 'u1' })
    const payload = JwtUtil.verifyRefreshToken(token)
    expect(payload.iss).toBe('edustation')
    expect(payload.aud).toBe('edustation-api')
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
    expect(header.alg).toBe('HS256')
  })

  it('refresh token 含 jti 32 hex (L16)', () => {
    const token = JwtUtil.signRefreshToken({ userId: 'u1' })
    const payload = JwtUtil.verifyRefreshToken(token)
    expect(payload.jti).toMatch(/^[0-9a-f]{32}$/)
  })

  it('两次签发的 refresh token jti 不重', () => {
    const t1 = JwtUtil.signRefreshToken({ userId: 'u1' })
    const t2 = JwtUtil.signRefreshToken({ userId: 'u1' })
    const j1 = JwtUtil.verifyRefreshToken(t1).jti
    const j2 = JwtUtil.verifyRefreshToken(t2).jti
    expect(j1).not.toBe(j2)
  })

  it('旧无 iss/aud 的 token 被拒 (算法钉死)', () => {
    const bad = jwt.sign({ userId: 'u1' }, 'a'.repeat(48))
    expect(() => JwtUtil.verifyAccessToken(bad)).toThrow()
  })

  it('alg=none 攻击被拒', () => {
    // 尝试伪造 alg=none token
    const noneToken = jwt.sign({ userId: 'u1' }, '', { algorithm: 'none' })
    expect(() => JwtUtil.verifyAccessToken(noneToken)).toThrow()
  })
})