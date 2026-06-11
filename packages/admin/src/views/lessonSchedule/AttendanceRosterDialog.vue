<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
    :title="title"
    size="720px"
    direction="rtl"
    :close-on-click-modal="false"
  >
    <AttendanceRosterTable
      v-if="schedule"
      :schedule="schedule"
      :read-only="false"
      @saved="onSaved"
    />
    <template #footer>
      <div class="drawer-footer">
        <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed } from 'vue'
import AttendanceRosterTable from './AttendanceRosterTable.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  schedule: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'done'])

const title = computed(() => {
  if (!props.schedule) return '开课考勤登记'
  return `开课考勤登记 · 第 ${props.schedule.lessonNo || '?'} 课`
})

function onSaved() {
  emit('done')
}
</script>

<style scoped>
.drawer-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>