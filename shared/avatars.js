'use strict'

/**
 * 头像 SVG 图鉴（2026-07-05 立项，头像替代方案）。
 *
 * 用 10 个预制 SVG 替代传统上传头像，2 组 audience：
 *   - user    (4 个): 妈妈 / 爸爸 / 奶奶 / 爷爷，默认 mom
 *   - student (6 个): 男孩 / 女孩 / 哥哥 / 姐姐 / 弟弟 / 妹妹（不强制默认，手动选）
 *
 * 关键设计：
 *   - key: 全局唯一（DB 只存 key，SVG 在前端/shared 层 inline 渲染）
 *   - audience: 'user' | 'student'，picker 按这个分组展示
 *   - svg: 64×64 viewBox 字符串，fill='currentColor' 由外层 color 控制染色
 *
 * 复用 petSpecies.js 的 Object.freeze 范式。
 *
 * 后续迭代（出更好看版本）：
 *   1) 美术换 svg 字符串（保持 key 不变）
 *   2) PR 评审 → merge → 全部用户立刻看到新头像
 */

/* eslint-disable max-len */

// ===== 用户头像 4 张（暖棕主色 #A0714F）=====

const USER_AVATARS = Object.freeze([
  // ---- 妈妈 (mom, 默认) ----
  // 齐耳短发 + 耳钉 + 微笑 + 圆领上衣 + 项链
  Object.freeze({
    key: 'mom',
    label: '妈妈',
    audience: 'user',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#f4d4b8"/><path d="M14 26c0-10 8-18 18-18s18 8 18 18c-4-2-9-3-18-3s-14 1-18 3z" fill="#5a3e2b"/><circle cx="26" cy="34" r="2" fill="#3a2818"/><circle cx="38" cy="34" r="2" fill="#3a2818"/><path d="M28 41c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="14" cy="34" r="1" fill="#e0b888"/><circle cx="50" cy="34" r="1" fill="#e0b888"/><path d="M16 56c0-8 7-14 16-14s16 6 16 14" fill="#c76464"/><circle cx="32" cy="46" r="1" fill="#d4a857"/></svg>'
  }),
  // ---- 爸爸 (dad) ----
  // 短发 + 浓眉 + 微笑 + 西装
  Object.freeze({
    key: 'dad',
    label: '爸爸',
    audience: 'user',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#f4d4b8"/><path d="M16 22c0-4 8-8 16-8s16 4 16 8c-2 6-8 8-16 8s-14-2-16-8z" fill="#3a2818"/><rect x="22" y="31" width="6" height="2" fill="#2a1810"/><rect x="36" y="31" width="6" height="2" fill="#2a1810"/><circle cx="26" cy="36" r="1.5" fill="#3a2818"/><circle cx="38" cy="36" r="1.5" fill="#3a2818"/><path d="M28 42c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M14 56c0-2 2-5 8-7l4 4h12l4-4c6 2 8 5 8 7v6H14z" fill="#4a5a7a"/><path d="M28 49l4 4 4-4v-4h-8z" fill="#f4f4f4"/><path d="M30 56v-3l2 1 2-1v3h-4z" fill="#c76464"/></svg>'
  }),
  // ---- 奶奶 (grandma) ----
  // 圆发髻 + 刘海中分 + 圆眼镜 + 微笑 + 牡丹花衬衣
  Object.freeze({
    key: 'grandma',
    label: '奶奶',
    audience: 'user',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#f4d4b8"/><ellipse cx="32" cy="14" rx="10" ry="8" fill="#e8e8e8"/><path d="M22 18c2 4 6 6 10 6s8-2 10-6" fill="#e8e8e8"/><circle cx="26" cy="34" r="4" fill="none" stroke="#5a4a3a" stroke-width="1.5"/><circle cx="38" cy="34" r="4" fill="none" stroke="#5a4a3a" stroke-width="1.5"/><path d="M30 34h4" stroke="#5a4a3a" stroke-width="1.5"/><circle cx="26" cy="34" r="1" fill="#3a2818"/><circle cx="38" cy="34" r="1" fill="#3a2818"/><path d="M28 42c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M14 56c0-8 7-14 18-14s18 6 18 14" fill="#a8456a"/><circle cx="32" cy="46" r="2" fill="#e8a0b8"/><circle cx="32" cy="46" r="1" fill="#c76464"/></svg>'
  }),
  // ---- 爷爷 (grandpa) ----
  // 光头 + 两侧白发 + 圆眼镜 + 山羊胡 + 立领唐装
  Object.freeze({
    key: 'grandpa',
    label: '爷爷',
    audience: 'user',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#f4d4b8"/><circle cx="32" cy="34" r="20" fill="none" stroke="#d4b89a" stroke-width="1"/><path d="M14 18c2 4 4 6 6 4" fill="none" stroke="#e8e8e8" stroke-width="3" stroke-linecap="round"/><path d="M50 18c-2 4-4 6-6 4" fill="none" stroke="#e8e8e8" stroke-width="3" stroke-linecap="round"/><circle cx="26" cy="34" r="4" fill="none" stroke="#5a4a3a" stroke-width="1.5"/><circle cx="38" cy="34" r="4" fill="none" stroke="#5a4a3a" stroke-width="1.5"/><path d="M30 34h4" stroke="#5a4a3a" stroke-width="1.5"/><circle cx="26" cy="34" r="1" fill="#3a2818"/><circle cx="38" cy="34" r="1" fill="#3a2818"/><path d="M26 44c2 4 4 6 6 6s4-2 6-6" fill="#e8e8e8"/><path d="M14 56v-2c0-4 4-6 8-8l4 6h12l4-6c4 2 8 4 8 8v2" fill="#8a4a3a"/><path d="M30 50l2 4 2-4v-4h-4z" fill="#f4f4f4"/></svg>'
  })
])

// ===== 学生头像 6 张（蓝绿主色 #5a7a6a）=====

const STUDENT_AVATARS = Object.freeze([
  // ---- 男孩 (boy) ----
  // 锅盖头 + 大眼 + 红领巾 + 校服
  Object.freeze({
    key: 'boy',
    label: '男孩',
    audience: 'student',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#fce8d4"/><path d="M12 24c2-8 10-12 20-12s18 4 20 12c-2-2-6-2-12-2-4 0-4-4-8-4s-4 4-8 4c-6 0-10 0-12 2z" fill="#3a2818"/><circle cx="26" cy="34" r="2.5" fill="#2a1810"/><circle cx="38" cy="34" r="2.5" fill="#2a1810"/><circle cx="26.5" cy="33" r="0.6" fill="#fff"/><circle cx="38.5" cy="33" r="0.6" fill="#fff"/><path d="M28 41c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M16 56c0-8 7-14 16-14s16 6 16 14" fill="#3a6a8a"/><polygon points="32,42 28,46 30,52 28,56 32,54 36,56 34,52 36,46" fill="#c76464"/></svg>'
  }),
  // ---- 女孩 (girl) ----
  // 双马尾 + 蝴蝶结 + 裙装
  Object.freeze({
    key: 'girl',
    label: '女孩',
    audience: 'student',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#fce8d4"/><ellipse cx="14" cy="24" rx="4" ry="10" fill="#5a3e2b"/><ellipse cx="50" cy="24" rx="4" ry="10" fill="#5a3e2b"/><path d="M14 16c0-6 8-12 18-12s18 6 18 12c-2 0-4-2-8 0-4-2-16-2-20 0-4-2-6 0-8 0z" fill="#5a3e2b"/><polygon points="32,12 28,18 32,16 36,18" fill="#e88aa8"/><circle cx="26" cy="34" r="2.5" fill="#2a1810"/><circle cx="38" cy="34" r="2.5" fill="#2a1810"/><circle cx="26.5" cy="33" r="0.6" fill="#fff"/><circle cx="38.5" cy="33" r="0.6" fill="#fff"/><path d="M28 41c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M16 56c0-8 7-14 16-14s16 6 16 14" fill="#e88aa8"/><circle cx="20" cy="48" r="1.5" fill="#f4a8c0"/><circle cx="44" cy="48" r="1.5" fill="#f4a8c0"/></svg>'
  }),
  // ---- 哥哥 (brother) ----
  // 短发偏分 + 外套翻领
  Object.freeze({
    key: 'brother',
    label: '哥哥',
    audience: 'student',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#fce8d4"/><path d="M14 22c2-4 8-8 18-8s16 4 18 8c-2 2-4 4-6 4 0 0-2-4-12-4s-12 4-12 4c-2 0-4-2-6-4z" fill="#2a1810"/><circle cx="26" cy="34" r="2.5" fill="#2a1810"/><circle cx="38" cy="34" r="2.5" fill="#2a1810"/><circle cx="26.5" cy="33" r="0.6" fill="#fff"/><circle cx="38.5" cy="33" r="0.6" fill="#fff"/><path d="M28 41c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M14 56c0-2 2-6 6-9l4 2h16l4-2c4 3 6 7 6 9v4H14z" fill="#5a8a4a"/><path d="M28 46l4-4 4 4v-6h-8z" fill="#f4f4f4"/><circle cx="22" cy="50" r="1" fill="#3a6a4a"/><circle cx="42" cy="50" r="1" fill="#3a6a4a"/></svg>'
  }),
  // ---- 姐姐 (sister) ----
  // 长直发 + 连衣裙
  Object.freeze({
    key: 'sister',
    label: '姐姐',
    audience: 'student',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#fce8d4"/><path d="M16 14c0-4 8-8 16-8s16 4 16 8v22c0 6-4 10-8 10s-4-6-4-12-2-12-4-12-4 6-4 12 0 12-4 12-8-4-8-10V14z" fill="#3a2818"/><circle cx="26" cy="36" r="2.5" fill="#2a1810"/><circle cx="38" cy="36" r="2.5" fill="#2a1810"/><circle cx="26.5" cy="35" r="0.6" fill="#fff"/><circle cx="38.5" cy="35" r="0.6" fill="#fff"/><path d="M28 43c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M16 56c0-8 7-14 16-14s16 6 16 14" fill="#a86a8a"/><circle cx="32" cy="48" r="2" fill="#f4a8c0"/></svg>'
  }),
  // ---- 弟弟 (younger_brother) ----
  // 蘑菇头 + 大鼻头 + 运动衫
  Object.freeze({
    key: 'younger_brother',
    label: '弟弟',
    audience: 'student',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#fce8d4"/><path d="M12 22c0-4 4-12 20-12s20 8 20 12c0 4-2 6-4 6 0-4-4-8-16-8s-16 4-16 8c-2 0-4-2-4-6z" fill="#2a1810"/><circle cx="26" cy="36" r="2.5" fill="#2a1810"/><circle cx="38" cy="36" r="2.5" fill="#2a1810"/><circle cx="26.5" cy="35" r="0.6" fill="#fff"/><circle cx="38.5" cy="35" r="0.6" fill="#fff"/><ellipse cx="32" cy="42" rx="2" ry="1.5" fill="#e8b89a"/><path d="M28 44c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M16 56c0-8 7-14 16-14s16 6 16 14" fill="#e8a04a"/><path d="M20 50l4-4 4 4 4-4 4 4 4-4 4 4" stroke="#f4d4a8" stroke-width="1.5" fill="none"/></svg>'
  }),
  // ---- 妹妹 (younger_sister) ----
  // 齐刘海 + 双丸子头 + 背带裤
  Object.freeze({
    key: 'younger_sister',
    label: '妹妹',
    audience: 'student',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="34" r="20" fill="#fce8d4"/><circle cx="20" cy="16" r="6" fill="#5a3e2b"/><circle cx="44" cy="16" r="6" fill="#5a3e2b"/><circle cx="20" cy="14" r="3" fill="#3a2818"/><circle cx="44" cy="14" r="3" fill="#3a2818"/><path d="M14 22c0-4 8-8 18-8s18 4 18 8v8H14z" fill="#5a3e2b"/><circle cx="26" cy="36" r="2.5" fill="#2a1810"/><circle cx="38" cy="36" r="2.5" fill="#2a1810"/><circle cx="26.5" cy="35" r="0.6" fill="#fff"/><circle cx="38.5" cy="35" r="0.6" fill="#fff"/><path d="M28 43c0 1 1 2 4 2s4-1 4-2" stroke="#a85742" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M16 56c0-6 6-12 16-12s16 6 16 12" fill="#f4a8c0"/><path d="M20 50v8h4v-8M40 50v8h4v-8" stroke="#5a8aaa" stroke-width="3" stroke-linecap="round"/><rect x="26" y="48" width="12" height="6" fill="#5a8aaa"/><circle cx="32" cy="46" r="1" fill="#e88aa8"/></svg>'
  })
])

// ===== 派生 =====

const ALL_AVATARS = Object.freeze([...USER_AVATARS, ...STUDENT_AVATARS])

const USER_AVATAR_KEYS = Object.freeze(USER_AVATARS.map(a => a.key))
const STUDENT_AVATAR_KEYS = Object.freeze(STUDENT_AVATARS.map(a => a.key))

const AVATAR_BY_KEY = Object.freeze(
  ALL_AVATARS.reduce((acc, a) => { acc[a.key] = a; return acc }, {})
)

const AVATAR_BY_AUDIENCE = Object.freeze({
  user: USER_AVATARS,
  student: STUDENT_AVATARS
})

const DEFAULT_USER_AVATAR_KEY = 'mom'
const DEFAULT_STUDENT_AVATAR_KEY = null  // 学生不强制默认，让教务/家长自己挑

/**
 * 按 key 查 avatar 记录；不存在返回 null（前端渲染时降级到默认）。
 * @param {string} key
 * @returns {object|null}
 */
function getAvatarByKey(key) {
  return AVATAR_BY_KEY[key] || null
}

/**
 * 按 audience 查所有 avatar 记录（user / student）。
 * @param {'user'|'student'} audience
 * @returns {object[]}
 */
function getAvatarsByAudience(audience) {
  return AVATAR_BY_AUDIENCE[audience] || []
}

/**
 * 校验 user avatar key 合法性。
 * @param {string} key
 * @returns {boolean}
 */
function isValidUserKey(key) {
  return USER_AVATAR_KEYS.includes(key)
}

/**
 * 校验 student avatar key 合法性（null/undefined 也算合法 = 未选）。
 * @param {string|null|undefined} key
 * @returns {boolean}
 */
function isValidStudentKey(key) {
  return key == null || STUDENT_AVATAR_KEYS.includes(key)
}

/**
 * 渲染时取最终 fallback key：
 *   - user: 非法或空 → 'mom'
 *   - student: 非法 → null（前端用 svg 兜底）
 * @param {string|null|undefined} key
 * @param {'user'|'student'} audience
 * @returns {string|null}
 */
function fallbackKey(key, audience) {
  if (audience === 'user') {
    return isValidUserKey(key) ? key : DEFAULT_USER_AVATAR_KEY
  }
  return isValidStudentKey(key) ? key : DEFAULT_STUDENT_AVATAR_KEY
}

exports.USER_AVATARS = USER_AVATARS
exports.STUDENT_AVATARS = STUDENT_AVATARS
exports.ALL_AVATARS = ALL_AVATARS
exports.USER_AVATAR_KEYS = USER_AVATAR_KEYS
exports.STUDENT_AVATAR_KEYS = STUDENT_AVATAR_KEYS
exports.AVATAR_BY_KEY = AVATAR_BY_KEY
exports.AVATAR_BY_AUDIENCE = AVATAR_BY_AUDIENCE
exports.DEFAULT_USER_AVATAR_KEY = DEFAULT_USER_AVATAR_KEY
exports.DEFAULT_STUDENT_AVATAR_KEY = DEFAULT_STUDENT_AVATAR_KEY
exports.getAvatarByKey = getAvatarByKey
exports.getAvatarsByAudience = getAvatarsByAudience
exports.isValidUserKey = isValidUserKey
exports.isValidStudentKey = isValidStudentKey
exports.fallbackKey = fallbackKey
module.exports = exports
