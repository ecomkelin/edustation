<template>
  <div v-loading="loading" class="roster-body">
    <!-- 头部摘要 -->
    <div class="summary">
      <div class="summary-row">
        <span class="label">开班：</span>
        <span class="value">{{ courseInstanceName }}</span>
      </div>
      <div class="summary-row">
        <span class="label">课次：</span>
        <span class="value">第 {{ lessonNo }} 课</span>
        <span class="label" style="margin-left: 24px">时间：</span>
        <span class="value">{{ formatDate(plannedStartTime, 'YYYY-MM-DD HH:mm') }} - {{ formatDate(plannedEndTime, 'HH:mm') }}</span>
      </div>
      <div class="summary-row">
        <span class="label">老师：</span>
        <span class="value">{{ teacherName }}</span>
        <span class="label" style="margin-left: 24px">教室：</span>
        <span class="value">{{ roomName }}</span>
      </div>
    </div>

    <el-alert
      v-if="rosterItems.length === 0 && !loading"
      type="info"
      :closable="false"
      show-icon
      style="margin: 12px 0"
    >
      <template #title>本节课暂无学生考勤名单</template>
      <div class="muted" style="margin-top: 4px">可能原因：本开班下没有持有有效课包（remainingLessons &gt; 0 且未过期）的学生</div>
    </el-alert>

    <el-alert
      v-else-if="!loading"
      :type="readOnly ? 'info' : 'warning'"
      :closable="false"
      show-icon
      style="margin: 12px 0"
    >
      <template #title>
        <span v-if="readOnly">名单只读</span>
        <span v-else>请逐个确认学生出勤状态：正常 / 迟到 / 请假 / 未到</span>
      </template>
      <div class="muted" style="margin-top: 4px" v-if="!readOnly">保存后写入学勤状态（<b>不扣课时</b>，扣课时走"消课"环节）。已完成消课的考勤不可再改。</div>
    </el-alert>

    <!-- 名单表 -->
    <el-table v-if="rosterItems.length" :data="rosterItems" border size="small" max-height="540">
      <el-table-column label="学生" min-width="110">
        <template #default="{ row }">
          <span v-if="row.student">{{ row.student.name }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="课包" min-width="130">
        <template #default="{ row }">
          <template v-if="row.studentProduct">
            <el-tag size="small" effect="plain">剩 {{ row.studentProduct.remainingLessons }} 节</el-tag>
            <div class="muted" style="margin-top: 2px">至 {{ formatDate(row.studentProduct.expireDate, 'YYYY-MM-DD') }}</div>
          </template>
          <template v-else>
            <el-tag size="small" type="danger" effect="plain">无课包</el-tag>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="originalStatusType(row.status)" size="small" effect="plain">{{ originalStatusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="本次登记" min-width="220">
        <template #default="{ row }">
          <el-radio-group
            v-model="row._status"
            :disabled="readOnly || isConsumedRow(row)"
            size="small"
          >
            <el-radio-button value="present">正常</el-radio-button>
            <el-radio-button value="late">迟到</el-radio-button>
            <el-radio-button value="leave">请假</el-radio-button>
            <el-radio-button value="no_show">未到</el-radio-button>
          </el-radio-group>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="140">
        <template #default="{ row }">
          <el-input
            v-model="row._remark"
            size="small"
            :disabled="readOnly || isConsumedRow(row)"
            maxlength="200"
            show-word-limit
            placeholder="可选"
          />
        </template>
      </el-table-column>
      <!-- 可选：行尾插槽。新页面用此插槽渲染课评表单；抽屉不传则为空。 -->
       <!-- 「补课」操作列：仅当排课处于「已结束/已归档」、且该考勤未消课/未补课时显示。
           内容由父组件通过 #row-makeup 插槽注入（通常是「补课」按钮 + 弹框）。 -->
      <el-table-column v-if="canMakeupColumn" label="操作" width="90" align="center">
        <template #default="{ row }">
          <slot
            v-if="!isConsumedRow(row)"
            name="row-makeup"
            :row="row"
          />
          <el-tag v-else-if="row.status === 'madeup'" size="small" type="warning" effect="plain">已补</el-tag>
          <el-tag v-else size="small" type="success" effect="plain">已消课</el-tag>
        </template>
      </el-table-column>
            <slot name="row-extra" :row="row" />
    </el-table>

    <!-- 底部批量操作 -->
    <div v-if="rosterItems.length && !readOnly" class="bulk-actions">
      <el-button size="small" @click="setAll('present')">全部正常</el-button>
      <el-button size="small" @click="setAll('late')">全部迟到</el-button>
      <el-button size="small" @click="setAll('leave')">全部请假</el-button>
      <el-button size="small" @click="setAll('no_show')">全部未到</el-button>
      <span class="muted">已选：{{ summary.counts.present }} 正常 / {{ summary.counts.late }} 迟到 / {{ summary.counts.leave }} 请假 / {{ summary.counts.no_show }} 未到</span>
      <span class="spacer" />
      <!-- 关键：未保存变更提示 + 保存按钮。
           之前漏了这个按钮，导致用户在 radio 上选「请假/未到」后只改了本地 _status，
           从未调 bulkMark；点「结束」时后端仍把考勤当 checked_in，错误扣课时。 -->
      <el-tag v-if="dirtyCount > 0" type="warning" size="small" effect="dark">未保存 {{ dirtyCount }} 处变更</el-tag>
      <el-button
        size="small"
        type="primary"
        :loading="submitting"
        :disabled="dirtyCount === 0"
        @click="onSubmit"
      >保存考勤</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { formatDate } from '@/utils/format'

const props = defineProps({
  // 当前排课（用于定位 attendance 列表 + 头部摘要）
  schedule: { type: Object, required: true },
  // 只读模式：状态非进行中或排课已归档/已取消时为 true
  readOnly: { type: Boolean, default: false },
  // 暴露给父组件的 roster ref（在抽屉里无意义，新页面用它来获取已加载名单）
  exposeRoster: { type: Boolean, default: false }
})
const emit = defineEmits(['loaded', 'saved'])

// UI 状态 → 后端 AttendanceStatus
const UI_TO_BACKEND = {
  present: 'checked_in',  // 正常
  late: 'checked_in',     // 迟到（仍是 checked_in，靠备注 + actualStartTime 体现）
  leave: 'leave',         // 请假
  no_show: 'no_show'      // 未到
}
const BACKEND_ORIGINAL_LABELS = {
  scheduled: '待上课',
  checked_in: '已签到',
  completed: '已消课',
  madeup: '已补',
  no_show: '未到',
  leave: '请假'
}
const BACKEND_ORIGINAL_TYPES = {
  scheduled: 'info',
  checked_in: 'warning',
  completed: 'success',
  madeup: 'warning',
  no_show: 'danger',
  leave: ''
}

/**
 * 是否已扣课时（不再允许修改考勤状态 / 备注 / 补课）。
 * 等价于 status ∈ ['completed', 'madeup']；抽出 helper 是为了和"是否要显示 makeup 按钮"等
 * 业务判断保持一致——后续如果增加"消课撤回"，只需调整这一处。
 */
function isConsumed(s) {
  return s === 'completed' || s === 'madeup'
}

const loading = ref(false)
const submitting = ref(false)
// [{ id, student, studentProduct, status, evaluation, _status, _remark }]
const rosterItems = ref([])

const courseInstanceName = computed(() => {
  const ci = props.schedule.courseInstance
  if (!ci) return '—'
  return ci.name || (ci.courseProduct && ci.courseProduct.name) || '—'
})
const lessonNo = computed(() => props.schedule?.lessonNo || '?')
const plannedStartTime = computed(() => props.schedule?.plannedStartTime)
const plannedEndTime = computed(() => props.schedule?.plannedEndTime)
const teacherName = computed(() => {
  const t = props.schedule?.teacher
  return t ? (t.realName || t.mobile) : '—'
})
const roomName = computed(() => {
  const r = props.schedule?.room
  return r ? r.name : '—'
})

/**
 * 「补课」操作列是否显示：仅当排课处于「已结束/已归档」时显示。
 * 其他状态（preparing / in_progress）不允许补课，无操作列。
 */
const canMakeupColumn = computed(() => {
 const s = props.schedule && props.schedule.status
 return s === 'completed' || s === 'archived'
})

const summary = computed(() => {
  const counts = { present: 0, late: 0, leave: 0, no_show: 0 }
  for (const it of rosterItems.value) {
    if (counts[it._status] !== undefined) counts[it._status]++
  }
  return { counts }
})

/**
 * 统计「dirty」变更数量：状态或备注相对后端值有变化。
 * 用于：1) 显示「未保存 N 处」标签；2) 保存按钮 disabled 状态；3) 父组件判断「结束前是否需要先 flush」。
 */
const dirtyCount = computed(() => {
  let n = 0
  for (const it of rosterItems.value) {
    if (isConsumed(it.status)) continue // 已消课/已补 不可改
    const target = UI_TO_BACKEND[it._status]
    const statusChanged = (
      (it.status === 'no_show' && it._status !== 'no_show') ||
      (it.status === 'leave' && it._status !== 'leave') ||
      ((it.status === 'scheduled' || it.status === 'checked_in') && (it._status === 'leave' || it._status === 'no_show'))
    )
    const remarkChanged = (it._remark || '') !== (it.remark || '')
    if (statusChanged || remarkChanged) n++
  }
  return n
})

function originalStatusLabel(s) { return BACKEND_ORIGINAL_LABELS[s] || s || '待上课' }
function originalStatusType(s) { return BACKEND_ORIGINAL_TYPES[s] || '' }
// 行级"是否已扣课时"判断（radio / 备注 disable / makeup 按钮 / setAll / onSubmit 复用）
function isConsumedRow(row) { return isConsumed(row && row.status) }

defineExpose({
  /** 重新拉取名单（新页面在归档成功后调用以刷新） */
  async reload() { await loadRoster() },
  /** 当前已加载名单（只读快照） */
  getRoster() { return rosterItems.value.slice() },
  /** 提交当前 dirty 变更（抽屉仍由自己调用；新页面也复用） */
  async submit() { await onSubmit() },
  /** 当前是否有未保存变更（父组件在「结束」前判断要不要先 flush） */
  hasDirty() { return dirtyCount.value > 0 },
  /** 当前未保存变更数（用于 toast 展示） */
  getDirtyCount() { return dirtyCount.value }
})

watch(
  () => props.schedule && props.schedule._id,
  () => { if (props.schedule && props.schedule._id) loadRoster() },
  { immediate: true }
)

async function loadRoster() {
  loading.value = true
  try {
    const r = await lessonAttendanceApi.list({
      lessonSchedule: props.schedule._id,
      pageSize: 200
    })
    const raw = r.data?.items || r.data || []
    rosterItems.value = raw.map((it) => {
      // 后端状态 → UI 状态
      let ui = 'present'
      if (it.status === 'no_show') ui = 'no_show'
      else if (it.status === 'leave') ui = 'leave'
      else if (it.status === 'checked_in') ui = 'present'
      else if (it.status === 'completed') ui = 'present'
      // 补课记录：默认显示为"正常"（实际场景里已经是另一条已扣课时的考勤，无需重新登记）
      else if (it.status === 'madeup') ui = 'present'
      return {
        id: it._id || it.id,
        student: it.student,
        studentProduct: it.studentProduct,
        status: it.status,
        evaluation: it.evaluation || null,
        _status: ui,
        _remark: it.remark || '',
        _eval: {
          score: it.evaluation?.score ?? null,
          content: it.evaluation?.content ?? '',
          strengths: it.evaluation?.strengths ?? '',
          improvements: it.evaluation?.improvements ?? ''
        }
      }
    })
    if (props.exposeRoster) emit('loaded', rosterItems.value.slice())
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载名单失败')
  } finally {
    loading.value = false
  }
}

function setAll(status) {
  for (const it of rosterItems.value) {
    if (isConsumed(it.status)) continue
    it._status = status
  }
}

async function onSubmit() {
  if (!props.schedule || !rosterItems.value.length) {
    ElMessage.warning('本节课暂无学生考勤，无需保存')
    return
  }
  submitting.value = true
  try {
    const items = []
    for (const it of rosterItems.value) {
      if (isConsumed(it.status)) continue // 已消课/已补 不可改
      const target = UI_TO_BACKEND[it._status]
      const statusChanged = (
        (it.status === 'no_show' && it._status !== 'no_show') ||
        (it.status === 'leave' && it._status !== 'leave') ||
        ((it.status === 'scheduled' || it.status === 'checked_in') && (it._status === 'leave' || it._status === 'no_show'))
      )
      const remarkChanged = (it._remark || '') !== (it.remark || '')
      if (!statusChanged && !remarkChanged) continue
      items.push({ attendance: it.id, status: target, remark: it._remark || undefined })
    }
    if (items.length === 0) {
      ElMessage.info('没有需要保存的变更')
      emit('saved', { count: 0 })
      return
    }
    await lessonAttendanceApi.bulkMark({
      lessonSchedule: props.schedule._id,
      items
    })
    ElMessage.success(`已保存 ${items.length} 条考勤变更`)
    emit('saved', { count: items.length })
    await loadRoster()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.roster-body { padding: 0 4px; }
.summary {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 8px;
}
.summary-row { font-size: 13px; line-height: 1.8; color: #303133; }
.summary-row .label { color: #909399; margin-right: 4px; }
.summary-row .value { font-weight: 500; }
.bulk-actions {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 12px; padding-top: 12px; border-top: 1px solid #ebeef5;
}
.bulk-actions .spacer { flex: 1; }
.muted { color: #909399; font-size: 12px; }
</style>