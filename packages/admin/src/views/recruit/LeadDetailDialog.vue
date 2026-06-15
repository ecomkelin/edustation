<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="800px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <div v-if="loading" v-loading="true" class="loading-block" />
    <div v-else-if="lead" class="detail-content">
      <!-- 头部: 状态 + 撤销转化按钮 -->
      <div class="header">
        <el-tag :type="statusTagType(lead.status)" size="large">
          {{ statusLabel(lead.status) }}
        </el-tag>
        <el-tag
          v-if="lead.samePhoneCount > 1"
          type="info"
          effect="plain"
          class="ml"
          :title="`该手机号下共 ${lead.samePhoneCount} 个孩子, 这是第 ${lead.samePhoneRank} 个`"
        >
          {{ lead.name }} 是同手机号下第 {{ lead.samePhoneRank }} / {{ lead.samePhoneCount }} 个孩子
        </el-tag>
        <span class="meta" v-if="lead.convertedAt">
          转化于 {{ formatTime(lead.convertedAt) }}
        </span>
        <div class="header-actions">
          <el-button
            v-if="canUnconvert"
            type="warning"
            size="small"
            :loading="acting"
            @click="onUnconvert"
          >
            撤销转化 ({{ unconvertCountdown }})
          </el-button>
          <el-button
            v-if="lead.status === 'tried' || lead.status === 'scheduled'"
            size="small"
            @click="emit('mark-lost', lead)"
          >
            标记流失
          </el-button>
        </div>
      </div>

      <!-- 基础信息 -->
      <el-descriptions :column="2" border size="small" class="mb">
        <el-descriptions-item label="联系电话">{{ lead.phone }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ genderLabel(lead.gender) }}</el-descriptions-item>
        <el-descriptions-item label="年龄">{{ lead.age ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="渠道">{{ lead.source || '-' }}</el-descriptions-item>
        <el-descriptions-item label="学校">
          {{ typeof lead.school === 'object' ? lead.school?.name : lead.school || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="年级/班级">
          {{ lead.grade || '-' }} / {{ lead.className || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="试听科目">
          {{ typeof lead.trialSubject === 'object' ? lead.trialSubject?.name : lead.trialSubject || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="试听缴费">¥ {{ lead.trialFee ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="邀约老师">
          {{ lead.inviteTeacher?.realName || lead.inviteTeacher?.mobile || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="期望时间">{{ lead.expectedTime || '-' }}</el-descriptions-item>
        <el-descriptions-item label="具体约哪天" :span="2">
          {{ formatDate(lead.specificDate) }}
        </el-descriptions-item>
        <el-descriptions-item v-if="lead.remark" label="备注" :span="2">
          {{ lead.remark }}
        </el-descriptions-item>
        <el-descriptions-item v-if="lead.convertedRemark" label="转化备注" :span="2">
          {{ lead.convertedRemark }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 触点时间线 + 记录触点按钮 -->
      <el-divider content-position="left">
        <span>触点时间线 ({{ lead.activities?.length || 0 }})</span>
        <el-button link type="primary" class="ml" @click="activityDialog = true">+ 记录触点</el-button>
      </el-divider>
      <div v-if="!lead.activities || lead.activities.length === 0" class="empty">
        暂无触点, 点击右上"记录触点"开始
      </div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="a in lead.activities"
          :key="a._id"
          :timestamp="formatTime(a.at)"
          placement="top"
        >
          <el-tag size="small">{{ activityTypeLabel(a.type) }}</el-tag>
          <span class="ml">{{ a.remark || '(无备注)' }}</span>
          <span class="meta ml">by {{ a.byUser?.realName || a.byUser?.mobile || '-' }}</span>
        </el-timeline-item>
      </el-timeline>

      <!-- 试听历史 -->
      <el-divider content-position="left">试听历史 ({{ lead.bookings?.length || 0 }})</el-divider>
      <div v-if="!lead.bookings || lead.bookings.length === 0" class="empty">
        暂无试听记录
      </div>
      <el-table v-else :data="lead.bookings" size="small" border>
        <el-table-column label="第几次" prop="attemptNo" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计划时间" width="160">
          <template #default="{ row }">{{ formatTime(row.scheduledAt) }}</template>
        </el-table-column>
        <el-table-column label="试听老师">
          <template #default="{ row }">
            {{ row.teacher?.realName || row.teacher?.mobile || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="是否报名">
          <template #default="{ row }">
            <span v-if="row.result?.isEnrolled === true" style="color: #67c23a">已报名</span>
            <span v-else-if="row.result?.isEnrolled === false" style="color: #f56c6c">未报</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" show-overflow-tooltip />
      </el-table>
    </div>

    <!-- 记录触点 dialog -->
    <el-dialog
      v-model="activityDialog"
      title="记录触点"
      width="480px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form :model="activity" label-width="80px">
        <el-form-item label="类型">
          <el-select v-model="activity.type" placeholder="选触点类型" style="width: 100%">
            <el-option v-for="t in ACTIVITY_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="activity.at"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
            placeholder="默认 = 现在"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="activity.remark" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="activityDialog = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="onSaveActivity">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { leadApi } from '@/api/lead'
import {
  LEAD_STATUS_LABEL, LEAD_STATUS_TAG_TYPE,
  TRIAL_BOOKING_STATUS_LABEL, TRIAL_BOOKING_STATUS_TAG_TYPE,
  LEAD_ACTIVITY_TYPE_LABEL
} from '@/utils/constants'
import { GENDER_LABEL } from '@/utils/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  leadId: { type: String, default: null }
})
const emit = defineEmits(['update:visible', 'updated', 'mark-lost', 'reopen'])

const loading = ref(false)
const acting = ref(false)
const lead = ref(null)
const activityDialog = ref(false)
const activity = reactive({ type: 'call', at: null, remark: '' })

const ACTIVITY_TYPES = [
  { value: 'call', label: '电话' },
  { value: 'wechat', label: '微信' },
  { value: 'visit', label: '面访' },
  { value: 'sms', label: '短信' },
  { value: 'note', label: '备注' }
]

// dialog title: 同手机号下第 N / M 个孩子时, title 上拼角标 (1 家长带多孩, 2026-06)
const dialogTitle = computed(() => {
  if (!lead.value) return '潜客详情'
  if (lead.value.samePhoneCount > 1) {
    return `潜客详情 - ${lead.value.name} (${lead.value.samePhoneRank}/${lead.value.samePhoneCount})`
  }
  return `潜客详情 - ${lead.value.name}`
})

// 撤销倒计时 (5 分钟)
const unconvertCountdown = ref(0)
let countdownTimer = null
function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer)
  if (!canUnconvert.value) {
    unconvertCountdown.value = 0
    return
  }
  const tick = () => {
    if (!lead.value || !lead.value.convertedAt) {
      unconvertCountdown.value = 0
      return
    }
    const elapsed = Date.now() - new Date(lead.value.convertedAt).getTime()
    const remain = Math.max(0, 5 * 60 * 1000 - elapsed)
    unconvertCountdown.value = Math.ceil(remain / 1000)
    if (remain <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }
  tick()
  countdownTimer = setInterval(tick, 1000)
}
onUnmounted(() => { if (countdownTimer) clearInterval(countdownTimer) })

const canUnconvert = computed(() => {
  if (!lead.value) return false
  if (lead.value.status !== 'converted' || !lead.value.convertedAt) return false
  const elapsed = Date.now() - new Date(lead.value.convertedAt).getTime()
  return elapsed <= 5 * 60 * 1000
})

watch(() => props.visible, async (v) => {
  if (v && props.leadId) {
    await load()
    startCountdown()
  } else {
    lead.value = null
    if (countdownTimer) clearInterval(countdownTimer)
  }
}, { immediate: true })

async function load() {
  loading.value = true
  try {
    const r = await leadApi.detail(props.leadId)
    lead.value = r.data
  } finally {
    loading.value = false
  }
}

async function onSaveActivity() {
  if (!activity.type) {
    ElMessage.warning('请选触点类型')
    return
  }
  acting.value = true
  try {
    await leadApi.createActivity(props.leadId, {
      type: activity.type,
      at: activity.at || undefined,
      remark: activity.remark || ''
    })
    ElMessage.success('已记录')
    activityDialog.value = false
    activity.type = 'call'
    activity.at = null
    activity.remark = ''
    await load()
    emit('updated')
  } finally {
    acting.value = false
  }
}

async function onUnconvert() {
  const ok = await ElMessageBox.confirm(
    '撤销转化将物理删除新创建的家长账号和学员档案。\n该操作不可逆, 请确认。',
    '撤销转化',
    { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消' }
  ).catch(() => null)
  if (!ok) return
  acting.value = true
  try {
    await leadApi.unconvert(props.leadId)
    ElMessage.success('已撤销')
    await load()
    emit('updated')
  } finally {
    acting.value = false
  }
}

function statusLabel(s) {
  return LEAD_STATUS_LABEL[s] || s
}
function statusTagType(s) {
  return LEAD_STATUS_TAG_TYPE[s] || ''
}
function trialStatusLabel(s) {
  return TRIAL_BOOKING_STATUS_LABEL[s] || s
}
function trialStatusTagType(s) {
  return TRIAL_BOOKING_STATUS_TAG_TYPE[s] || ''
}
function activityTypeLabel(t) {
  return LEAD_ACTIVITY_TYPE_LABEL[t] || t
}
function genderLabel(g) {
  return GENDER_LABEL[g] || '-'
}
function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}
function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.detail-content {
  padding: 0 4px;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.header .meta {
  color: #909399;
  font-size: 13px;
}
.header-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.mb {
  margin-bottom: 16px;
}
.ml {
  margin-left: 8px;
}
.meta {
  color: #909399;
  font-size: 12px;
}
.empty {
  text-align: center;
  color: #909399;
  padding: 16px 0;
  font-size: 13px;
}
.loading-block {
  height: 200px;
}
</style>
