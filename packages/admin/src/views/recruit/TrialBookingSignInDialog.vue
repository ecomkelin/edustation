<template>
  <el-dialog
    :model-value="visible"
    :title="`试听详情 - ${bookingLabel}`"
    width="720px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <div v-if="booking" class="signin-dialog">
      <!-- 头部状态 + 操作 -->
      <div class="header">
        <el-tag :type="statusTagType(booking.status)" size="large">
          {{ statusLabel(booking.status) }}
        </el-tag>
        <span class="lead-name">
          {{ booking.preStudent?.name || '-' }}
          <el-tag v-if="booking.attemptNo > 1" size="small" type="info">第 {{ booking.attemptNo }} 次</el-tag>
        </span>
        <div class="header-actions">
          <el-button
            v-if="booking.status === 'scheduled'"
            type="primary"
            :loading="acting"
            @click="onCheckIn"
          >
            到店打卡
          </el-button>
          <el-button
            v-if="booking.status === 'arrived'"
            type="success"
            :loading="acting"
            @click="onComplete"
          >
            完成试听
          </el-button>
          <el-button
            v-if="booking.status === 'completed' && booking.result?.isEnrolled === null"
            type="success"
            :loading="acting"
            @click="onComplete"
          >
            补填结果
          </el-button>
          <el-button
            v-if="booking.status === 'no_show'"
            type="warning"
            :loading="acting"
            @click="emit('reschedule', booking)"
          >
            再约一次
          </el-button>
        </div>
      </div>

      <!-- 基础信息 -->
      <el-descriptions :column="2" border size="small" class="mb">
        <el-descriptions-item label="联系电话">{{ booking.preStudent?.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="年龄">{{ booking.preStudent?.age ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="学校">
          {{ typeof booking.preStudent?.school === 'object' ? booking.preStudent?.school?.name : booking.preStudent?.school || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="年级/班级">
          {{ booking.preStudent?.grade || '-' }} / {{ booking.preStudent?.className || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="试听科目">
          {{ typeof booking.subject === 'object' ? booking.subject?.name : booking.subject || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="试听老师">
          {{ booking.teacher?.realName || booking.teacher?.mobile || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="计划时间" :span="2">
          {{ formatTime(booking.scheduledAt) }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 完成结果 / 转化 -->
      <el-divider content-position="left">试听结果</el-divider>
      <el-form
        ref="resultFormRef"
        :model="result"
        :rules="resultRules"
        label-width="100px"
        label-position="right"
        :disabled="booking.status !== 'arrived' && !(booking.status === 'completed' && booking.result?.isEnrolled === null)"
      >
        <el-form-item label="是否报名" prop="isEnrolled">
          <el-radio-group v-model="result.isEnrolled">
            <el-radio :value="true">是</el-radio>
            <el-radio :value="false">否</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="result.isEnrolled === true" label="吸引报名的点" prop="attractionPoint">
          <el-input v-model="result.attractionPoint" placeholder="如 老师好, 离家近" maxlength="500" />
        </el-form-item>
        <el-form-item v-if="result.isEnrolled === true" label="谈单老师" prop="negotiateTeacher">
          <el-select v-model="result.negotiateTeacher" filterable placeholder="默认邀约老师" style="width: 100%">
            <el-option
              v-for="u in teacherOptions"
              :key="u._id || u.id"
              :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
              :value="u._id || u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="result.isEnrolled === false" label="为什么不报名" prop="reasonNotEnrolled">
          <el-input v-model="result.reasonNotEnrolled" placeholder="如 离家太远" maxlength="500" />
        </el-form-item>
        <el-form-item v-if="booking.status === 'completed' && booking.result?.isEnrolled === true">
          <el-alert type="success" :closable="false" show-icon>
            <template #title>已转化, 初始密码: {{ booking.preStudent?.phone?.slice(-6) || '' }}</template>
          </el-alert>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="acting" @click="onSaveResult" :disabled="result.isEnrolled === null">
            保存结果
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 转化按钮 (已完成 + isEnrolled=true 后才能点) -->
      <el-divider v-if="canConvert" content-position="left">转化为正式学员</el-divider>
      <div v-if="canConvert" class="convert-area">
        <el-alert
          type="success"
          :closable="false"
          show-icon
          class="mb"
        >
          试听结果已填, 可将潜客转为正式学员。系统会自动创建家长账号 (手机号后 6 位为初始密码)。
        </el-alert>
        <el-button
          type="success"
          size="large"
          :loading="acting"
          @click="onConvert"
        >
          转化为正式学员
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { trialBookingApi } from '@/api/trialBooking'
import { userApi } from '@/api/user'
import { TRIAL_BOOKING_STATUS_LABEL, TRIAL_BOOKING_STATUS_TAG_TYPE } from '@/utils/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  booking: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'updated', 'reschedule'])

const acting = ref(false)
const resultFormRef = ref(null)
const teacherOptions = ref([])

const result = reactive({
  isEnrolled: null,
  attractionPoint: '',
  reasonNotEnrolled: '',
  negotiateTeacher: null
})

const resultRules = {
  isEnrolled: [{ required: true, message: '请选择是否报名', trigger: 'change' }],
  attractionPoint: [
    {
      validator: (_, v, cb) => {
        if (result.isEnrolled === true && !v) return cb(new Error('请填写吸引报名的点'))
        cb()
      },
      trigger: 'blur'
    }
  ],
  reasonNotEnrolled: [
    {
      validator: (_, v, cb) => {
        if (result.isEnrolled === false && !v) return cb(new Error('请填写为什么不报名'))
        cb()
      },
      trigger: 'blur'
    }
  ]
}

const bookingLabel = computed(() => {
  if (!props.booking) return ''
  return props.booking.preStudent?.name || `预约 #${(props.booking._id || '').slice(-6)}`
})

const canConvert = computed(() => {
  if (!props.booking) return false
  return props.booking.status === 'completed'
    && props.booking.result?.isEnrolled === true
    && !props.booking.result?.enrolledAt
})

watch(() => props.visible, async (v) => {
  if (v && props.booking) {
    // 同步 result 表单
    const r = props.booking.result || {}
    result.isEnrolled = r.isEnrolled ?? null
    result.attractionPoint = r.attractionPoint || ''
    result.reasonNotEnrolled = r.reasonNotEnrolled || ''
    result.negotiateTeacher = r.negotiateTeacher || null
    if (!result.negotiateTeacher && props.booking.preStudent?.inviteTeacher) {
      const inv = props.booking.preStudent.inviteTeacher
      result.negotiateTeacher = typeof inv === 'object' ? inv._id : inv
    }
    try {
      const r = await userApi.list({ pageSize: 200 })
      // 排除「家长」(2026-06 用户反馈); u.positions 是 [{name, ...}]
      teacherOptions.value = (r.data?.items || [])
        .filter((u) => !(u.positions || []).some((p) => p.name === '家长'))
    } catch (e) {}
  }
}, { immediate: true })

function statusLabel(s) {
  return TRIAL_BOOKING_STATUS_LABEL[s] || s
}
function statusTagType(s) {
  return TRIAL_BOOKING_STATUS_TAG_TYPE[s] || ''
}
function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}

async function onCheckIn() {
  acting.value = true
  try {
    const r = await trialBookingApi.checkIn(props.booking._id)
    ElMessage.success('已打卡')
    emit('updated', r.data)
  } finally {
    acting.value = false
  }
}

async function onComplete() {
  // onComplete 含义: 标 status=arrived→completed, 填 result
  // 1) 先打卡 (若还是 scheduled)
  if (props.booking.status === 'scheduled') {
    try {
      const r = await trialBookingApi.checkIn(props.booking._id)
      Object.assign(props.booking, r.data)
    } catch (e) {
      return
    }
  }
  // 2) 保存 result
  await onSaveResult(true)
}

async function onSaveResult(silent) {
  if (!resultFormRef.value) return
  try {
    await resultFormRef.value.validate()
  } catch (_) {
    return
  }
  acting.value = true
  try {
    const r = await trialBookingApi.complete(props.booking._id, {
      result: {
        isEnrolled: result.isEnrolled,
        attractionPoint: result.attractionPoint || '',
        reasonNotEnrolled: result.reasonNotEnrolled || '',
        negotiateTeacher: result.negotiateTeacher || null
      }
    })
    if (!silent) ElMessage.success('已保存')
    emit('updated', r.data)
  } finally {
    acting.value = false
  }
}

async function onConvert() {
  acting.value = true
  try {
    // 先调 preview 让用户确认
    const preview = await trialBookingApi.convertPreview(props.booking._id)
    if (preview.data?.alreadyConverted) {
      ElMessage.warning('该潜客已转化')
      emit('updated', preview.data.lead)
      return
    }
    const ok = await ElMessageBox.confirm(
      `将创建家长账号 (${preview.data.previewUser.realName}, 初始密码: ${preview.data.initialPassword}) 和学员档案。\n\n5 分钟内可撤销。`,
      '确认转化',
      { type: 'success', confirmButtonText: '确认转化', cancelButtonText: '取消' }
    ).catch(() => null)
    if (!ok) return
    const r = await trialBookingApi.convert(props.booking._id)
    if (r.data?.idempotent) {
      ElMessage.info('已转化, 幂等返回')
    } else {
      const sib = r.data.autoConvertedSiblingCount || 0
      const sibMsg = sib > 0 ? ` · 同家长下 ${sib} 个其他孩子已同步建账号` : ''
      ElMessage.success(`已转化, 初始密码: ${r.data.initialPassword}${sibMsg}`)
    }
    emit('updated', r.data)
  } finally {
    acting.value = false
  }
}
</script>

<style scoped>
.signin-dialog {
  padding: 0 4px;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.lead-name {
  font-weight: 600;
  font-size: 16px;
}
.header-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.mb {
  margin-bottom: 16px;
}
.convert-area {
  text-align: center;
  padding: 16px 0;
}
</style>
