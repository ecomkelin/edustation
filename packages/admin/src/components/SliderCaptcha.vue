<template>
  <el-dialog
    v-model="visible"
    title="请完成滑块验证"
    width="380px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    align-center
    @open="onOpen"
  >
    <div v-if="loading && !challenge" class="captcha-loading">加载中…</div>
    <div v-else-if="challenge" class="captcha">
      <div class="hint">将拼图块拖动到右侧虚线位置对齐</div>
      <div
        ref="trackRef"
        class="track"
        :style="{ width: challenge.width + 'px', height: challenge.height + 'px' }"
        @mousedown="onPointerDown"
        @touchstart.prevent="onPointerDown"
      >
        <!-- 背景 SVG (含目标槽虚线) -->
        <div class="bg" v-html="challenge.backgroundSvg" />
        <!-- 拼图块, 通过 transform 拖动 -->
        <div
          class="piece"
          :style="{
            left: pieceX + 'px',
            top: pieceY + 'px',
            cursor: dragging ? 'grabbing' : 'grab',
            transition: dragging ? 'none' : 'left 0.2s'
          }"
          v-html="challenge.pieceSvg"
        />
        <!-- 拖动手柄 (在 track 底部) -->
        <div class="handle">
          <div
            class="handle-bar"
            :style="{ width: handleX + 'px' }"
          />
          <div
            class="handle-knob"
            :style="{ left: handleX + 'px' }"
            @mousedown.stop="onPointerDown"
            @touchstart.prevent.stop="onPointerDown"
          >
            <el-icon><Right /></el-icon>
          </div>
        </div>
      </div>
      <div v-if="error" class="captcha-error">{{ error }}</div>
    </div>

    <template #footer>
      <el-button @click="onCancel" :disabled="verifying">取消</el-button>
      <el-button type="primary" :loading="verifying" :disabled="!moved" @click="onSubmit">
        确认
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { Right } from '@element-plus/icons-vue'
import http from '@/api/http'

const props = defineProps({
  modelValue: Boolean
})
const emit = defineEmits(['update:modelValue', 'success', 'cancel'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const challenge = ref(null)
const loading = ref(false)
const verifying = ref(false)
const error = ref('')

const pieceX = ref(0) // piece 距 track 左边缘的 px (用户拖动后)
const pieceY = ref(0) // piece 距 track 顶部的 px (固定)
const handleX = ref(0) // 拖动条位置
const dragging = ref(false)
const moved = ref(false) // 用户是否动过

const trackRef = ref(null)
let dragStartX = 0
let dragStartHandleX = 0
let trackLeft = 0
const TRACK_BOTTOM_HEIGHT = 36 // 底部 handle 区域高度
const HANDLE_KNOB_WIDTH = 44

async function onOpen() {
  error.value = ''
  moved.value = false
  pieceX.value = 0
  handleX.value = 0
  await loadChallenge()
}

async function loadChallenge() {
  loading.value = true
  error.value = ''
  try {
    const res = await http.get('/captcha/challenge')
    challenge.value = res.data
    // piece 初始位置: track 左侧 0, 垂直居中
    pieceY.value = Math.round((res.data.height - 50) / 2) - 10 // 50 = piece 高度, 10 = 顶部 svg padding
  } catch (e) {
    error.value = '加载验证失败, 请关闭重试'
  } finally {
    loading.value = false
  }
}

function onPointerDown(e) {
  if (!challenge.value || verifying.value) return
  dragging.value = true
  moved.value = true
  const trackEl = trackRef.value
  trackLeft = trackEl.getBoundingClientRect().left
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  dragStartX = clientX
  dragStartHandleX = handleX.value
  document.addEventListener('mousemove', onPointerMove)
  document.addEventListener('mouseup', onPointerUp)
  document.addEventListener('touchmove', onPointerMove, { passive: false })
  document.addEventListener('touchend', onPointerUp)
}

function onPointerMove(e) {
  if (!dragging.value) return
  e.preventDefault?.()
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const dx = clientX - dragStartX
  // handle 限制在 [0, trackWidth - knobWidth]
  const trackWidth = trackRef.value ? trackRef.value.clientWidth : 320
  const maxX = trackWidth - HANDLE_KNOB_WIDTH
  const newHandleX = Math.max(0, Math.min(maxX, dragStartHandleX + dx))
  handleX.value = newHandleX
  // piece X = handle X (1:1 对应)
  pieceX.value = newHandleX
}

function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  document.removeEventListener('mousemove', onPointerMove)
  document.removeEventListener('mouseup', onPointerUp)
  document.removeEventListener('touchmove', onPointerMove)
  document.removeEventListener('touchend', onPointerUp)
}

async function onSubmit() {
  if (!challenge.value || verifying.value) return
  verifying.value = true
  error.value = ''
  try {
    const res = await http.post('/captcha/verify', {
      token: challenge.value.token,
      x: Math.round(pieceX.value)
    })
    emit('success', res.data.pass)
    visible.value = false
  } catch (e) {
    const reason = e?.response?.data?.data?.reason
    if (reason === 'mismatch') {
      error.value = '拼图位置不正确, 请重试'
    } else {
      error.value = e?.response?.data?.message || '验证失败, 请重试'
    }
    // 刷新 challenge
    await loadChallenge()
    pieceX.value = 0
    handleX.value = 0
    moved.value = false
  } finally {
    verifying.value = false
  }
}

function onCancel() {
  emit('cancel')
  visible.value = false
}
</script>

<style scoped>
.captcha-loading {
  text-align: center;
  padding: 40px 0;
  color: #909399;
}
.captcha {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.hint {
  font-size: 13px;
  color: #606266;
  align-self: flex-start;
}
.track {
  position: relative;
  user-select: none;
  border-radius: 4px;
  overflow: hidden;
  background: #f5f5f5;
}
.bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(100% - 36px);
}
.bg :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.piece {
  position: absolute;
  z-index: 2;
  pointer-events: none; /* 通过 handle 拖动 */
}
.piece :deep(svg) {
  display: block;
}
.handle {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 36px;
  background: #e8e8e8;
  display: flex;
  align-items: center;
}
.handle-bar {
  height: 4px;
  background: #5b8def;
  transition: width 0.05s;
  border-radius: 0 2px 2px 0;
}
.handle-knob {
  position: absolute;
  top: 0;
  width: 44px;
  height: 36px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: #5b8def;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.handle-knob:active {
  cursor: grabbing;
}
.captcha-error {
  color: #f56c6c;
  font-size: 13px;
  align-self: flex-start;
}
</style>
