<template>
  <div class="report-board">
    <div class="board-header">
      <h3 class="board-title">
        <span v-if="icon" class="board-icon">{{ icon }}</span>
        {{ title }}
      </h3>
      <div class="board-header-right">
        <span class="generated-at" v-if="generatedAt">更新于 {{ generatedAt }}</span>
        <RangeSelector v-model="rangeState" @change="onRangeChange" />
        <el-button :loading="loading" @click="onRefresh" type="primary" plain size="default">
          <el-icon><Refresh /></el-icon><span>刷新</span>
        </el-button>
      </div>
    </div>
    <p v-if="hint" class="hint">{{ hint }}</p>
    <el-card class="board" shadow="never" v-loading="loading">
      <slot name="kpis" />
      <slot />
    </el-card>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import RangeSelector from './RangeSelector.vue'

const props = defineProps({
  title: { type: String, required: true },
  hint: { type: String, default: '' },
  icon: { type: String, default: '' },
  // 当前 range 状态（v-model 风格：父组件持有 currentRange 完整对象）
  modelValue: {
    type: Object,
    default: () => ({ range: 'month', from: '', to: '' })
  },
  // 由 useReportApi 透传
  loading: { type: Boolean, default: false },
  generatedAt: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'range-change'])

const rangeState = ref({ ...props.modelValue })

watch(() => props.modelValue, (v) => {
  rangeState.value = { ...v }
}, { deep: true })

function onRangeChange(next) {
  rangeState.value = { ...next }
  emit('update:modelValue', { ...next })
  emit('range-change', { ...next })
}

function onRefresh() {
  // 刷新 = 用当前 range 重查
  emit('range-change', { ...rangeState.value })
}

defineExpose({ rangeState })
</script>

<style scoped>
.report-board { margin-bottom: 16px; }
.board-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.board-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.board-icon { font-size: 20px; }
.board-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.generated-at {
  color: #909399;
  font-size: 13px;
}
.hint {
  color: #606266;
  font-size: 13px;
  margin: 4px 0 12px;
}
.board { margin-bottom: 16px; }
</style>
