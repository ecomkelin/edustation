<template>
  <span
    :class="['svg-avatar', { 'svg-avatar--clickable': clickable }]"
    :style="boxStyle"
    @click="clickable && $emit('click', $event)"
  >
    <span
      v-if="svgData"
      class="svg-avatar__svg"
      :style="svgColor"
      v-html="svgData"
    />
    <span v-else-if="fallback" class="svg-avatar__fallback">👤</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import avatars from '@shared/avatars'

// 2026-07-05: Vite optimizeDeps 把 CJS 包成 __commonJS + 仅 expose `default`,
//   named exports 在浏览器侧不可用. 改为 default import + 解构.
const { getAvatarByKey, fallbackKey, DEFAULT_USER_AVATAR_KEY } = avatars

const props = defineProps({
  // 当前用户/学生的 avatarSvgKey (避开 Vue 内部 key, 用 svgKey)
  svgKey: { type: String, default: null },
  // 'user' => 非法 key 兜底 mom; 'student' => 非法 key 显示 fallback
  audience: {
    type: String,
    default: 'user',
    validator: (v) => ['user', 'student'].includes(v)
  },
  // 像素尺寸, 默认 32
  size: { type: Number, default: 32 },
  // 主题色, 注入 SVG 的 currentColor
  color: { type: String, default: 'currentColor' },
  // 非法 key 时是否显示 emoji 兜底 (default: true)
  fallback: { type: Boolean, default: true },
  // 是否可点击, 触发 click 事件
  clickable: { type: Boolean, default: false }
})

defineEmits(['click'])

const boxStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size + 'px',
  // 圆角策略: 大于 64 圆, 小于 32 方角头像
  borderRadius: props.size >= 48 ? '50%' : '8px',
  overflow: 'hidden',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: props.clickable ? 'pointer' : 'default',
  background: '#f5f7fa',
  flex: '0 0 auto'
}))

// 渲染 key: 非法时 user 兜底到 mom, student 留 null (前端用 fallback emoji)
const renderKey = computed(() => {
  if (props.audience === 'user') return fallbackKey(props.svgKey, 'user') || DEFAULT_USER_AVATAR_KEY
  return fallbackKey(props.svgKey, 'student') // 可能 null
})

const svgData = computed(() => {
  const found = getAvatarByKey(renderKey.value)
  return found ? found.svg : null
})

const svgColor = computed(() => ({
  color: props.color,
  // SVG 内部的 width/height 用 inline style 把 64 viewBox 缩放成 props.size
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%'
}))
</script>

<style scoped>
.svg-avatar__svg {
  width: 100%;
  height: 100%;
  display: inline-flex;
}
.svg-avatar__svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
.svg-avatar__fallback {
  font-size: 50%;
  line-height: 1;
  color: #909399;
}
.svg-avatar--clickable:hover {
  background: #e6e8eb;
}
</style>
