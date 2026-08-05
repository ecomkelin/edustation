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
          <!-- 2026-06-16: 删 "完成试听" 按钮
               - 业务上"完成试听"和"保存结果"是同一个动作 (都翻 completed + 填 result)
               - 表单底部"保存结果"按钮已经覆盖, 头部按钮冗余且容易让人点了没反应
               - 补填结果也用底部按钮, 不需要单独 -->
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
        <!-- 2026-06-16: 试听备注 — 之前 batch-schedule 写入了 remark 但前端 dialog 不显示 -->
        <el-descriptions-item v-if="booking.remark" label="试听备注" :span="2">
          <span style="white-space: pre-wrap">{{ booking.remark }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <!-- 完成结果 / 转化 -->
      <el-divider content-position="left">试听结果</el-divider>
      <!-- 已定夺结果只读展示区 (outcome=enrolled/declined; considering 走下面的态度区 + 表单可编辑) -->
      <el-descriptions
        v-if="booking.status === 'completed' && ['enrolled', 'declined'].includes(booking.result?.outcome)"
        :column="1"
        border
        size="small"
        class="mb saved-result"
      >
        <el-descriptions-item v-if="booking.result?.outcome === 'enrolled'" label="是否报名">
          <el-tag type="success" size="small">是</el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-else-if="booking.result?.outcome === 'declined'" label="是否报名">
          <el-tag type="info" size="small">否</el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="booking.result?.outcome === 'enrolled' && booking.result?.attractionPoint" label="吸引报名的点">
          <span style="white-space: pre-wrap">{{ booking.result.attractionPoint }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="booking.result?.outcome === 'declined' && booking.result?.reasonNotEnrolled" label="为什么不报名">
          <span style="white-space: pre-wrap">{{ booking.result.reasonNotEnrolled }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="booking.result?.outcome === 'enrolled' && consultantLabel" label="谈单老师">
          {{ consultantLabel }}
        </el-descriptions-item>
      </el-descriptions>
      <!-- 考虑期态度只读展示区 (completed + outcome=considering); 下方表单仍可跟进编辑 -->
      <!-- 2026-06-21 升级: 考虑期 3 字段展示 -->
      <el-descriptions
        v-if="booking.status === 'completed' && booking.result?.outcome === 'considering'"
        :column="1"
        border
        size="small"
        class="mb saved-result"
      >
        <el-descriptions-item v-if="booking.result?.considerNote" label="家长当下态度/顾虑">
          <span style="white-space: pre-wrap">{{ booking.result.considerNote }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="booking.result?.childNote" label="孩子表现">
          <span style="white-space: pre-wrap">{{ booking.result.childNote }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="booking.result?.followUpScript" label="跟进话术">
          <span style="white-space: pre-wrap">{{ booking.result.followUpScript }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="consultantLabel" label="谈单老师">
          {{ consultantLabel }}
        </el-descriptions-item>
      </el-descriptions>

      <!--
        2026-08-06: 试听结果表单显示条件 (outcome 驱动)
          - arrived: 显示 (做完试听, 等填结果)
          - completed + outcome=considering: 显示 (谈单老师跟进中, 可改成"是/否"定夺, 或继续改态度)
          - completed + outcome=enrolled/declined: 隐藏 (已定夺, 不可改)
      -->
      <el-form
        ref="resultFormRef"
        :model="result"
        :rules="resultRules"
        label-width="100px"
        label-position="right"
        v-show="canEditResult"
      >
        <el-form-item label="是否报名" prop="outcome">
          <!-- outcome 是 string enum, 直接绑 el-radio-group (不再需要 boolean/null 翻译 computed) -->
          <el-radio-group v-model="result.outcome">
            <el-radio value="enrolled">是 (已报名)</el-radio>
            <el-radio value="declined">否 (不报名)</el-radio>
            <el-radio value="considering">考虑中</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="result.outcome === 'enrolled'" label="吸引报名的点" prop="attractionPoint">
          <el-input v-model="result.attractionPoint" placeholder="如 老师好, 离家近" maxlength="500" />
        </el-form-item>
        <!-- 谈单老师总是必填 (用户反馈: 否状态也应有责任人, 不能空) -->
        <el-form-item label="谈单老师" prop="consultant">
          <el-select v-model="result.consultant" filterable :placeholder="result.outcome === 'considering' ? '谁在跟单?' : '谁负责这个家长?'" style="width: 100%">
            <el-option
              v-for="u in teacherOptions"
              :key="u._id || u.id"
              :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
              :value="u._id || u.id"
            />
          </el-select>
        </el-form-item>
        <!--
          考虑期 (outcome=considering): 试听做完但家长没当场定夺
          2026-06-21 升级: 考虑期 3 字段 (家长态度 + 孩子表现 + 话术准备)
            - 必填: 家长态度 (业务基础, 跟进策略靠这个)
            - 选填: 孩子表现 (引述孩子反应增强说服力), 话术准备 (新人销售需要)
        -->
        <template v-if="result.outcome === 'considering'">
          <el-form-item label="家长态度" prop="considerNote">
            <el-input
              v-model="result.considerNote"
              type="textarea"
              :rows="2"
              placeholder="如: 老师不错但价格想再比较 / 跟孩子爸商量下 / 课表冲突"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="孩子表现" prop="childNote">
            <el-input
              v-model="result.childNote"
              type="textarea"
              :rows="2"
              placeholder="如: 对 Scratch 兴趣很高, 完成度高, 主动问能不能继续"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="跟进话术" prop="followUpScript">
            <el-input
              v-model="result.followUpScript"
              type="textarea"
              :rows="3"
              placeholder="如: 先夸孩子编程天赋 + 介绍暑期班优惠 + 3 天内回复送 1 节赠课"
              maxlength="1000"
              show-word-limit
            />
          </el-form-item>
        </template>
        <el-form-item v-if="result.outcome === 'declined'" label="为什么不报名" prop="reasonNotEnrolled">
          <el-input v-model="result.reasonNotEnrolled" placeholder="如 离家太远" maxlength="500" />
        </el-form-item>
        <el-form-item v-if="result.outcome === 'considering'">
          <el-alert type="warning" :closable="false" show-icon>
            <template #title>考虑中 — 谈单老师后续跟进, 家长确定后回这里改成"是"或"否"</template>
          </el-alert>
        </el-form-item>
        <el-form-item v-if="booking.status === 'completed' && booking.result?.outcome === 'enrolled'">
          <el-alert type="success" :closable="false" show-icon>
            <template #title>已报名, 可点下方"转化为正式学员"建档</template>
          </el-alert>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="acting" @click="onSaveResult">
            {{ saveButtonLabel }}
          </el-button>
          <el-button
            v-if="result.outcome !== 'considering'"
            plain
            @click="resetToConsidering"
          >
            仍考虑中
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 转化按钮 (已完成 + outcome=enrolled 后才能点) -->
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
  outcome: 'considering',  // enrolled=已报名 / declined=未报名 / considering=考虑中 (默认考虑中, radio 总有选中)
  attractionPoint: '',
  considerNote: '',
  reasonNotEnrolled: '',
  // 2026-06-21: 谈单老师统一走顶级 consultant 字段 (result.negotiateTeacher 已删)
  consultant: null,
  // 2026-06-21 新增: 考虑期 3 字段 (家长态度 + 孩子表现 + 话术准备)
  childNote: '',
  followUpScript: ''
})
// 2026-08-06: outcome 是 string enum, 直接绑 el-radio, 不再需要 boolean/null 翻译 computed
//   (旧版 boolean 三态 + el-radio null bug 的 watch/computed 一并移除)

const resultRules = {
  // outcome 是 string enum, radio 始终 3 选 1, 不需要 required
  outcome: [],
  attractionPoint: [
    {
      validator: (_, v, cb) => {
        if (result.outcome === 'enrolled' && !v) return cb(new Error('请填写吸引报名的点'))
        cb()
      },
      trigger: 'blur'
    }
  ],
  // 考虑期 — 家长态度 + 孩子表现都必填 (用户反馈: 跟进说服力靠这两个)
  considerNote: [
    {
      validator: (_, v, cb) => {
        if (result.outcome === 'considering' && !v) {
          return cb(new Error('请填写家长当下态度/顾虑'))
        }
        cb()
      },
      trigger: 'blur'
    }
  ],
  childNote: [
    {
      validator: (_, v, cb) => {
        if (result.outcome === 'considering' && !v) {
          return cb(new Error('请填写孩子表现'))
        }
        cb()
      },
      trigger: 'blur'
    }
  ],
  reasonNotEnrolled: [
    {
      validator: (_, v, cb) => {
        if (result.outcome === 'declined' && !v) return cb(new Error('请填写为什么不报名'))
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
    && props.booking.result?.outcome === 'enrolled'
    && !props.booking.result?.enrolledAt
})

/**
 * 2026-08-06: 表单可编辑判断 (outcome 驱动)
 *   - arrived: 试听刚做完, 等填结果
 *   - completed + outcome=considering: 谈单老师跟进中, 可改 (改成"是/否"定夺, 或只改态度)
 *   - completed + outcome=enrolled/declined: 不可改 (已定夺, 避免覆盖)
 */
const canEditResult = computed(() => {
  if (!props.booking) return false
  if (props.booking.status === 'arrived') return true
  if (props.booking.status === 'completed' && props.booking.result?.outcome === 'considering') return true
  return false
})

/**
 * 保存按钮文案 (outcome 驱动)
 *   - arrived + 选考虑中 → "进入考虑期"
 *   - completed+considering + 选考虑中 → "更新态度"
 *   - completed+considering + 选是/否 → "定夺"
 *   - 其他 → "保存结果"
 */
const saveButtonLabel = computed(() => {
  if (!props.booking) return '保存'
  const isConsideringState =
    props.booking.status === 'completed' && props.booking.result?.outcome === 'considering'
  if (isConsideringState) {
    return result.outcome === 'considering' ? '更新态度' : '定夺'
  }
  if (props.booking.status === 'arrived' && result.outcome === 'considering') return '进入考虑期'
  return '保存结果'
})

/**
 * 谈单老师显示名 (2026-06-21 改: 走顶级 consultant 字段, 替代之前的 result.negotiateTeacher)
 *   - 后端 detail / list 的 populate('consultant', 'mobile realName') 会带回对象
 *   - 但 el-select 展示时优先从 teacherOptions (列表拉的) 匹配
 *   - 找不到时 fallback 到 populate 对象的 realName
 *   - 再不行就显示手机号或 id (而非裸 ObjectId)
 */
const consultantLabel = computed(() => {
  const nt = props.booking?.consultant
  if (!nt) return ''
  // 1) 从 teacherOptions 找
  const id = typeof nt === 'object' ? (nt._id || nt.id) : nt
  const hit = teacherOptions.value.find((u) => (u._id || u.id) === id)
  if (hit) return `${hit.realName || ''} (${hit.mobile || ''})`.trim()
  // 2) fallback 到 populate 对象字段
  if (typeof nt === 'object') {
    return `${nt.realName || ''} (${nt.mobile || ''})`.trim()
  }
  // 3) 实在没办法, 显示裸 id (理论上不走到这)
  return String(nt)
})

watch(() => props.visible, async (v) => {
  if (v && props.booking) {
    // 同步 result 表单
    const r = props.booking.result || {}
    // 2026-08-06: outcome 回显 (未到 completed 时默认 'considering', radio 总有选中)
    //   arrived 首次填 → 默认考虑中; completed+considering 跟进 → 回显 considering
    result.outcome = ['enrolled', 'declined', 'considering'].includes(r.outcome) ? r.outcome : 'considering'
    result.attractionPoint = r.attractionPoint || ''
    result.considerNote = r.considerNote || ''
    result.reasonNotEnrolled = r.reasonNotEnrolled || ''
    // 2026-06-21 新增: 加载考虑期 3 字段
    result.childNote = r.childNote || ''
    result.followUpScript = r.followUpScript || ''
    // 2026-06-21: consultant 走顶级字段 (替代 result.negotiotiateTeacher)
    //   可能是 ObjectId 字符串 或 populate 后的 User 对象
    //   el-select v-model 需要 id 字符串才能在 options 中找到 label
    //   否则 input 区域会显示裸 ObjectId
    result.consultant = (r.consultant && typeof r.consultant === 'object')
      ? (r.consultant._id || r.consultant.id)
      : (r.consultant || null)
    if (!result.consultant && props.booking.preStudent?.inviteTeacher) {
      const inv = props.booking.preStudent.inviteTeacher
      result.consultant = typeof inv === 'object' ? inv._id : inv
    }
    try {
      // 2026-06-21: 谈单老师 dropdown 改用后端 roleScope=staff (正确处理"既是家长又是老师"的混合岗)
      //   之前的 name === '家长' 字符串过滤漏了 VIP 家长 / 改名 / 混合岗, 见 user.service.js#list
      const r = await userApi.list({ pageSize: 200, roleScope: 'staff' })
      teacherOptions.value = r.data?.items || []
      // 2026-06-16: 谈单老师 / 邀请老师可能在 list 前 200 之外 → 查不到 label
      //   兜底: 用 userApi.detail 单独查, 注入到 options 头部
      //   这样 el-select 能显示 "用户名 (手机号)" 而不是裸 ObjectId
      const needDetail = new Set()
      if (result.consultant
        && !teacherOptions.value.some((u) => (u._id || u.id) === result.consultant)) {
        needDetail.add(result.consultant)
      }
      // inviteTeacher (行 261-263 默认填充的) 也兜底
      const inv = props.booking.preStudent?.inviteTeacher
      const invId = inv ? (typeof inv === 'object' ? (inv._id || inv.id) : inv) : null
      if (invId && !teacherOptions.value.some((u) => (u._id || u.id) === invId)) {
        needDetail.add(invId)
      }
      for (const id of needDetail) {
        try {
          const detail = await userApi.detail(id)
          if (detail.data) teacherOptions.value.unshift(detail.data)
        } catch (e) { /* 404 / 跨 org 都不影响主体逻辑 */ }
      }
    } catch (e) {}
  }
}, { immediate: true })

function statusLabel(s) {
  return TRIAL_BOOKING_STATUS_LABEL[s] || s
}
function statusTagType(s) {
  return TRIAL_BOOKING_STATUS_TAG_TYPE[s] || 'info'
}
function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}

async function onCheckIn() {
  acting.value = true
  try {
    const r = await trialBookingApi.checkIn(props.booking._id)
    // 2026-06-16: 到店打卡成功后自动关闭弹窗
    //   - 老版: 不关弹窗, 用户看到 status=arrived 但还要手动点 X
    //   - 业务上打卡就是"人来了, 录一下", 关弹窗让用户继续走"完成试听"流程
    //   - 列表 tab 自动从"已约"切到"已到店" (load() 刷新)
    ElMessage.success('已打卡')
    emit('updated', r.data)
    emit('update:visible', false)
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
  // 2026-06-16: 修复"完成试听"按钮无反应
  //   - 老版: silent=true 不弹 toast, 弹窗不关 → 用户以为没生效
  //   - 新版: silent=true 但成功后关闭弹窗 + 弹 toast
  const ok = await onSaveResult(true)
  if (ok) {
    ElMessage.success('已完成试听')
    emit('update:visible', false)
  }
}

/**
 * 2026-06-20: considering 状态下, 用户选了"是/否"后又改回"考虑中" → 重置表单
 *   - 业务上"跟进时想继续考虑, 不定夺", 让用户能撤回
 *   - 触发: 点击 [仍考虑中] 按钮
 *   - 行为: 重新打开 dialog 时 radio 默认"考虑中", 态度备注保留
 */
function resetToConsidering() {
  result.outcome = 'considering'
  ElMessage.info('已切回「考虑中」, 修改后点保存')
}

async function onSaveResult(silent) {
  if (!resultFormRef.value) return false
  try {
    await resultFormRef.value.validate()
  } catch (_) {
    return false
  }
  acting.value = true
  try {
    // 2026-08-06: outcome 显式传 (enrolled/declined/considering)
    //   - 后端据此设 result.outcome + 翻 status=completed (考虑中也是 completed)
    //   - outcome 是 string, 不再有 el-radio null bug, 无需 undefined 兜底
    // 2026-06-21: 谈单老师统一走顶级 consultant 字段 (替代 result.negotiateTeacher)
    const resultPayload = {
      attractionPoint: result.attractionPoint || '',
      considerNote: result.considerNote || '',
      reasonNotEnrolled: result.reasonNotEnrolled || '',
      outcome: result.outcome,
      // 考虑期 3 字段
      childNote: result.childNote || '',
      followUpScript: result.followUpScript || ''
    }
    const r = await trialBookingApi.complete(props.booking._id, {
      result: resultPayload,
      consultant: result.consultant || null
    })
    if (!silent) ElMessage.success('已保存')
    // 2026-06-16: 同步本地 props.booking.result, 让 dialog 关闭再开仍能展示已保存值
    props.booking.result = { ...(props.booking.result || {}), ...r.data.result }
    emit('updated', r.data)
    // 2026-06-16: 业务决策 — 试听结果保存即关闭弹窗
    //   - 业务上"保存结果"是终态动作, 弹窗留作再编辑意义不大
    //   - silent 模式 (onComplete 内部调) 会再 emit 一次, 幂等
    emit('update:visible', false)
    return true
  } catch (e) {
    return false
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
      // 2026-06-16: 1 家长带多孩, 不再自动 mark 其他孩子
      // 同 parent 下其他孩子保持当前状态, 销售需逐个转化才能建学员档案
      ElMessage.success(`已转化, 初始密码: ${r.data.initialPassword}`)
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
