'use strict'

const crypto = require('crypto')
const AccessDevice = require('@models/AccessDevice.model')
const ApiError = require('@utils/ApiError')

/**
 * 一体机 webhook 鉴权中间件
 *
 * 行为 (CLAUDE.md §17.4):
 *   1. deviceSn → AccessDevice 反查 → 锁定 org + webhookSigningKey
 *      (设备不存在 → 404; 设备停用 → 403)
 *   2. 校验 |now - X-Timestamp| < 300s (5 分钟窗口防重放)
 *   3. 重算 HMAC-SHA256(webhookSigningKey, `${ts}.${eventId}.${bodyHash}`)
 *      与 X-Signature 比对 (用 timingSafeEqual 防时序攻击)
 *   4. 可选: device.ipAddress 非空时校验源 IP
 *   5. 注入 req.accessDevice (含 org), next()
 *
 * 必需头 (设备端 SDK 需配):
 *   X-Signature: hex(HMAC-SHA256(key, `${ts}.${eventId}.${sha256(rawBody)}`))
 *   X-Timestamp: unix seconds (例: 1718900000)
 *   X-Nonce:     设备原生事件 ID (与 body 内的 recordId/eventId 一致)
 *
 * 注意: 本中间件必须在 express.raw (type: star/star) 之后挂载,
 *       controller 需要 req.rawBody (String) 重算 bodyHash。
 *       见 accessControl.webhookRoutes.js 的 webhook 路由。
 *
 * 与 requirePermission 的区别:
 *   - 不查 DB 验证用户身份 (设备不是 User)
 *   - 通过 deviceSn + HMAC 验证设备身份
 *   - 把 org 锁定到 req.accessDevice.org (后续 service 不再读 body 里的 org)
 */
const MAX_TIMESTAMP_SKEW_SEC = 300 // 5 分钟

module.exports = async function webhookAuth(req, res, next) {
  try {
    // 1. 设备存在性
    const deviceSn = String(req.params.deviceSn || '').trim()
    if (!deviceSn) return next(ApiError.badRequest('缺少 deviceSn'))

    const device = await AccessDevice.findOne({ deviceSn })
      .select('_id org name vendor vendorModel webhookSigningKey ipAddress isActive doorState')
      .lean()
    if (!device) return next(ApiError.notFound('设备不存在'))
    if (!device.isActive) return next(ApiError.forbidden('设备已停用'))

    // 2. 时间窗
    const ts = Number(req.get('X-Timestamp') || 0)
    if (!Number.isFinite(ts) || ts <= 0) {
      return next(ApiError.unauthorized('缺少或非法 X-Timestamp'))
    }
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SEC) {
      return next(ApiError.unauthorized(`X-Timestamp 越界 (允许 ${MAX_TIMESTAMP_SKEW_SEC}s 窗口)`))
    }

    // 3. HMAC 验签
    const signature = String(req.get('X-Signature') || '').toLowerCase()
    if (!signature) return next(ApiError.unauthorized('缺少 X-Signature'))

    const eventId = String(req.get('X-Nonce') || '').trim()
    if (!eventId) return next(ApiError.unauthorized('缺少 X-Nonce'))

    // req.rawBody 由 express.raw 注入; 若无, 用 req.body 重新序列化 (仅 fallback)
    const rawBody = req.rawBody || (req.body ? JSON.stringify(req.body) : '')
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex')
    const payload = `${ts}.${eventId}.${bodyHash}`
    const expected = crypto
      .createHmac('sha256', device.webhookSigningKey)
      .update(payload)
      .digest('hex')

    // timingSafeEqual 必须等长; 不等长直接 401
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return next(ApiError.unauthorized('HMAC 签名不匹配'))
    }

    // 4. 软防御: IP 白名单 (若设备配了 ipAddress 且请求源 IP 不一致, 仅记日志不挡)
    //   备注: 一体机常在家用宽带/4G 出口, IP 不稳定; 白名单作"防误触发"而非"防恶意"。
    if (device.ipAddress) {
      const sourceIp =
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.socket.remoteAddress ||
        ''
      if (sourceIp && sourceIp !== device.ipAddress) {
        // eslint-disable-next-line no-console
        console.warn(
          `[webhookAuth] device=${deviceSn} 设备配 IP=${device.ipAddress} 实际源 IP=${sourceIp}, 不一致 (软防御, 不挡)`
        )
      }
    }

    // 5. 注入 req.accessDevice (service 层不再读 body 里的 org)
    req.accessDevice = device
    req.accessDeviceOrgId = device.org
    next()
  } catch (e) {
    next(e)
  }
}
