<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
    :title="title"
    size="900px"
    direction="rtl"
    :close-on-click-modal="false"
    @open="onOpen"
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
      ref="rosterRef"
      :schedule="schedule"
      :read-only="readOnly"
      :show-evaluation-column="showEvaluationColumn"
      :expose-roster="true"
      @loaded="(r) => $emit('loaded', r)"
      @saved="$emit('saved')"
    >
      <!--
        2026-06-23: 把"展开体"迁到这个 drawer 里
          - 课评列 (row-extra): 已结束/已归档排课的考勤行后追加 EvaluationEditor
          - 补课按钮 (row-makeup): 未消课考勤的"补课"操作按钮
        父组件 (原 ClassSchedulePage, 现 ScheduleCalendar) 通过 v-slot 注入内容, drawer 本身保持通用
        2026-06-26: 上课表下线, 唯一调用方变成 ScheduleCalendar
      -->
      <template v-if="$slots['row-extra']" #row-extra="slotProps">
        <slot name="row-extra" v-bind="slotProps" />
      </template>
      <template v-if="$slots['row-makeup']" #row-makeup="slotProps">
        <slot name="row-makeup" v-bind="slotProps" />
      </template>
      <!-- 2026-06-26: header-actions slot — 日历视图通过这个 slot 注入生命周期按钮
           (准备上课 / 开始上课 / 结束 / 归档)；列表视图不传，slot 为空 → CSS 不占空间。 -->
      <template v-if="$slots['header-actions']" #header-actions>
        <slot name="header-actions" />
      </template>
    </AttendanceRosterTable>
    <template #footer>
      <div class="drawer-footer">
        <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, ref } from 'vue'
import AttendanceRosterTable from './AttendanceRosterTable.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  schedule: { type: Object, default: null },
  // 2026-06-23: 新增 readOnly 参数, 让调用方 (现 ScheduleCalendar) 可以让 completed/archived 排课走只读模式
  //   (与原 card-body 的 `:read-only="row.status !== 'in_progress'"` 保持一致)
  readOnly: { type: Boolean, default: false },
  // 2026-06-23: 透传 showEvaluationColumn — 控制 AttendanceRosterTable 是否在行尾追加「课评」列.
  //   父组件 ScheduleCalendar 按当前抽屉排课的状态决定 (completed/archived 显示, 其他隐藏).
  showEvaluationColumn: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'loaded', 'saved'])

// 暴露给父组件的命令式 API (reload / hasDirty / getDirtyCount / submit / getRoster),
// 父组件 (ScheduleCalendar) 用来在 finish/archive/makeup 后刷新名单.
const rosterRef = ref(null)
defineExpose({
  reload: () => rosterRef.value?.reload?.(),
  hasDirty: () => rosterRef.value?.hasDirty?.() || false,
  getDirtyCount: () => rosterRef.value?.getDirtyCount?.() || 0,
  submit: () => rosterRef.value?.submit?.(),
  getRoster: () => rosterRef.value?.getRoster?.() || []
})

const title = computed(() => {
  if (!props.schedule) return '开课考勤登记'
  const prefix = props.schedule.isTrialLesson ? '试听课' : '开课考勤登记'
  return `${prefix} · 第 ${props.schedule.lessonNo || '?'} 课`
})

function onOpen() {
  // 占位 — drawer open 时的初始化钩子, 后续需要时再加
}
</script>

<style scoped>
.drawer-footer { display: flex; justify-content: flex-end; gap: 8px; }
.trial-banner { margin-bottom: 12px; }
</style>