<template>
  <div class="ai-file-uploader">
    <div
      class="dropzone"
      :class="{ dragging: isDragging }"
      @dragenter.prevent.stop="onDragEnter"
      @dragover.prevent.stop="onDragOver"
      @dragleave.prevent.stop="onDragLeave"
      @drop.prevent.stop="onDrop"
    >
      <el-icon size="20"><Upload /></el-icon>
      <span class="hint">拖入或点击上传附件</span>
      <span class="formats">支持 图片 / Excel / PDF（单文件 ≤5MB）</span>
      <input
        ref="fileInputRef"
        type="file"
        :accept="acceptAttr"
        multiple
        style="display: none"
        @change="onPickFiles"
      />
      <el-button size="small" plain @click="pickFile" :loading="uploading">
        <el-icon><Plus /></el-icon>
        <span>选择文件</span>
      </el-button>
    </div>

    <!-- 已选附件列表 (本轮) -->
    <div v-if="files.length > 0" class="files">
      <div v-for="(f, i) in files" :key="f.fileId" class="file-item">
        <el-icon class="file-icon">
          <component :is="iconForMime(f.mime)" />
        </el-icon>
        <span class="file-name" :title="f.fileName">{{ f.fileName }}</span>
        <el-tag size="small" type="info">{{ formatSize(f.size) }}</el-tag>
        <el-button link type="danger" @click="removeAt(i)">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Upload,
  Plus,
  Close,
  Picture,
  Document,
  VideoCamera,
  Headset
} from '@element-plus/icons-vue'
import { storageApi } from '@/api/storage'

const props = defineProps({
  // 已选文件 (父组件传入, 双向绑定)
  modelValue: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue', 'change'])

const isDragging = ref(false)
const uploading = ref(false)
const fileInputRef = ref(null)

const files = computed({
  get: () => props.modelValue || [],
  set: (v) => emit('update:modelValue', v)
})

const ACCEPT_MIMES = [
  // image
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  // excel
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // pdf
  'application/pdf'
]
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const acceptAttr = ACCEPT_MIMES.join(',')

function iconForMime(mime) {
  if (!mime) return Document
  if (mime.startsWith('image/')) return Picture
  if (mime.startsWith('video/')) return VideoCamera
  if (mime.startsWith('audio/')) return Headset
  return Document
}

function formatSize(n) {
  if (!n) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}

function pickFile() {
  fileInputRef.value?.click()
}

function onPickFiles(e) {
  const list = Array.from(e.target.files || [])
  handleFiles(list)
  // 清空 input, 允许重复选同一文件
  e.target.value = ''
}

function onDragEnter(e) { isDragging.value = true }
function onDragOver(e)  { isDragging.value = true }
function onDragLeave(e) { isDragging.value = false }
function onDrop(e) {
  isDragging.value = false
  const list = Array.from(e.dataTransfer?.files || [])
  handleFiles(list)
}

async function handleFiles(rawFiles) {
  if (uploading.value) return
  const valid = []
  for (const f of rawFiles) {
    if (f.size > MAX_SIZE) {
      ElMessage.warning(`${f.name} 超过 5MB，已跳过`)
      continue
    }
    if (!ACCEPT_MIMES.some((m) => f.type === m || f.type.startsWith(m.split('/')[0] + '/'))) {
      // 兜底：mimetype 为空（某些浏览器）时按后缀判断
      const lower = (f.name || '').toLowerCase()
      const okByExt = /\.(png|jpe?g|gif|webp|xlsx|xls|pdf)$/i.test(lower)
      if (!okByExt) {
        ElMessage.warning(`${f.name} 不是支持的格式（图片/Excel/PDF），已跳过`)
        continue
      }
    }
    valid.push(f)
  }
  if (valid.length === 0) return

  uploading.value = true
  try {
    const uploaded = []
    for (const f of valid) {
      const res = await storageApi.upload({ file: f, scope: 'general' })
      uploaded.push({
        fileId: res.data.id,
        fileName: f.name,
        mime: f.type || guessMime(f.name),
        size: f.size,
        url: res.data.url
      })
    }
    const next = [...files.value, ...uploaded]
    emit('update:modelValue', next)
    emit('change', next)
    ElMessage.success(`已上传 ${uploaded.length} 个附件`)
  } catch (e) {
    ElMessage.error(e?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

function removeAt(i) {
  const next = files.value.slice()
  next.splice(i, 1)
  emit('update:modelValue', next)
  emit('change', next)
}

function guessMime(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pdf: 'application/pdf'
  }
  return map[ext] || 'application/octet-stream'
}
</script>

<style scoped>
.ai-file-uploader { display: flex; flex-direction: column; gap: 8px; }

.dropzone {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  background: #fafbfc;
  flex-wrap: wrap;
}
.dropzone.dragging {
  border-color: #409eff;
  background: #ecf5ff;
}
.hint { font-size: 13px; color: #606266; }
.formats { font-size: 12px; color: #909399; flex: 1; text-align: right; }

.files {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  max-height: 120px;       /* 2026-06: 多附件时限制高度, 内部滚动, 避免撑高聊天输入区 */
  overflow-y: auto;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
}
.file-icon { color: #606266; }
.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>