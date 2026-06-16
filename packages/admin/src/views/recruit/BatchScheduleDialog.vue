<template>
  <el-dialog
    :model-value="visible"
    title="批量排试听日程"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
    @close="onClose"
  >
    <el-alert
      v-if="bookings.length > 0"
      type="info"
      :closable="false"
      class="mb"
    >
      <template #title>
        将为 <strong>{{ childrenCount }}</strong> 个孩子 ({{ bookings.length }} 个试听预约) 排进同一时段
      </template>
      <div class="subject-line" v-if="subjectSummary.length">
        试听科目:
        <el-tag
          v-for="(it, idx) in subjectSummary"
          :key="idx"
          size="small"
          :type="idx === 0 ? '' : 'info'"
          class="subj-tag"
        >
          {{ it.name }} × {{ it.count }}
        </el-tag>
      </div>
    </el-alert>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
    >
      <el-form-item label="试听日期" prop="date">
        <el-date-picker
          v-model="form.date"
          type="date"
          placeholder="选具体某一天"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="开始时间" prop="startTime">
        <el-time-select
          v-model="form.startTime"
          start="08:00"
          end="20:00"
          step="00:30"
          placeholder="默认 10:00"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="持续时长" prop="duration">
        <el-input-number
          v-model="form.duration"
          :min="15"
          :max="240"
          :step="15"
          style="width: 100%"
        />
        <span class="duration-hint">分钟 (默认 60 = 1 小时)</span>
      </el-form-item>
      <el-form-item label="试听老师" prop="teacher">
        <el-select v-model="form.teacher" filterable placeholder="选老师" style="width: 100%">
          <el-option
            v-for="u in teacherOptions"
            :key="u._id || u.id"
            :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
            :value="u._id || u.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="试听教室" prop="room">
        <el-select v-model="form.room" filterable clearable placeholder="选填 (2026-06 试听不查教室冲突)" style="width: 100%">
          <el-option
            v-for="r in roomOptions"
            :key="r._id || r.id"
            :label="`${r.name}${r.location ? ' - ' + r.location : ''}`"
            :value="r._id || r.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="备注" prop="notes">
        <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="500" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        排进 N 条预约
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { trialBookingApi } from '@/api/trialBooking'
import { userApi } from '@/api/user'
import { roomApi } from '@/api/room'

const props = defineProps({
  visible: { type: Boolean, default: false },
  bookings: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:visible', 'scheduled'])

const formRef = ref(null)
const submitting = ref(false)
const teacherOptions = ref([])
const roomOptions = ref([])

// 2026-06 混合多课: 1 个试听时段可挂不同 subject; 显示"科目×数量"汇总
const childrenCount = computed(() => {
  const ids = new Set()
  for (const b of props.bookings) {
    const id = b.preStudent?._id || b.preStudent?.id || b.preStudent
    if (id) ids.add(String(id))
  }
  return ids.size
})

const subjectSummary = computed(() => {
  // 按 subject 聚合; 兼容 booking.subject 是 ObjectId 字符串 / 已是对象 两种情况
  const byId = new Map()
  for (const b of props.bookings) {
    const s = b.subject
    if (!s) continue
    const id = typeof s === 'object' ? (s._id || s.id) : s
    const name = typeof s === 'object' ? s.name : null
    if (!id) continue
    if (!byId.has(String(id))) byId.set(String(id), { id, name, count: 0 })
    byId.get(String(id)).count += 1
  }
  // 没拉 populate 名字的, 暂时用 "(未命名)"
  return Array.from(byId.values()).map((x) => ({
    name: x.name || '(未命名)',
    count: x.count
  }))
})

const form = reactive({
  date: null,
  startTime: '10:00',   // 默认上午 10:00 (2026-06-15 用户反馈)
  duration: 60,         // 默认 1 小时 (2026-06-15 用户反馈)
  teacher: null,
  room: null,
  notes: ''
})

const rules = {
  date: [{ required: true, message: '请选择试听日期', trigger: 'change' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  duration: [{ required: true, type: 'number', message: '请填写持续时长', trigger: 'change' }],
  teacher: [{ required: true, message: '请选择试听老师', trigger: 'change' }]
  // room 不必填 (2026-06 试听不查教室冲突)
}

watch(() => props.visible, async (v) => {
  if (v) {
    form.date = null
    form.startTime = '10:00'
    form.duration = 60
    form.teacher = null
    form.room = null
    form.notes = ''
    await loadOptions()
  }
}, { immediate: true })

async function loadOptions() {
  try {
    const [uRes, rRes] = await Promise.all([
      userApi.list({ pageSize: 200 }),
      roomApi.list({ pageSize: 200 })
    ])
    // 响应统一被 ApiResponse.ok 包成 {success, data: ...}; http 拦截器 return body.
    // user 端点 data 是 {items, total} 分页; room 端点 data 是裸 array.
    teacherOptions.value = uRes.data?.items || []
    roomOptions.value = Array.isArray(rRes?.data) ? rRes.data : []
    // 排除「家长」职位(2026-06 用户反馈)
    teacherOptions.value = teacherOptions.value
      .filter((u) => !(u.positions || []).some((p) => p.name === '家长'))
  } catch (e) {
    // 忽略
  }
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  if (!form.date || !form.startTime || !form.duration) {
    ElMessage.error('请填写完整的试听时间')
    return
  }
  // 拼装 ISO 字符串: "YYYY-MM-DDTHH:mm:00.000Z" (字面 UTC, 跟 el-date-picker datetimerange 旧行为一致)
  const startIso = `${form.date}T${form.startTime}:00.000Z`
  const startMs = new Date(startIso).getTime()
  const endMs = startMs + Number(form.duration) * 60 * 1000
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    ElMessage.error('时间格式不合法')
    return
  }
  submitting.value = true
  try {
    const res = await trialBookingApi.batchSchedule({
      bookingIds: props.bookings.map((b) => b._id || b.id),
      plannedStartTime: startIso,
      plannedEndTime: new Date(endMs).toISOString(),
      teacher: form.teacher,
      room: form.room || undefined,
      // 2026-06-16: 修老 bug — 之前 form.notes 字段填了但没传, 备注全丢
      notes: form.notes || undefined
    })
    ElMessage.success(`已为 ${res.data.bookingCount} 条预约排进同一时段`)
    emit('scheduled', res.data)
    emit('update:visible', false)
  } finally {
    submitting.value = false
  }
}

function onClose() {
  formRef.value?.resetFields()
}
</script>

<style scoped>
.mb {
  margin-bottom: 16px;
}
.subject-line {
  margin-top: 4px;
  font-size: 13px;
}
.subj-tag {
  margin-left: 4px;
}
.duration-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
