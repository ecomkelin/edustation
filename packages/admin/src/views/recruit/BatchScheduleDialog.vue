<template>
  <el-dialog
    :model-value="visible"
    title="批量排试听课"
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
        将为 <strong>{{ bookings.length }}</strong> 个试听预约排进同一节课
      </template>
      <div class="subject-line" v-if="subjectLabel">
        试听科目: <el-tag size="small">{{ subjectLabel }}</el-tag>
      </div>
    </el-alert>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
    >
      <el-form-item label="上课时间" prop="range">
        <el-date-picker
          v-model="form.range"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          format="YYYY-MM-DD HH:mm"
          style="width: 100%"
        />
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
      <el-form-item label="教室" prop="room">
        <el-select v-model="form.room" filterable placeholder="选教室" style="width: 100%">
          <el-option
            v-for="r in roomOptions"
            :key="r._id || r.id"
            :label="`${r.name}${r.location ? ' - ' + r.location : ''}`"
            :value="r._id || r.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="排课标题" prop="title">
        <el-input v-model="form.title" :placeholder="`默认: 试听 (${bookings.length}人)`" maxlength="100" />
      </el-form-item>
      <el-form-item label="备注" prop="notes">
        <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="500" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        创建并排进 N 条预约
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

const subjectLabel = computed(() => {
  if (!props.bookings.length) return ''
  const s = props.bookings[0]?.subject
  return typeof s === 'object' ? s?.name : ''
})

const form = reactive({
  range: null,
  teacher: null,
  room: null,
  title: '',
  notes: ''
})

const rules = {
  range: [{ required: true, message: '请选择上课时间', trigger: 'change' }],
  teacher: [{ required: true, message: '请选择试听老师', trigger: 'change' }],
  room: [{ required: true, message: '请选择教室', trigger: 'change' }]
}

watch(() => props.visible, async (v) => {
  if (v) {
    form.range = null
    form.teacher = null
    form.room = null
    form.title = ''
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
  if (!Array.isArray(form.range) || form.range.length !== 2) {
    ElMessage.error('时间范围不合法')
    return
  }
  submitting.value = true
  try {
    const res = await trialBookingApi.batchSchedule({
      bookingIds: props.bookings.map((b) => b._id || b.id),
      plannedStartTime: form.range[0],
      plannedEndTime: form.range[1],
      teacher: form.teacher,
      room: form.room,
      title: form.title || undefined,
      notes: form.notes || undefined
    })
    ElMessage.success(`已创建试听课, 关联 ${res.data.bookingCount} 条预约`)
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
</style>
