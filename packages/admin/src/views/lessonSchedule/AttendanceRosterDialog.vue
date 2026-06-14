<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
    :title="title"
    size="720px"
    direction="rtl"
    :close-on-click-modal="false"
  >
    <!-- 招生试听 (2026-06): 试听课显示横幅, 提示"请到试听看板"看名单, 不在这里做考勤 -->
    <el-alert
      v-if="schedule && schedule.isTrialLesson"
      type="warning"
      :closable="false"
      show-icon
      class="trial-banner"
    >
      <template #title>
        这是试听课, 考勤请到 <strong>招生试听 → 试听记录</strong> 看板操作 (打卡 / 完成 / 转化)
      </template>
    </el-alert>
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
  const prefix = props.schedule.isTrialLesson ? '试听课' : '开课考勤登记'
  return `${prefix} · 第 ${props.schedule.lessonNo || '?'} 课`
})

function onSaved() {
  emit('done')
}
</script>

<style scoped>
.drawer-footer { display: flex; justify-content: flex-end; gap: 8px; }
.trial-banner { margin-bottom: 12px; }
</style>