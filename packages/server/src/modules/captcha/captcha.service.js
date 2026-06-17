'use strict'

const crypto = require('crypto')
const config = require('@config/index')
const ApiError = require('@utils/ApiError')

/**
 * 滑块验证码 (2026-06)
 *
 * 设计: 拖动"小图块"对齐背景里的"目标槽"。
 * - 背景 SVG 含一个不规则缺口 (slot) 在 (correctX, correctY)
 * - 拼图块 SVG 是同形状的描边/填充版, 用户拖动它到对应 X
 * - 服务端持有 correctX, 不暴露给前端
 * - 容差默认 5px
 *
 * 安全模型:
 *   - SVG 中的目标位置易被 OCR 读取 → 这不是防"高水平 AI", 是防"无脑脚本"
 *   - 真正阻断: 频次限制 (登录错 5 次/15min 锁定) + token 一次性 + 短 TTL
 *   - 高级安全 (鼠标轨迹/行为分析/外接极验) 阶段 2 再说
 *
 * 数据流:
 *   1) issue() → { token, backgroundSvg, pieceSvg, width, height, pieceWidth, expiresAt }
 *   2) 前端: 拖动 piece, 提交 { token, x } 给 verify()
 *   3) verify() 通过 → 返回 { pass, expiresAt }  (pass 是给 login 的一次性令牌)
 *   4) /auth/login 接收 { mobile, password, captchaPass }
 *      若该 mobile 当前窗口内失败 >= afterFailures 次, 必传 captchaPass
 */

const C = config.captcha

// 挑战存储: token -> { correctX, correctY, expiresAt, used }
const challenges = new Map()
// pass 存储: pass -> { expiresAt, used }
const passes = new Map()

// 启动时清空桶
function _reset() {
  challenges.clear()
  passes.clear()
}

// ===== 挑战签发 =====

function issue() {
  // correctX 留出 pieceWidth + 余量, 防止贴边
  const minX = 20
  const maxX = C.width - C.pieceWidth - 20
  const correctX = minX + Math.floor(Math.random() * (maxX - minX))
  const correctY = 20 + Math.floor(Math.random() * (C.height - 60)) // 20..(H-40)

  const token = crypto.randomBytes(16).toString('hex')
  const expiresAt = Date.now() + C.challengeTtlMs
  challenges.set(token, { correctX, correctY, expiresAt, used: false })

  const backgroundSvg = renderBackgroundSvg(correctX, correctY)
  const pieceSvg = renderPieceSvg(correctX, correctY)

  return {
    token,
    backgroundSvg,
    pieceSvg,
    width: C.width,
    height: C.height,
    pieceWidth: C.pieceWidth,
    expiresAt
  }
}

// ===== 答案校验 =====

/**
 * 校验拖动位置。
 * @param {string} token 挑战 token
 * @param {number} x     用户松手时的 X (相对 background 左边缘, 单位 px)
 * @param {Array<{t:number,x:number}>} [track] 可选鼠标轨迹 (阶段 2 用, MVP 仅做存在校验)
 * @returns {{ pass: string, expiresAt: number }}
 */
function verify({ token, x, track }) {
  if (!token || typeof x !== 'number' || !Number.isFinite(x)) {
    throw ApiError.badRequest('captcha 参数错误', { reason: 'invalid' })
  }
  const ch = challenges.get(token)
  if (!ch) throw ApiError.badRequest('captcha 已失效, 请刷新', { reason: 'expired' })
  if (ch.used) throw ApiError.badRequest('captcha 已使用, 请刷新', { reason: 'used' })
  if (Date.now() > ch.expiresAt) {
    challenges.delete(token)
    throw ApiError.badRequest('captcha 已过期, 请刷新', { reason: 'expired' })
  }

  // 容差校验 (用户拖动到的 X 应与 correctX 一致, 允许 ±tolerance)
  // x 是"用户松手时 piece 左边缘的 X" — 与 correctX 同基准
  const diff = Math.abs(x - ch.correctX)
  if (diff > C.tolerance) {
    // 标记为已用, 防暴力试 (虽然频次限制兜底, 但 5px 容差内可以试 ~ (50/5) = 10 次)
    ch.used = true
    throw ApiError.badRequest('拼图位置不正确, 请重试', {
      reason: 'mismatch',
      diff
    })
  }

  // 可选: 轨迹存在性 + 长度合理 (≥ 3 个点) — 阻挡"瞬间跳到正确位置"的脚本
  if (track !== undefined) {
    if (!Array.isArray(track) || track.length < 3) {
      throw ApiError.badRequest('操作异常, 请正常拖动', { reason: 'no_track' })
    }
  }

  // 烧掉 challenge
  ch.used = true
  challenges.delete(token)

  // 颁发 pass
  const pass = crypto.randomBytes(16).toString('hex')
  const passExpiresAt = Date.now() + C.passTtlMs
  passes.set(pass, { expiresAt: passExpiresAt, used: false })
  return { pass, expiresAt: passExpiresAt }
}

/**
 * Login 校验 pass 有效性 (不消耗). 真正消耗发生在登录成功的 clearPassFor() 之后.
 * (MVP 简化: login 内部直接 verifyPass, 成功就删)
 */
function verifyPass(pass) {
  if (!pass) return false
  const p = passes.get(pass)
  if (!p || p.used || Date.now() > p.expiresAt) return false
  return true
}

/**
 * Login 成功后调用, 烧掉该 pass
 */
function consumePass(pass) {
  if (pass) passes.delete(pass)
}

// ===== SVG 渲染 =====
// 拼图块形状: 用 path 画一个"主体矩形 + 左侧/右侧凸起" (类似经典滑块).
// 这样视觉上更像拼图, 不是干巴巴的方块.

function piecePath(cx, cy, w, h) {
  // cx,cy 是拼图中心, w=pieceWidth, h≈pieceHeight
  // 画一个矩形, 中心 X 上下各加一个半圆凸起 (左侧) 和 中心 Y 右侧加半圆凸起
  // 简化为: 主体矩形 + 4 个小半圆凸起 (经典拼图轮廓)
  const r = w / 5
  const x = cx - w / 2
  const y = cy - h / 2
  // 拼图: 左侧上下凸, 右侧上下凸, 上下左右都凸
  // 用 SVG path d 属性, 一笔画出
  return [
    `M ${x} ${y + r}`,
    // 左上凸
    `Q ${x - r} ${y + r} ${x - r} ${y + r - r / 2}`,
    `Q ${x - r * 2} ${y + h / 2} ${x - r} ${y + h / 2 + r / 2}`,
    `Q ${x - r} ${y + h - r} ${x} ${y + h - r}`,
    // 左下到右下
    `L ${x + w - r} ${y + h - r}`,
    // 右下凸
    `Q ${x + w} ${y + h - r} ${x + w} ${y + h - r - r / 2}`,
    `Q ${x + w + r * 2} ${y + h / 2} ${x + w} ${y + h / 2 - r / 2}`,
    `Q ${x + w} ${y + r} ${x + w - r} ${y + r}`,
    // 顶部
    `Z`
  ].join(' ')
}

function renderBackgroundSvg(correctX, correctY) {
  const W = C.width
  const H = C.height
  const PW = C.pieceWidth
  const PH = 50 // 拼图块高度
  // 背景: 渐变 + 随机装饰
  const noise = []
  for (let i = 0; i < 60; i++) {
    const cx = Math.floor(Math.random() * W)
    const cy = Math.floor(Math.random() * H)
    const r = 1 + Math.floor(Math.random() * 3)
    const fill = `hsl(${Math.floor(Math.random() * 360)}, 60%, ${50 + Math.floor(Math.random() * 30)}%)`
    noise.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.4"/>`)
  }
  // 目标槽: 拼图形状的"虚线轮廓" — 提示用户这是要拖到的位置
  const slotPath = piecePath(correctX + PW / 2, correctY + PH / 2, PW, PH)
  // 背景色 + 渐变
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0f4ff"/>
      <stop offset="100%" stop-color="#e8e0ff"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${noise.join('\n  ')}
  <path d="${slotPath}" fill="rgba(0,0,0,0.18)" stroke="rgba(0,0,0,0.45)" stroke-width="1.5" stroke-dasharray="4 3"/>
</svg>`
}

function renderPieceSvg(correctX, correctY) {
  const PW = C.pieceWidth
  const PH = 50
  // 拼图块本体 (与背景的 slot 同形状, 但用纯色 + 边框 + 中心文字"拖动")
  const cx = PW / 2
  const cy = PH / 2
  const path = piecePath(cx, cy, PW, PH)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PW + 20}" height="${PH + 20}" viewBox="0 0 ${PW + 20} ${PH + 20}">
  <defs>
    <linearGradient id="pc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5b8def"/>
      <stop offset="100%" stop-color="#3b6fd9"/>
    </linearGradient>
  </defs>
  <path d="${path}" fill="url(#pc)" stroke="#2a4fa0" stroke-width="1.5"/>
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="white" font-size="11" font-weight="600" font-family="sans-serif">↔</text>
</svg>`
}

// ===== 定期清理过期项 =====

const SWEEP_INTERVAL_MS = 60 * 1000 // 1 min
const sweepTimer = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of challenges) {
    if (v.expiresAt < now) challenges.delete(k)
  }
  for (const [k, v] of passes) {
    if (v.expiresAt < now) passes.delete(k)
  }
}, SWEEP_INTERVAL_MS)
sweepTimer.unref()

module.exports = {
  issue,
  verify,
  verifyPass,
  consumePass,
  _reset,
  // 测试/调试用
  _peek: () => ({ challenges: challenges.size, passes: passes.size })
}
