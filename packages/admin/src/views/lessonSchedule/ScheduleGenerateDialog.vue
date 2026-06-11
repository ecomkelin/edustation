<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
    :title="courseInstance ? `为开班排课 · ${instanceLabel}` : '为开班排课'"
    width="900px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <el-form :model="form" label-width="100px" v-loading="loadingInst">
      <!-- 1. 选择开班 -->
      <el-form-item label="开班" required>
        <el-select
          v-model="form.courseInstance"
          :disabled="!!courseInstance"
          filterable
          placeholder="选择要排课的开班"
          style="width: 100%"
          @change="onInstanceChange"
        >
          <el-option
            v-for="c in instanceOptions"
            :key="c._id"
            :label="optionLabel(c)"
            :value="c._id"
          />
        </el-select>
        <div v-if="!loadingInst && courseInstanceSelectable && !instanceOptions.length" class="form-hint">
          当前没有可排课的"开班"（已排满 / 已结班 / 已取消的已隐藏）
        </div>
      </el-form-item>

      <!-- 2. schedulePlan 概要 + 进度 -->
      <template v-if="plan">
        <el-divider content-position="left">排课计划</el-divider>
        <el-descriptions :column="2" size="small" border>
          <el-descriptions-item label="模式">
            <el-tag size="small">{{ plan.mode === 'cycle' ? '上 X 休 Y' : '每周 N 节' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="计划总课次">{{ plan.totalPlannedLessons }}</el-descriptions-item>
          <el-descriptions-item v-if="plan.mode === 'weekly'" label="每周课次">
            {{ plan.lessonsPerWeek }} 节
            <span v-if="plan.restDays && plan.restDays.length" class="muted">
              （休：{{ plan.restDays.map((d) => WEEKDAYS[d]).join('、') }}）
            </span>
          </el-descriptions-item>
          <el-descriptions-item v-if="plan.mode === 'cycle'" label="节奏">
            上 {{ plan.cycleOnDays }} 休 {{ plan.cycleOffDays }}
          </el-descriptions-item>
          <el-descriptions-item label="单节时长">
            {{ plan.minutesPerLesson || cpFallbackMinutes || '—' }} 分钟
          </el-descriptions-item>
          <el-descriptions-item label="进度">
            <el-progress
              :percentage="progressPct"
              :stroke-width="14"
              :text-inside="true"
              :format="() => `${alreadyScheduled} / ${plan.totalPlannedLessons}`"
            />
          </el-descriptions-item>
        </el-descriptions>
        <div class="remaining-bar">
          <el-tag type="success" size="default" effect="plain">还可生成 {{ remaining }} 节</el-tag>
          <span v-if="remaining <= 0" class="hint-warn">本开班所有排课已排满（已达 {{ plan.totalPlannedLessons }} 节）</span>
        </div>
      </template>

      <!-- 3. 排课参数（不再放"本节主题"——见预览表格里每节可单独填） -->
      <el-divider content-position="left">排课参数</el-divider>
      <el-form-item label="起始日期" required>
        <el-date-picker
          v-model="form.startDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选第一节课日期"
          :disabled="!form.courseInstance || remaining <= 0"
        />
        <div class="form-hint">cycle 模式：从这天起按"上 X 休 Y"滚动；weekly 模式：从这周开始按"每周 N 节"排。</div>
      </el-form-item>
      <el-form-item label="上课时间" required>
        <el-time-picker
          v-model="form.startTime"
          placeholder="开始"
          format="HH:mm"
          value-format="HH:mm"
          :disabled="!form.courseInstance"
          style="width: 120px"
        />
        <span class="dash">-</span>
        <el-time-picker
          v-model="form.endTime"
          placeholder="结束"
          format="HH:mm"
          value-format="HH:mm"
          :disabled="!form.courseInstance"
          style="width: 120px"
        />
        <div class="form-hint">所有生成的排课都用这个时间区间</div>
      </el-form-item>
      <!-- 老师/教室：默认由开班带出来，可点"更换"展开下拉 -->
      <el-form-item label="老师">
        <div class="locked-field">
          <el-tag v-if="form.teacher" type="info" effect="plain">
            {{ teacherLabel }}
          </el-tag>
          <span v-else class="muted">未设置</span>
          <el-button v-if="form.courseInstance" link type="primary" @click="overrideTeacher = !overrideTeacher">
            {{ overrideTeacher ? '取消更换' : '更换' }}
          </el-button>
        </div>
        <el-select
          v-if="overrideTeacher"
          v-model="form.teacher"
          filterable
          placeholder="选择老师"
          style="width: 100%; margin-top: 6px"
        >
          <el-option v-for="t in teachers" :key="t.id" :label="t.realName || t.mobile" :value="t.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="教室">
        <div class="locked-field">
          <el-tag v-if="form.room" type="info" effect="plain">
            {{ roomLabel }}
          </el-tag>
          <span v-else class="muted">未设置</span>
          <el-button v-if="form.courseInstance" link type="primary" @click="overrideRoom = !overrideRoom">
            {{ overrideRoom ? '取消更换' : '更换' }}
          </el-button>
        </div>
        <el-select
          v-if="overrideRoom"
          v-model="form.room"
          filterable
          placeholder="选择教室"
          style="width: 100%; margin-top: 6px"
        >
          <el-option v-for="r in rooms" :key="r._id" :label="r.name" :value="r._id" />
        </el-select>
      </el-form-item>

      <!-- 4. 预览：每节一个"本节主题"输入框（题目本来就是逐节不同的） -->
      <template v-if="previewItems && previewItems.length">
        <el-divider content-position="left">
          <span>预览</span>
          <el-tag type="success" size="default" effect="plain" style="margin-left: 8px">
            可生成 {{ previewTotalCount }} 节
          </el-tag>
          <span v-if="previewItems.length < previewTotalCount" class="muted" style="margin-left: 8px">
            （仅展示前 {{ previewItems.length }} 节，下方表格里可逐节填主题）
          </span>
        </el-divider>
        <el-alert
          v-if="conflicts && conflicts.length"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 8px"
        >
          <template #title>检测到 {{ conflicts.length }} 处冲突，请调整老师/教室/时间，或在下方表格里删除冲突行后再生成</template>
          <div style="margin-top: 4px; max-height: 120px; overflow: auto">
            <div v-for="c in conflicts" :key="`${c.entryLessonNo || 0}-${c.id}`" class="conflict-item">
              <template v-if="c.entryLessonNo != null">
                · 本次第 <strong>{{ c.entryLessonNo }}</strong> 课
                与「{{ c.courseInstance?.name || '?' }}」第 {{ c.lessonNo }} 课冲突（{{ formatDate(c.plannedStartTime, 'MM-DD HH:mm') }}-{{ formatDate(c.plannedEndTime, 'HH:mm') }}，{{ c.teacher?.name || '-' }} / {{ c.room?.name || '-' }}）
              </template>
              <template v-else>
                · 与「{{ c.courseInstance?.name || '?' }}」第 {{ c.lessonNo }} 课冲突
                {{ formatDate(c.plannedStartTime, 'MM-DD HH:mm') }}-{{ formatDate(c.plannedEndTime, 'HH:mm') }}
                （老师：{{ c.teacher?.name || '-' }} / 教室：{{ c.room?.name || '-' }}）
              </template>
            </div>
          </div>
        </el-alert>
        <el-table
          :data="previewItems"
          border
          size="small"
          max-height="360"
          :row-class-name="conflictRowClass"
        >
          <el-table-column label="课次" prop="lessonNo" width="60">
            <template #default="{ row }">
              <span :class="{ 'conflict-row': isRowConflict(row) }">
                {{ row.lessonNo }}
                <el-tooltip v-if="isRowConflict(row)" content="与已有排课冲突" placement="top">
                  <el-icon style="color: #f56c6c; margin-left: 4px"><Warning /></el-icon>
                </el-tooltip>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="日期" width="110">
            <template #default="{ row }">{{ formatDate(row.plannedStartTime, 'YYYY-MM-DD') }}</template>
          </el-table-column>
          <el-table-column label="星期" width="60">
            <template #default="{ row }">{{ WEEKDAYS[new Date(row.plannedStartTime).getDay()] }}</template>
          </el-table-column>
          <el-table-column label="时间" width="120">
            <template #default="{ row }">
              {{ formatDate(row.plannedStartTime, 'HH:mm') }}-{{ formatDate(row.plannedEndTime, 'HH:mm') }}
            </template>
          </el-table-column>
          <el-table-column label="老师" min-width="90">
            <template #default="{ row }">{{ row.teacherLabel || '—' }}</template>
          </el-table-column>
          <el-table-column label="教室" min-width="90">
            <template #default="{ row }">{{ row.roomLabel || '—' }}</template>
          </el-table-column>
          <el-table-column label="本节主题" min-width="180">
            <template #default="{ row }">
              <el-input
                v-model="row.title"
                size="small"
                maxlength="100"
                show-word-limit
                placeholder="可选"
              />
            </template>
          </el-table-column>
          <el-table-column label="" width="72" align="center" fixed="right">
            <template #default="{ row, $index }">
              <el-button
                link
                type="danger"
                :disabled="previewItems.length <= 1"
                @click="removePreviewRow($index)"
              >删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        v-if="form.courseInstance"
        :loading="loadingPreview"
        @click="onPreview"
      >预览</el-button>
      <el-button
        type="primary"
        :loading="loadingSubmit"
        :disabled="!previewItems || !previewItems.length || hasRemainingConflictRows"
        @click="onSubmit"
      >
        生成 {{ previewItems ? previewItems.length : '' }} 节
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Warning } from '@element-plus/icons-vue'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { courseInstanceApi } from '@/api/courseInstance'
import { userApi } from '@/api/user'
import { roomApi } from '@/api/room'
import { formatDate } from '@/utils/format'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  courseInstance: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'done'])

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const loadingInst = ref(false)
const loadingPreview = ref(false)
const loadingSubmit = ref(false)

const form = reactive({
  courseInstance: '',
  startDate: '',
  startTime: '09:00',
  endTime: '10:30',
  teacher: '',
  room: ''
})

const instanceOptions = ref([]) // 候选开班（剔除已排满 / 取消 / 关闭）
const teachers = ref([])
const rooms = ref([])

// 老师/教室是否被手动覆盖（默认从开班带出，点"更换"后可改）
const overrideTeacher = ref(false)
const overrideRoom = ref(false)

const currentInst = ref(null) // 当前选中的开班详情
const plan = computed(() => currentInst.value?.schedulePlan || null)
const cpFallbackMinutes = computed(() => {
  const cp = currentInst.value?.courseProduct
  return cp?.minutesPerLesson || null
})
const alreadyScheduled = computed(() => currentInst.value?.scheduledCount || 0)
const remaining = computed(() => plan.value ? Math.max(0, plan.value.totalPlannedLessons - alreadyScheduled.value) : 0)
const progressPct = computed(() => {
  if (!plan.value || !plan.value.totalPlannedLessons) return 0
  return Math.min(100, Math.round((alreadyScheduled.value / plan.value.totalPlannedLessons) * 100))
})
const instanceLabel = computed(() => {
  const c = currentInst.value
  if (!c) return ''
  return c.name || (c.courseProduct && c.courseProduct.name) || '?'
})

// 当前显示的老师/教室名（从开班带出来）
const teacherLabel = computed(() => {
  const t = currentInst.value?.teacher
  if (!t) return '未设置'
  return t.realName || t.mobile || '?'
})
const roomLabel = computed(() => {
  const r = currentInst.value?.room
  if (!r) return '未设置'
  return r.name || '?'
})

// "本开班共 N 节"——preview 时由后端返回的 remaining 覆盖（更准确）
const previewTotalCount = ref(0)
const previewItems = ref(null)
const conflicts = ref(null)

const courseInstanceSelectable = computed(() => !props.courseInstance)

watch(() => props.modelValue, (v) => {
  if (v) onOpen()
  else resetAll()
})

watch(() => props.courseInstance, (v) => {
  if (v && v._id) {
    form.courseInstance = v._id
    loadInstanceDetail(v._id)
  }
}, { immediate: true })

function optionLabel(c) {
  const product = c.courseProduct && c.courseProduct.name
  const scheduled = c.scheduledCount || 0
  const total = (c.schedulePlan && c.schedulePlan.totalPlannedLessons) || 0
  const remain = Math.max(0, total - scheduled)
  return c.name
    ? `${c.name}（${product || '?'}，还可排 ${remain} 节）`
    : (product || c._id)
}

function resetAll() {
  Object.assign(form, {
    courseInstance: props.courseInstance?._id || '',
    startDate: '',
    startTime: '09:00',
    endTime: '10:30',
    teacher: '',
    room: ''
  })
  overrideTeacher.value = false
  overrideRoom.value = false
  currentInst.value = null
  previewItems.value = null
  previewTotalCount.value = 0
  conflicts.value = null
}

async function onOpen() {
  resetAll()
  await loadDeps()
  if (props.courseInstance && props.courseInstance._id) {
    form.courseInstance = props.courseInstance._id
    await loadInstanceDetail(props.courseInstance._id)
  } else {
    await loadInstanceOptions()
  }
}

async function loadDeps() {
  const [u, rm] = await Promise.all([
    userApi.list({ pageSize: 200 }),
    roomApi.list()
  ])
  teachers.value = (u.data?.items || []).filter((x) => x.positions?.some((p) => p.name === '老师'))
  rooms.value = rm.data || []
}

/**
 * 加载可排课的开班列表：
 *  - 状态 ∈ {planning, enrolling, active}
 *  - scheduledCount < schedulePlan.totalPlannedLessons（已排满的不显示）
 */
async function loadInstanceOptions() {
  const r = await courseInstanceApi.list({ pageSize: 500 })
  instanceOptions.value = (r.data || []).filter((c) => {
    if (!['planning', 'enrolling', 'active'].includes(c.status)) return false
    const total = (c.schedulePlan && c.schedulePlan.totalPlannedLessons) || 0
    const scheduled = c.scheduledCount || 0
    return scheduled < total
  })
}

async function loadInstanceDetail(id) {
  loadingInst.value = true
  try {
    const r = await courseInstanceApi.detail(id)
    const inst = r.data
    currentInst.value = inst
    // 老师/教室默认从开班带出（用户没手动覆盖时才覆盖）
    if (!overrideTeacher.value) {
      form.teacher = inst.teacher?._id || inst.teacher || ''
    }
    if (!overrideRoom.value) {
      form.room = inst.room?._id || inst.room || ''
    }
    // 默认开始日期 = 开班 startDate
    if (inst.startDate) {
      form.startDate = String(inst.startDate).slice(0, 10)
    }
    // 默认时间 = minutesPerLesson
    const minutes = inst.schedulePlan?.minutesPerLesson || inst.courseProduct?.minutesPerLesson || 90
    if (!form.startTime || !form.endTime) {
      form.startTime = '09:00'
      const h = 9 + Math.floor(minutes / 60)
      const m = minutes % 60
      form.endTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  } finally {
    loadingInst.value = false
  }
}

function onInstanceChange(id) {
  if (id) loadInstanceDetail(id)
  // 切换开班 → 收回手动覆盖状态，让新开班的老师/教室自动带出
  overrideTeacher.value = false
  overrideRoom.value = false
  // 清掉旧预览
  previewItems.value = null
  previewTotalCount.value = 0
  conflicts.value = null
}

/**
 * 判断预览行是否与已有排课冲突。
 * 后端精确检测会带 entryLessonNo（本次预览的第几节冲突）；单条 create 的冲突响应不带这个字段，
 * 视为"整节课冲突"（单条场景下，本预览表里只会有一行，所以用 entryLessonNo = 1 兜底）。
 */
function isRowConflict(row) {
  if (!row || !conflicts.value || conflicts.value.length === 0) return false
  return conflicts.value.some((c) => {
    // 后端精确检测：有 entryLessonNo 时按节号比对（最准）
    if (c.entryLessonNo != null) {
      return Number(c.entryLessonNo) === Number(row.lessonNo)
    }
    // 兜底：单条冲突（无 entryLessonNo）→ 视为本预览的整张表冲突
    return true
  })
}

function conflictRowClass({ row }) {
  return isRowConflict(row) ? 'is-conflict-row' : ''
}

// 还有几行残留冲突（用户没删干净）—— 用来禁用"生成"按钮
const hasRemainingConflictRows = computed(() => {
  if (!previewItems.value || previewItems.value.length === 0) return false
  return previewItems.value.some((r) => isRowConflict(r))
})

async function removePreviewRow(index) {
  if (!previewItems.value || previewItems.value.length <= 1) {
    return ElMessage.warning('至少保留 1 节')
  }
  try {
    await ElMessageBox.confirm(
      `确定从预览中移除第 ${previewItems.value[index].lessonNo} 课？此操作不影响数据库，仅在本次生成前生效。`,
      '确认删除预览行',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }
  previewItems.value.splice(index, 1)
  ElMessage.success('已移除 1 行预览')
}

async function onPreview() {
  previewItems.value = null
  previewTotalCount.value = 0
  conflicts.value = null
  if (!form.courseInstance) return ElMessage.warning('请选择开班')
  if (!form.startDate) return ElMessage.warning('请选择起始日期')
  if (!form.startTime || !form.endTime) return ElMessage.warning('请填写上课时间')
  if (remaining.value <= 0) return ElMessage.warning('本开班已排满')
  loadingPreview.value = true
  try {
    const r = await lessonScheduleApi.preview({
      courseInstance: form.courseInstance,
      startDate: form.startDate,
      startTime: form.startTime,
      endTime: form.endTime,
      teacher: form.teacher || undefined,
      room: form.room || undefined,
      count: 50 // 拉更多用于编辑主题（仍然可在 generate 时按 remaining 截断）
    })
    const teacherMap = new Map(teachers.value.map((t) => [String(t.id), t.realName || t.mobile]))
    const roomMap = new Map(rooms.value.map((r) => [String(r._id), r.name]))
    const finalTeacher = form.teacher || (currentInst.value?.teacher && currentInst.value.teacher._id)
    const finalRoom = form.room || (currentInst.value?.room && currentInst.value.room._id)
    previewItems.value = r.data.entries.map((e) => ({
      ...e,
      title: '', // 每节主题可单独填
      teacherLabel: teacherMap.get(String(e.teacher)) || teacherMap.get(String(finalTeacher)) || '—',
      roomLabel: roomMap.get(String(e.room)) || roomMap.get(String(finalRoom)) || '—'
    }))
    // 后端返回的 remaining 是该开班的实际剩余节数（preview / generate 都用这个上限）
    previewTotalCount.value = r.data.remaining || r.data.entries.length
    conflicts.value = r.data.conflicts || []
    if (r.data.entries.length === 0) {
      ElMessage.info('没有可生成的排课（可能已排满）')
    } else if (conflicts.value.length > 0) {
      ElMessage.warning(`检测到 ${conflicts.value.length} 处冲突`)
    } else {
      ElMessage.success(`可生成 ${previewTotalCount.value} 节`)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '预览失败')
  } finally {
    loadingPreview.value = false
  }
}

async function onSubmit() {
  if (!form.courseInstance) return
  loadingSubmit.value = true
  try {
    // 收集每节主题：lessonNo -> title（只发非空的，节省 body 大小）
    const titleMap = {}
    for (const e of (previewItems.value || [])) {
      if (e.title && e.title.trim()) titleMap[e.lessonNo] = e.title.trim()
    }
    const r = await lessonScheduleApi.generate({
      courseInstance: form.courseInstance,
      startDate: form.startDate,
      startTime: form.startTime,
      endTime: form.endTime,
      teacher: form.teacher || undefined,
      room: form.room || undefined,
      titleMap
    })
    ElMessage.success(`已生成 ${r.data.created} 节排课`)
    emit('done')
    emit('update:modelValue', false)
  } catch (e) {
    const conflicts = e?.response?.data?.data?.conflicts
    if (conflicts && conflicts.length) {
      conflicts.value = conflicts
      ElMessage.error('存在冲突，请先解决')
    } else {
      ElMessage.error(e?.response?.data?.message || '生成失败')
    }
  } finally {
    loadingSubmit.value = false
  }
}
</script>

<style scoped>
.muted { color: #909399; font-size: 12px; margin-left: 4px; }
.form-hint { color: #909399; font-size: 12px; line-height: 1.4; margin-top: 4px; }
.hint-warn { color: #E6A23C; font-size: 12px; line-height: 1.4; margin-left: 12px; }
.dash { padding: 0 8px; color: #909399; }
.conflict-item { font-size: 12px; line-height: 1.6; color: #606266; }
.remaining-bar { margin-top: 10px; display: flex; align-items: center; }
.locked-field { display: flex; align-items: center; gap: 8px; }
.conflict-row { color: #f56c6c; font-weight: 600; }
</style>

<style>
/* el-table 的 row-class-name 不受 scoped 影响，必须全局 */
.el-table .is-conflict-row > td {
  background-color: #fef0f0 !important;
}
.el-table .is-conflict-row:hover > td {
  background-color: #fde2e2 !important;
}
</style>
