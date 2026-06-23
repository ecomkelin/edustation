<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
    :title="title"
    size="540px"
    direction="rtl"
    :close-on-click-modal="false"
    @opened="onOpen"
  >
    <div v-if="form._id" v-loading="loading" class="drawer-body">
      <!-- 只读上下文 -->
      <el-form :model="form" label-width="100px">
        <el-form-item label="开班">
          <span class="readonly-value">{{ instanceLabel }}</span>
          <el-tag v-if="form.isTrialLesson" type="warning" size="small" style="margin-left: 8px">试听课</el-tag>
        </el-form-item>
        <el-form-item label="状态">
          <el-tag :type="statusType(form.status)" size="small">{{ statusLabel(form.status) }}</el-tag>
          <span class="form-hint" style="margin-left: 8px">状态由「开课 / 结束」按钮流转，本抽屉不修改</span>
          <el-button
            v-if="form.status === 'scheduled' || form.status === 'in_progress'"
            size="small"
            type="warning"
            style="margin-left: 12px"
            @click="onOpenRoster"
          >开课</el-button>
        </el-form-item>

        <el-divider content-position="left">计划时间</el-divider>
        <el-form-item label="开始">
          <el-date-picker
            v-model="form.plannedStartTime"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            :disabled="form.status === 'completed' || form.status === 'archived'"
            style="width: 100%"
            @change="onStartTimeChange"
          />
        </el-form-item>
        <el-form-item label="结束">
          <el-date-picker
            v-model="form.plannedEndTime"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            :disabled="form.status === 'completed' || form.status === 'archived'"
            style="width: 100%"
          />
          <div class="form-hint">默认 = 开始 + 计划单节时长（{{ minutesPerLessonHint }} 分钟）；可手动改</div>
        </el-form-item>
        <el-form-item label="老师">
          <el-select v-model="form.teacher" filterable :disabled="form.status === 'completed' || form.status === 'archived'" style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="t.realName || t.mobile" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="教室">
          <el-select v-model="form.room" :disabled="form.status === 'completed' || form.status === 'archived'" style="width: 100%">
            <el-option v-for="r in rooms" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="本节主题">
          <el-input v-model="form.title" maxlength="100" show-word-limit />
        </el-form-item>

        <!-- 2026-06: 教学大纲/课件 三层 fallback 解析结果(只读预览) -->
        <el-divider content-position="left">本节课教学大纲</el-divider>
        <el-form-item label="">
          <div v-if="form.resolvedContent" class="resolved-block">
            <div class="resolved-row">
              <span class="resolved-label">主题</span>
              <span class="resolved-value">{{ form.resolvedContent.topic || '—' }}</span>
              <el-tag v-if="form.resolvedContent.sources && form.resolvedContent.sources.topic" :type="sourceTagType(form.resolvedContent.sources.topic)" size="small">
                来源: {{ sourceLabel(form.resolvedContent.sources.topic) }}
              </el-tag>
            </div>
            <div class="resolved-row" v-if="form.resolvedContent.description">
              <span class="resolved-label">内容</span>
              <span class="resolved-value" style="white-space: pre-wrap">{{ form.resolvedContent.description }}</span>
              <el-tag v-if="form.resolvedContent.sources && form.resolvedContent.sources.description" :type="sourceTagType(form.resolvedContent.sources.description)" size="small">
                来源: {{ sourceLabel(form.resolvedContent.sources.description) }}
              </el-tag>
            </div>
            <div class="resolved-row" v-if="form.resolvedContent.objectives && form.resolvedContent.objectives.length">
              <span class="resolved-label">目标</span>
              <span class="resolved-value">
                <el-tag v-for="(o, i) in form.resolvedContent.objectives" :key="i" size="small" style="margin-right: 4px">{{ o }}</el-tag>
              </span>
              <el-tag v-if="form.resolvedContent.sources && form.resolvedContent.sources.objectives" :type="sourceTagType(form.resolvedContent.sources.objectives)" size="small">
                来源: {{ sourceLabel(form.resolvedContent.sources.objectives) }}
              </el-tag>
            </div>
            <div class="resolved-row" v-if="form.resolvedContent.materialFileIds && form.resolvedContent.materialFileIds.length">
              <span class="resolved-label">课件</span>
              <span class="resolved-value">
                <el-tag v-for="(fid, i) in form.resolvedContent.materialFileIds" :key="fid" size="small" style="margin-right: 4px; margin-bottom: 4px">
                  {{ resolvedMaterialName(fid) }}
                </el-tag>
              </span>
              <span class="form-hint">合并来源顺序: 本节补充 → 开班特例 → 开班快照 → 科目当前</span>
            </div>
            <div v-if="!form.resolvedContent.topic && !form.resolvedContent.description && (!form.resolvedContent.objectives || !form.resolvedContent.objectives.length) && (!form.resolvedContent.materialFileIds || !form.resolvedContent.materialFileIds.length)" class="muted">
              本节课暂无教学大纲/课件来源(可在「学科」或「开班」管理页配置)
            </div>
          </div>
          <div v-else class="muted">解析中...</div>
        </el-form-item>

        <el-divider content-position="left">实际上课时间</el-divider>
        <el-form-item label="实际开始">
          <el-date-picker
            v-model="form.actualStartTime"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            placeholder="未开始"
            style="width: 100%"
            @change="onActualTimesChange"
          />
        </el-form-item>
        <el-form-item
          v-if="actualStartDiffMinutes >= 5"
          label="开始理由"
          :required="true"
        >
          <el-input
            v-model="form.actualStartReason"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="与计划相差 5 分钟以上，请填写理由（例如：老师临时有课 / 学生迟到 / 设备故障）"
          />
        </el-form-item>
        <el-form-item label="实际结束">
          <el-date-picker
            v-model="form.actualEndTime"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            placeholder="未结束"
            style="width: 100%"
            @change="onActualTimesChange"
          />
          <div v-if="form.actualStartTime" class="form-hint">
            差(天)：<span :class="diffClass">{{ diffText }}</span>
            <template v-if="actualStartDiffMinutes !== null">
              <span style="margin-left: 12px">差(分)：</span>
              <span :class="actualStartDiffMinutes >= 5 ? 'diff-late-warn' : 'diff-on-time'">
                {{ actualStartDiffMinutes > 0 ? '+' : '' }}{{ actualStartDiffMinutes }}
              </span>
            </template>
          </div>
        </el-form-item>
        <el-form-item
          v-if="actualEndDiffMinutes !== null && actualEndDiffMinutes >= 5"
          label="结束理由"
          :required="true"
        >
          <el-input
            v-model="form.actualEndReason"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="与计划相差 5 分钟以上，请填写理由"
          />
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="500" show-word-limit />
        </el-form-item>

        <el-divider content-position="left">备课资料</el-divider>
        <el-form-item label="">
          <div class="materials">
            <div v-for="(id, i) in form.materials" :key="id" class="material-chip">
              <el-icon style="margin-right: 4px"><Document /></el-icon>
              <span class="text-12" :title="id">{{ materialName(id) }}</span>
              <el-button link size="small" type="danger" @click="form.materials.splice(i, 1)">移除</el-button>
            </div>
            <el-upload
              :show-file-list="false"
              :auto-upload="true"
              :http-request="uploadMaterial"
              :before-upload="beforeMaterialUpload"
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            >
              <el-button :icon="Upload" size="small">上传新资料</el-button>
            </el-upload>
            <el-button :icon="Folder" size="small" link @click="materialPicker = true">从文件库选</el-button>
          </div>
          <div class="form-hint">支持图片 / 视频 / 音频 / PDF / Office 文件</div>
        </el-form-item>

        <!-- 冲突提示 -->
        <el-alert
          v-if="conflicts && conflicts.length"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 8px"
        >
          <template #title>当前时间 / 老师 / 教室有 {{ conflicts.length }} 处冲突</template>
          <div style="margin-top: 4px">
            <div v-for="c in conflicts" :key="c.id" class="conflict-item">
              · {{ c.courseInstance?.name || '?' }} 第 {{ c.lessonNo }} 课
              {{ formatDate(c.plannedStartTime, 'MM-DD HH:mm') }}-{{ formatDate(c.plannedEndTime, 'HH:mm') }}
            </div>
          </div>
        </el-alert>
      </el-form>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="$emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :loading="loading" @click="onSave">保存</el-button>
      </div>
    </template>

    <!-- 「开课」考勤登记抽屉：嵌套在编辑抽屉里，由"开课"按钮触发 -->
    <AttendanceRosterDialog
      v-model="rosterDialog"
      :schedule="rosterSchedule"
      @done="onRosterDone"
    />

    <!-- 从文件库选备课资料（多选） -->
    <FilePicker
      v-model="materialPicker"
      multiple
      scope="lessonMaterial"
      title="选择备课资料"
      @select="onPickMaterials"
    />
  </el-drawer>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Folder, Upload } from '@element-plus/icons-vue'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { courseInstanceApi } from '@/api/courseInstance'
import { userApi } from '@/api/user'
import { roomApi } from '@/api/room'
import { storageApi } from '@/api/storage'
import { formatDate } from '@/utils/format'
import FilePicker from '@/components/FilePicker.vue'
import AttendanceRosterDialog from './AttendanceRosterDialog.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  schedule: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'done'])

const teachers = ref([])
const rooms = ref([])
const loading = ref(false)
const conflicts = ref(null)

// 「开课」考勤登记抽屉（嵌套在本编辑抽屉里）
const rosterDialog = ref(false)
// 传给 AttendanceRosterDialog 的 schedule 对象：整合 form + 必要的原 schedule 字段
const rosterSchedule = computed(() => ({
  _id: form._id,
  lessonNo: form.lessonNo,
  plannedStartTime: form.plannedStartTime,
  plannedEndTime: form.plannedEndTime,
  status: form.status,
  teacher: teachers.value.find((t) => String(t.id) === String(form.teacher)) || { _id: form.teacher },
  room: rooms.value.find((r) => String(r._id) === String(form.room)) || { _id: form.room },
  courseInstance: { _id: form.courseInstanceId, name: form.courseInstanceName }
}))

const STATUS_LABELS = {
  scheduled: '已排课', in_progress: '进行中', completed: '已完成', archived: '已归档', cancelled: '已取消'
}
// el-tag 的 type 校验只接受 primary/success/info/warning/danger，
// archived 用 info（中性），cancelled 用 danger（破坏性）。
const STATUS_TYPES = {
  scheduled: 'info', in_progress: 'warning', completed: 'success', archived: 'info', cancelled: 'danger'
}

const form = reactive({
  _id: null,
  plannedStartTime: '',
  plannedEndTime: '',
  teacher: '',
  room: '',
  title: '',
  status: 'scheduled',
  isTrialLesson: false,  // 招生试听 (2026-06)
  actualStartTime: null,
  actualEndTime: null,
  // 5 分钟差异理由；>=5 分钟时由后端强校验必填
  actualStartReason: '',
  actualEndReason: '',
  notes: '',
  courseInstanceName: '',
  courseInstanceId: '',
  lessonNo: null,
  materials: [],  // [ObjectId<Ref:File>]，后端 diffArrayById 自动绑/解
  // 2026-06: 解析后的"本节课教学大纲/课件"(只读预览)
  resolvedContent: null
})

// resolvedContent sources 映射成 UI 标签
const SOURCE_LABELS = {
  schedule: '本节',
  instanceOverride: '开班特例',
  instanceSnapshot: '开班快照',
  subject: '科目'
}
function sourceLabel(s) { return SOURCE_LABELS[s] || s || '' }
function sourceTagType(s) {
  if (s === 'schedule') return 'danger'   // 老师改了
  if (s === 'instanceOverride') return 'warning'  // 开班改了
  if (s === 'instanceSnapshot') return 'success'  // 开班快照(冻结)
  if (s === 'subject') return 'info'      // 科目当前
  return ''
}

// 课件 fileId → 名称(url 等信息从后端 resolvedContent.materialFiles 一次性带过来)
function resolvedMaterialById(id) {
  if (!form.resolvedContent || !Array.isArray(form.resolvedContent.materialFiles)) return null
  return form.resolvedContent.materialFiles.find((f) => String(f.id) === String(id)) || null
}
function resolvedMaterialName(id) {
  const f = resolvedMaterialById(id)
  if (!f) return String(id).slice(-6)
  return f.missing ? `(已删除) ${String(id).slice(-6)}` : (f.originalName || String(id).slice(-6))
}

const instanceLabel = computed(() => form.courseInstanceName || '—')
const title = computed(() => {
  if (!form._id) return '编辑排课'
  return `编辑排课 · 第 ${form.lessonNo || '?'} 课`
})

function statusLabel(s) { return STATUS_LABELS[s] || s }
function statusType(s) { return STATUS_TYPES[s] || 'info' }

const minutesPerLessonHint = ref(90)

watch(() => props.modelValue, (v) => {
  if (v) onOpen()
})
watch(() => props.schedule, (s) => {
  if (s) syncFromSchedule(s)
}, { immediate: true })

async function onOpen() {
  await loadDeps()
  if (props.schedule) syncFromSchedule(props.schedule)
  // 加载开班详情（用于默认 minutesPerLesson）。
  // 兼容两种来源：
  //  - 列表接口：courseInstance 是 populate 对象 { _id, name, ... }
  //  - 日历接口：courseInstance 是精简对象 { id, name }（无 _id）
  // 一律走 pickId 拿到 id 字符串，避免把整个对象塞进 URL 触发后端 CastError('参数类型错误: _id')
  const ciId = form.courseInstanceId
  if (ciId) {
    try {
      const r = await courseInstanceApi.detail(ciId)
      const inst = r.data
      minutesPerLessonHint.value = inst?.schedulePlan?.minutesPerLesson
        || inst?.courseProduct?.minutesPerLesson
        || 90
    } catch (_) { /* ignore */ }
  }
  // 2026-06: 拉本节课的"教学大纲/课件"解析结果(后端 detail 一次性带过来)
  if (form._id) {
    try {
      const r = await lessonScheduleApi.detail(form._id)
      form.resolvedContent = r.data && r.data.resolvedContent ? r.data.resolvedContent : null
    } catch (_) { form.resolvedContent = null }
  }
  // 实时拉一次冲突（初次打开时）
  await checkConflicts()
}

async function loadDeps() {
  if (teachers.value.length && rooms.value.length) return
  const [u, rm] = await Promise.all([
    userApi.list({ pageSize: 200 }),
    roomApi.list()
  ])
  teachers.value = (u.data?.items || []).filter((x) => x.positions?.some((p) => p.name === '老师'))
  rooms.value = rm.data || []
}

function pickId(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v._id || v.id || ''
}

function syncFromSchedule(s) {
  form._id = s._id || s.id
  form.lessonNo = s.lessonNo
  form.plannedStartTime = s.plannedStartTime ? toLocalIso(s.plannedStartTime) : ''
  form.plannedEndTime = s.plannedEndTime ? toLocalIso(s.plannedEndTime) : ''
  form.teacher = pickId(s.teacher)
  form.room = pickId(s.room)
  form.title = s.title || ''
  form.status = s.status || 'scheduled'
  form.isTrialLesson = !!s.isTrialLesson  // 招生试听 (2026-06)
  form.actualStartTime = s.actualStartTime ? toLocalIso(s.actualStartTime) : null
  form.actualEndTime = s.actualEndTime ? toLocalIso(s.actualEndTime) : null
  form.actualStartReason = s.actualStartReason || ''
  form.actualEndReason = s.actualEndReason || ''
  form.notes = s.notes || ''
  form.courseInstanceName = s.courseInstance && (s.courseInstance.name || (s.courseInstance.courseProduct && s.courseInstance.courseProduct.name)) || ''
  form.courseInstanceId = pickId(s.courseInstance)
  form.materials = Array.isArray(s.materials) ? s.materials.map(String) : []
}

// 后端给的是 ISO（UTC），el-date-picker 的 YYYY-MM-DD HH:mm:ss 期望是"本地时区"格式
function toLocalIso(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 「开始」改动时自动联动「结束」：结束 = 开始 + minutesPerLessonHint
function onStartTimeChange(v) {
  if (!v) return
  const start = new Date(v)
  if (Number.isNaN(start.getTime())) return
  const end = new Date(start.getTime() + minutesPerLessonHint.value * 60000)
  const pad = (n) => String(n).padStart(2, '0')
  form.plannedEndTime = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())} ${pad(end.getHours())}:${pad(end.getMinutes())}:${pad(end.getSeconds())}`
}

/** actualStartTime 改动后无须主动校验（computed 响应），保留以备后续扩展 */
function onActualTimesChange() { /* no-op, computed 已响应 */ }

let conflictTimer = null
watch(
  () => [form.plannedStartTime, form.plannedEndTime, form.teacher, form.room],
  () => {
    if (!form._id) return
    if (conflictTimer) clearTimeout(conflictTimer)
    conflictTimer = setTimeout(() => checkConflicts(), 350)
  }
)

async function checkConflicts() {
  if (!form._id || !form.plannedStartTime || !form.plannedEndTime) return
  try {
    const r = await lessonScheduleApi.checkConflicts({
      plannedStartTime: new Date(form.plannedStartTime).toISOString(),
      plannedEndTime: new Date(form.plannedEndTime).toISOString(),
      teacher: form.teacher || undefined,
      room: form.room || undefined,
      excludeId: form._id
    })
    conflicts.value = r.data.conflicts || []
  } catch (e) {
    conflicts.value = null
  }
}

async function onSave() {
  if (!form._id) return
  // 前端预校验：实际开始/结束与计划相差 ≥5 分钟时理由必填
  if (actualStartDiffMinutes.value >= 5 && !String(form.actualStartReason || '').trim()) {
    return ElMessage.error('实际上课开始时间与计划相差 5 分钟以上，请填写理由')
  }
  if (actualEndDiffMinutes.value !== null && actualEndDiffMinutes.value >= 5 && !String(form.actualEndReason || '').trim()) {
    return ElMessage.error('实际上课结束时间与计划相差 5 分钟以上，请填写理由')
  }
  loading.value = true
  try {
    // 关键：本抽屉不切状态 —— status 不传；actualStartTime/actualEndTime 允许编辑（教务补录）
    const payload = {
      plannedStartTime: form.plannedStartTime ? new Date(form.plannedStartTime).toISOString() : undefined,
      plannedEndTime: form.plannedEndTime ? new Date(form.plannedEndTime).toISOString() : undefined,
      teacher: form.teacher || undefined,
      room: form.room || undefined,
      title: form.title || undefined,
      notes: form.notes || undefined,
      // 只有当实际时间 / 理由字段被显式编辑过才传 undefined，避免意外清空已有 reason
      actualStartTime: form.actualStartTime ? new Date(form.actualStartTime).toISOString() : null,
      actualEndTime: form.actualEndTime ? new Date(form.actualEndTime).toISOString() : null,
      actualStartReason: form.actualStartReason || null,
      actualEndReason: form.actualEndReason || null,
      // 备课资料：ObjectId 数组，后端 diffArrayById 自动绑/解
      materials: Array.isArray(form.materials) ? form.materials : []
    }
    await lessonScheduleApi.update(form._id, payload)
    ElMessage.success('已保存')
    emit('done')
    emit('update:modelValue', false)
  } catch (e) {
    const dataConflicts = e?.response?.data?.data?.conflicts
    if (dataConflicts && dataConflicts.length) {
      conflicts.value = dataConflicts
      ElMessage.error('存在冲突，请调整')
    } else {
      ElMessage.error(e?.response?.data?.message || '保存失败')
    }
  } finally {
    loading.value = false
  }
}

/**
 * 「开课」按钮触发：弹出考勤登记抽屉。
 * 考勤状态由 AttendanceRosterDialog 单独写 LessonAttendance（不走本抽屉 update），
 * 不影响 LessonSchedule.status / actualStartTime / actualEndTime。
 */
function onOpenRoster() {
  if (!form._id) return
  if (form.status === 'cancelled') {
    return ElMessage.warning('已取消的排课不可开课')
  }
  rosterDialog.value = true
}

// 考勤登记保存后：通知外层刷新；本抽屉状态由 AttendanceRosterDialog 自己维护
function onRosterDone() {
  emit('done')
}

// 差(天)
const diffDays = computed(() => {
  if (!form.actualStartTime || !form.plannedStartTime) return null
  const a = new Date(form.plannedStartTime)
  const b = new Date(form.actualStartTime)
  const aDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bDay - aDay) / 86400000)
})
const diffText = computed(() => {
  const d = diffDays.value
  if (d === null) return ''
  if (d === 0) return '准时'
  if (d < 0) return `提前 ${-d} 天`
  return `延后 ${d} 天`
})
const diffClass = computed(() => {
  const d = diffDays.value
  if (d === null) return ''
  if (d === 0) return 'diff-on-time'
  if (d < 0) return 'diff-early'
  if (d <= 3) return 'diff-late-warn'
  return 'diff-late-danger'
})

/** 实际开始 vs 计划开始的分钟差；用于前端预校验 + UI 展示 */
const actualStartDiffMinutes = computed(() => {
  if (!form.actualStartTime || !form.plannedStartTime) return -Infinity
  return Math.round((new Date(form.actualStartTime) - new Date(form.plannedStartTime)) / 60000)
})
/** 实际结束 vs 计划结束的分钟差；用于前端预校验 + UI 展示 */
const actualEndDiffMinutes = computed(() => {
  if (!form.actualEndTime || !form.plannedEndTime) return null
  return Math.round((new Date(form.actualEndTime) - new Date(form.plannedEndTime)) / 60000)
})

// ===== 备课资料：上传新 + 从库选 =====
const materialPicker = ref(false)
// id -> originalName 回显 map。编辑模式下 form.materials 是 ObjectId[]，旧数据没 name。
const materialNames = reactive(new Map())
function materialName(id) {
  return materialNames.get(String(id)) || String(id).slice(-6)
}

function beforeMaterialUpload(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('备课资料超过 20MB 限制')
    return false
  }
  return true
}

async function uploadMaterial(req) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'lessonMaterial' })
    if (!Array.isArray(form.materials)) form.materials = []
    form.materials.push(data.id)
    materialNames.set(String(data.id), data.originalName || data.id)
    ElMessage.success('备课资料已上传，点"保存"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function onPickMaterials(files) {
  if (!Array.isArray(form.materials)) form.materials = []
  const existing = new Set(form.materials.map(String))
  for (const f of files) {
    const id = String(f._id)
    if (!existing.has(id)) {
      form.materials.push(id)
      materialNames.set(id, f.originalName || id)
      existing.add(id)
    }
  }
}
</script>

<style scoped>
.drawer-body { padding: 0 4px; }
.drawer-footer { display: flex; justify-content: flex-end; gap: 8px; }
.readonly-value { font-size: 14px; color: #303133; }
.form-hint { color: #909399; font-size: 12px; line-height: 1.4; margin-top: 4px; }
.conflict-item { font-size: 12px; line-height: 1.6; color: #606266; }
.diff-on-time { color: #67c23a; font-weight: 600; }
.diff-early { color: #409eff; font-weight: 600; }
.diff-late-warn { color: #e6a23c; font-weight: 600; }
.diff-late-danger { color: #f56c6c; font-weight: 600; }
.materials {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.material-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafbfc;
}
</style>