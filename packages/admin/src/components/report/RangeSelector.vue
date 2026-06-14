<template>
  <div class="range-selector">
    <el-radio-group v-model="local.range" size="default" @change="emitChange">
      <el-radio-button label="today">今日</el-radio-button>
      <el-radio-button label="week">本周</el-radio-button>
      <el-radio-button label="month">本月</el-radio-button>
      <el-radio-button label="custom">自定义</el-radio-button>
    </el-radio-group>
    <template v-if="local.range === 'custom'">
      <el-date-picker
        v-model="fromValue"
        type="datetime"
        placeholder="开始时间"
        value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
        @change="emitChange"
        style="width: 200px; margin-left: 8px"
      />
      <el-date-picker
        v-model="toValue"
        type="datetime"
        placeholder="结束时间（可空）"
        value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
        @change="emitChange"
        style="width: 200px; margin-left: 4px"
      />
    </template>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ range: 'month', from: '', to: '' })
  }
})
const emit = defineEmits(['update:modelValue', 'change'])

const local = reactive({ range: props.modelValue.range || 'month' })
const fromValue = ref(props.modelValue.from || null)
const toValue = ref(props.modelValue.to || null)

// 父组件外部修改 modelValue 时同步回来
watch(() => props.modelValue, (v) => {
  const next = v || { range: 'month', from: '', to: '' }
  local.range = next.range || 'month'
  fromValue.value = next.from || null
  toValue.value = next.to || null
})

function emitChange() {
  const next = {
    range: local.range,
    from: local.range === 'custom' && fromValue.value ? fromValue.value : '',
    to: local.range === 'custom' && toValue.value ? toValue.value : ''
  }
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<style scoped>
.range-selector {
  display: inline-flex;
  align-items: center;
}
</style>
