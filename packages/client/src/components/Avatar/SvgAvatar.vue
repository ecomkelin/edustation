<template>
  <view :class="['svg-avatar', { 'svg-avatar--clickable': clickable }]" :style="boxStyle" @tap="onTap">
    <image
      v-if="dataUri"
      :src="dataUri"
      :style="imgStyle"
      mode="aspectFill"
      class="svg-avatar__img"
    />
    <text v-else-if="fallback" class="svg-avatar__fallback">👤</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
// 2026-08-03: 改具名 import — 小程序 rollup 对 CJS default interop 不稳定,
//   default 解构 { getAvatarByKey } = avatars 在小程序里拿到空对象 → undefined →
//   getAvatarByKey is not a function → 首页白屏.
//   走 @shared/avatars.mjs 的显式 named export (ESM 可靠), 且加 typeof 防御兜底.
import { getAvatarByKey, fallbackKey, DEFAULT_USER_AVATAR_KEY } from '@shared/avatars'

const props = defineProps({
  svgKey: { type: String, default: null },
  audience: {
    type: String,
    default: 'user',
    // uni-app 自定义 validator 在小程序端不稳定, 仅做必要校验
    validator: (v) => v === 'user' || v === 'student'
  },
  size: { type: Number, default: 32 },
  color: { type: String, default: '#5a7a6a' }, // 默认染色按 student 绿系
  fallback: { type: Boolean, default: true },
  clickable: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])

// uni-app 不用 v-html, 直接 base64 data URI 让 <image> 渲染
function utf8ToBase64(str) {
  if (typeof btoa === 'function') {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(str)))
  }
  return null
}

function withColor(svg) {
  // shared/avatars.js 里 SVG 都用具体填充色; color 暂未绑定到 SVG 内 (预留接口)
  return svg
}

const renderKey = computed(() => {
  // 防御: 万一 avatars 桥接在某端拿不到, 降级到默认 key, 不崩 (渲染 fallback emoji)
  if (typeof fallbackKey !== 'function') return DEFAULT_USER_AVATAR_KEY || 'mom'
  if (props.audience === 'user') return fallbackKey(props.svgKey, 'user') || DEFAULT_USER_AVATAR_KEY
  return fallbackKey(props.svgKey, 'student')
})

const svgData = computed(() => {
  if (typeof getAvatarByKey !== 'function') return null
  const found = getAvatarByKey(renderKey.value)
  return found ? withColor(found.svg) : null
})

const dataUri = computed(() => {
  if (!svgData.value) return null
  return utf8ToBase64(svgData.value)
})

const boxStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size + 'px',
  borderRadius: props.size >= 48 ? '50%' : '8px',
  overflow: 'hidden',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f5f7fa',
  flex: '0 0 auto'
}))

const imgStyle = computed(() => ({
  width: props.size + 'px',
  height: props.size + 'px',
  display: 'block'
}))

function onTap(e) {
  if (props.clickable) emit('click', e)
}
</script>

<style scoped>
.svg-avatar__img {
  display: block;
}
.svg-avatar__fallback {
  font-size: 50%;
  line-height: 1;
  color: #909399;
}
.svg-avatar--clickable:active {
  opacity: 0.7;
}
</style>
