<template>
  <div class="tag-editor">
    <el-tag
      v-for="(tag, i) in modelValue"
      :key="i"
      closable
      class="tag-chip"
      @close="removeAt(i)"
    >
      {{ tag }}
    </el-tag>
    <el-input
      v-if="inputVisible"
      ref="inputRef"
      v-model="inputValue"
      size="small"
      class="tag-input"
      :maxlength="50"
      @keyup.enter="confirm"
      @blur="confirm"
    />
    <el-button v-else size="small" :icon="Plus" @click="showInput" :disabled="modelValue.length >= max">
      添加
    </el-button>
  </div>
</template>

<script setup>
/**
 * 标签数组编辑器 (用于 teachingFeatures / businessScope / honors 等 String[] 字段)
 *
 * modelValue: String[] 数组
 *
 * 用法:
 *   <TagEditor v-model="form.teachingFeatures" :max="30" placeholder="..." />
 */
import { ref, nextTick } from 'vue'
import { Plus } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  max: { type: Number, default: 30 },
  placeholder: { type: String, default: '按 Enter 添加' }
})
const emit = defineEmits(['update:modelValue'])

const inputVisible = ref(false)
const inputValue = ref('')
const inputRef = ref()

function showInput() {
  inputVisible.value = true
  nextTick(() => {
    inputRef.value && inputRef.value.focus && inputRef.value.focus()
  })
}

function confirm() {
  const v = (inputValue.value || '').trim()
  if (v && props.modelValue.length < props.max) {
    emit('update:modelValue', [...props.modelValue, v])
  }
  inputValue.value = ''
  inputVisible.value = false
}

function removeAt(i) {
  const arr = [...props.modelValue]
  arr.splice(i, 1)
  emit('update:modelValue', arr)
}
</script>

<style scoped>
.tag-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.tag-chip {
  margin: 0;
}
.tag-input {
  width: 160px;
}
</style>
