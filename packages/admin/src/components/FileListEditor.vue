<template>
  <div class="file-list-editor">
    <div class="grid">
      <div v-for="fid in modelValue" :key="fid" class="grid-item">
        <el-image
          :src="fileUrlMap[fid] || ''"
          fit="cover"
          class="thumb"
          :preview-src-list="fileUrlMap[fid] ? [fileUrlMap[fid]] : []"
        >
          <template #error>
            <el-icon :size="28"><Picture /></el-icon>
          </template>
        </el-image>
        <el-button
          size="small"
          type="danger"
          :icon="Delete"
          circle
          class="remove-btn"
          @click="removeAt(fid)"
        />
      </div>
      <div v-if="modelValue.length < max" class="grid-item add-item" @click="$emit('add')">
        <el-icon :size="32"><Plus /></el-icon>
        <span>添加</span>
      </div>
    </div>
    <div class="form-tip">已选 {{ modelValue.length }} / {{ max }} 张</div>
  </div>
</template>

<script setup>
/**
 * 数组 File 编辑器 (用于 environmentImages / certificates 等 Ref<File>[] 字段)
 *
 * modelValue: ObjectId[] 数组
 * fileUrlMap: { [fileId]: url } 父组件提供, 避免每个 item 都查后端
 *
 * 用法:
 *   <FileListEditor
 *     v-model="form.environmentImages"
 *     :file-url-map="filesById"
 *     :max="30"
 *     @add="openPicker"
 *   />
 */
import { Delete, Plus, Picture } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  fileUrlMap: { type: Object, default: () => ({}) },
  max: { type: Number, default: 30 }
})
const emit = defineEmits(['update:modelValue', 'add'])

function removeAt(fid) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== fid))
}
</script>

<style scoped>
.file-list-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  max-width: 600px;
}
.grid-item {
  position: relative;
  width: 96px;
  height: 96px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #f5f7fa;
  overflow: hidden;
}
.thumb {
  width: 100%;
  height: 100%;
}
.add-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  border-style: dashed;
  gap: 4px;
  font-size: 12px;
  transition: all 0.2s;
}
.add-item:hover {
  border-color: #409eff;
  color: #409eff;
}
.remove-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  transform: scale(0.8);
}
.form-tip {
  color: #909399;
  font-size: 12px;
}
</style>
