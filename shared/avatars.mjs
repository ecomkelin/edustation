/**
 * 头像 SVG 图鉴 — ESM 入口 (2026-08-03 补 mp-weixin 构建缺口).
 *
 * 背景: shared/avatars.js 是 CommonJS (server 端 require 解构用).
 *   - H5: vite optimizeDeps.include '@shared/avatars' 预构建, default import 能吃 CJS interop.
 *   - 小程序 / App: 走 rollup, 无 optimizeDeps, 且 rollup 对 `exports.X = X` + `module.exports = exports`
 *     的 CJS **不合成 ESM named**, default interop 也不稳定 →
 *     `import avatars from '@shared/avatars'` 在小程序运行时拿到空对象 →
 *     解构 { getAvatarByKey } = undefined → SvgAvatar 调用报 TypeError → 首页白屏.
 *
 * 本文件: ESM 转发层, 与 shared/petConfig.mjs 范式一致 —— **显式 re-export named**,
 *   让 client 的具名 import (`import { getAvatarByKey } from '@shared/avatars'`) 在小程序端 100% 可靠
 *   (ESM .mjs 的 named export 不依赖 CJS interop).
 *
 * server 端继续用 `require('@shared/avatars')` (CJS, 别动).
 */
import * as avatarsNs from '@shared/avatars.js'

// rollup commonjs 把 CJS 包成 namespace, default = module.exports (整个 exports 对象).
const avatars = avatarsNs.default || avatarsNs

export const USER_AVATARS = avatars.USER_AVATARS
export const STUDENT_AVATARS = avatars.STUDENT_AVATARS
export const ALL_AVATARS = avatars.ALL_AVATARS
export const USER_AVATAR_KEYS = avatars.USER_AVATAR_KEYS
export const STUDENT_AVATAR_KEYS = avatars.STUDENT_AVATAR_KEYS
export const AVATAR_BY_KEY = avatars.AVATAR_BY_KEY
export const AVATAR_BY_AUDIENCE = avatars.AVATAR_BY_AUDIENCE
export const DEFAULT_USER_AVATAR_KEY = avatars.DEFAULT_USER_AVATAR_KEY
export const DEFAULT_STUDENT_AVATAR_KEY = avatars.DEFAULT_STUDENT_AVATAR_KEY
export const getAvatarByKey = avatars.getAvatarByKey
export const getAvatarsByAudience = avatars.getAvatarsByAudience
export const isValidUserKey = avatars.isValidUserKey
export const isValidStudentKey = avatars.isValidStudentKey
export const fallbackKey = avatars.fallbackKey

export default avatars
