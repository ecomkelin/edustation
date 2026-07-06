/**
 * 头像 emoji fallback 池 (2026-07-05 抽取自 3 处复制)
 *
 * 之前在 ActiveStudentHeader.vue / switch.vue / me.vue 各复制过同一段
 * AVATAR_POOL + emoji 哈希选择函数, 这里统一, 减少维护点。
 *
 * 用法:
 *   <image v-if="avatarUrl" :src="avatarUrl" />
 *   <text v-else>{{ emojiOrFallback(name) }}</text>
 */

export const AVATAR_FALLBACK_POOL = ['🐰', '🐯', '🐻', '🦊', '🐼', '🐨', '🐸', '🐵', '🐱', '🐶']

/**
 * 根据 name 哈希稳定选一个 emoji (同 name 永远返同一个 emoji)
 * @param {string} name
 * @returns {string}
 */
export function fallbackEmoji(name = '') {
  let h = 0
  const s = name || ''
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return AVATAR_FALLBACK_POOL[Math.abs(h) % AVATAR_FALLBACK_POOL.length]
}
