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
      list="tag-editor-suggestions"
      @keyup.enter="confirm"
      @blur="confirm"
    />
    <el-button v-else size="small" :icon="Plus" @click="showInput" :disabled="modelValue.length >= max">
      添加
    </el-button>
    <!-- 2026-08-06: P1.2 — suggestions 下拉, 用原生 HTML5 datalist (轻量, 仓库 0 处用过 el-autocomplete) -->
    <datalist v-if="suggestions.length" id="tag-editor-suggestions">
      <option v-for="s in filteredSuggestions" :key="s" :value="s" />
    </datalist>
  </div>
</template>

<script setup>
/**
 * 标签数组编辑器 (用于 teachingFeatures / businessScope / honors / Task.tags 等 String[] 字段)
 *
 * modelValue: String[] 数组
 * suggestions: String[] 可选, 输入时从 datalist 联想 (P1.2 任务标签)
 *
 * 用法:
 *   <TagEditor v-model="form.teachingFeatures" :max="30" placeholder="..." />
 *   <TagEditor v-model="task.tags" :suggestions="tagOptions" />
 */
import { ref, computed, nextTick } from 'vue'
import { Plus } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  max: { type: Number, default: 30 },
  placeholder: { type: String, default: '按 Enter 添加' },
  // 2026-08-06: P1.2 — 历史标签建议, 父组件 onMounted 拉一次传进来
  suggestions: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

const inputVisible = ref(false)
const inputValue = ref('')
const inputRef = ref()

// 过滤掉已选中的; 输入时按当前输入前缀/子串过滤 (浏览器原生气泡仍可见到全量)
const filteredSuggestions = computed(() => {
  const chosen = new Set(props.modelValue)
  const q = (inputValue.value || '').trim().toLowerCase()
  return props.suggestions
    .filter((s) => !chosen.has(s))
    .filter((s) => !q || s.toLowerCase().includes(q))
    .slice(0, 20)
})

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
