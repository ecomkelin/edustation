<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v) => $emit('update:modelValue', v)"
    :title="courseInstance ? `加一节 · ${instanceLabel}` : '加一节排课'"
    width="640px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <el-form :model="form" label-width="100px" v-loading="loadingInst">
      <!-- 课次：自动取下一个 lessonNo，不让用户改 -->
      <el-form-item label="课次">
        <el-tag size="default" type="info" effect="plain">第 {{ nextLessonNo }} 节</el-tag>
        <span class="muted" style="margin-left: 8px">系统自动取下一个序号</span>
      </el-form-item>

      <el-form-item label="日期" required>
        <el-date-picker
          v-model="form.date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          style="width: 100%"
          @change="onDateTimeChange"
        />
      </el-form-item>

      <el-form-item label="上课时间" required>
        <el-time-picker
          v-model="form.startTime"
          placeholder="开始"
          format="HH:mm"
          value-format="HH:mm"
          style="width: 120px"
        />
        <span class="dash">-</span>
        <el-time-picker
          v-model="form.endTime"
          placeholder="结束"
          format="HH:mm"
          value-format="HH:mm"
          style="width: 120px"
        />
      </el-form-item>

      <el-form-item label="老师">
        <div class="locked-field">
          <el-tag v-if="form.teacher" type="info" effect="plain">{{ teacherLabel }}</el-tag>
          <span v-else class="muted">未设置</span>
          <el-button link type="primary" @click="overrideTeacher = !overrideTeacher">
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
          <el-tag v-if="form.room" type="info" effect="plain">{{ roomLabel }}</el-tag>
          <span v-else class="muted">未设置</span>
          <el-button link type="primary" @click="overrideRoom = !overrideRoom">
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

      <el-form-item label="本节主题">
        <el-input v-model="form.title" maxlength="100" show-word-limit placeholder="可选" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="可选" />
      </el-form-item>

      <el-alert
        v-if="conflict"
        type="error"
        :closable="false"
        show-icon
        style="margin-top: 4px"
      >
        <template #title>冲突：{{ conflict }}</template>
      </el-alert>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!canSubmit || conflict" @click="onSubmit">
        添加
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { courseInstanceApi } from '@/api/courseInstance'
import { userApi } from '@/api/user'
import { roomApi } from '@/api/room'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  courseInstance: { type: Object, default: null } // 至少要有 _id + name + scheduledCount + schedulePlan + teacher + room
})
const emit = defineEmits(['update:modelValue', 'done'])

const loadingInst = ref(false)
const submitting = ref(false)

const form = reactive({
  date: '',
  startTime: '',
  endTime: '',
  teacher: '',
  room: '',
  title: '',
  notes: ''
})

const teachers = ref([])
const rooms = ref([])
const overrideTeacher = ref(false)
const overrideRoom = ref(false)

const conflict = ref('')

// 当前开班的"下一个 lessonNo"
const nextLessonNo = computed(() => {
  if (!props.courseInstance) return 1
  return (props.courseInstance.scheduledCount || 0) + 1
})

const instanceLabel = computed(() => {
  const c = props.courseInstance
  if (!c) return ''
  return c.name || (c.courseProduct && c.courseProduct.name) || '?'
})

const teacherLabel = computed(() => {
  const t = props.courseInstance?.teacher
  if (!t) return '未设置'
  return t.realName || t.mobile || '?'
})
const roomLabel = computed(() => {
  const r = props.courseInstance?.room
  if (!r) return '未设置'
  return r.name || '?'
})

const canSubmit = computed(() => {
  return form.date && form.startTime && form.endTime && form.teacher && form.room
})

watch(() => props.modelValue, (v) => {
  if (v) onOpen()
  else resetAll()
})

function resetAll() {
  Object.assign(form, {
    date: '',
    startTime: '',
    endTime: '',
    teacher: '',
    room: '',
    title: '',
    notes: ''
  })
  overrideTeacher.value = false
  overrideRoom.value = false
  conflict.value = ''
}

async function onOpen() {
  resetAll()
  await loadDeps()
  // 默认老师/教室/日期/时间从开班带出来
  const c = props.courseInstance
  if (!c) return
  if (!overrideTeacher.value) {
    form.teacher = c.teacher?._id || c.teacher || ''
  }
  if (!overrideRoom.value) {
    form.room = c.room?._id || c.room || ''
  }
  if (c.startDate) {
    form.date = String(c.startDate).slice(0, 10)
  }
  const minutes = c.schedulePlan?.minutesPerLesson || c.courseProduct?.minutesPerLesson || 90
  if (!form.startTime) form.startTime = '09:00'
  if (!form.endTime) {
    const h = 9 + Math.floor(minutes / 60)
    const m = minutes % 60
    form.endTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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

// 实时冲突预检：debounce 一下
let conflictTimer = null
async function checkConflict() {
  conflict.value = ''
  if (!form.date || !form.startTime || !form.endTime) return
  const start = new Date(`${form.date}T${form.startTime}:00`)
  const end = new Date(`${form.date}T${form.endTime}:00`)
  if (!(start < end)) {
    conflict.value = '结束时间必须晚于开始时间'
    return
  }
  try {
    const r = await lessonScheduleApi.checkConflicts({
      plannedStartTime: start.toISOString(),
      plannedEndTime: end.toISOString(),
      teacher: form.teacher || undefined,
      room: form.room || undefined
    })
    const list = r.data?.conflicts || []
    if (list.length > 0) {
      const first = list[0]
      conflict.value = `与「${first.courseInstance?.name || '?'}」第 ${first.lessonNo} 课冲突（${first.teacher?.name || '-'} / ${first.room?.name || '-'}）`
    }
  } catch (e) {
    // 不阻塞用户，让后端在 create 时再兜底
  }
}

function onDateTimeChange() {
  if (conflictTimer) clearTimeout(conflictTimer)
  conflictTimer = setTimeout(() => {
    conflictTimer = null
    checkConflict()
  }, 300)
}

// 监听老师/教室改动也重测
watch([() => form.teacher, () => form.room, () => form.date, () => form.startTime, () => form.endTime], () => {
  onDateTimeChange()
})

async function onSubmit() {
  if (!props.courseInstance) return
  if (!canSubmit.value) {
    ElMessage.warning('请填写完整（日期 / 时间 / 老师 / 教室）')
    return
  }
  if (conflict.value) {
    ElMessage.warning('请先解决冲突')
    return
  }
  submitting.value = true
  try {
    const start = new Date(`${form.date}T${form.startTime}:00`)
    const end = new Date(`${form.date}T${form.endTime}:00`)
    await lessonScheduleApi.create({
      courseInstance: props.courseInstance._id,
      lessonNo: nextLessonNo.value,
      plannedStartTime: start.toISOString(),
      plannedEndTime: end.toISOString(),
      teacher: form.teacher,
      room: form.room,
      title: form.title || undefined,
      notes: form.notes || undefined
    })
    ElMessage.success(`已添加第 ${nextLessonNo.value} 节`)
    emit('done')
    emit('update:modelValue', false)
  } catch (e) {
    const conflicts = e?.response?.data?.data?.conflicts
    if (conflicts && conflicts.length) {
      const first = conflicts[0]
      conflict.value = `与「${first.courseInstance?.name || '?'}」第 ${first.lessonNo} 课冲突`
    } else {
      ElMessage.error(e?.response?.data?.message || '添加失败')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.muted { color: #909399; font-size: 12px; margin-left: 4px; }
.dash { padding: 0 8px; color: #909399; }
.locked-field { display: flex; align-items: center; gap: 8px; }
</style>