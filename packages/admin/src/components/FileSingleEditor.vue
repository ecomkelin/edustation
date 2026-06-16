<template>
  <div class="file-single-editor">
    <div v-if="file" class="file-preview">
      <el-image :src="file.url" fit="cover" class="thumb" :preview-src-list="[file.url]">
        <template #error>
          <el-icon :size="28"><Picture /></el-icon>
        </template>
      </el-image>
      <div class="file-actions">
        <el-button size="small" @click="$emit('pick')">更换</el-button>
        <el-button size="small" link type="danger" @click="onClear">清除</el-button>
      </div>
      <div class="file-name">{{ file.originalName || file.filename || '' }}</div>
    </div>
    <div v-else class="file-empty">
      <el-button size="small" :icon="Upload" @click="$emit('pick')">选择图片</el-button>
      <span class="form-tip">支持 jpg/png/webp/gif/svg，≤ 20MB</span>
    </div>
  </div>
</template>

<script setup>
/**
 * 单值 File 编辑器 (用于 wechatQrcode / sharePoster 等 Ref<File> 单值字段)
 *
 * 用法:
 *   <FileSingleEditor
 *     v-model="form.wechatQrcode"
 *     :file="filesById[form.wechatQrcode]"
 *     @pick="openPicker"
 *     @clear="form.wechatQrcode = null"
 *   />
 */
import { Upload, Picture } from '@element-plus/icons-vue'

defineProps({
  modelValue: { type: [String, Object], default: null },
  file: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'pick', 'clear'])

function onClear() {
  emit('update:modelValue', null)
  emit('clear')
}
</script>

<style scoped>
.file-single-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-preview {
  display: flex;
  align-items: center;
  gap: 12px;
}
.thumb {
  width: 80px;
  height: 80px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #f5f7fa;
}
.file-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.file-name {
  font-size: 12px;
  color: #909399;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-empty {
  display: flex;
  align-items: center;
  gap: 8px;
}
.form-tip {
  color: #909399;
  font-size: 12px;
}
</style>
