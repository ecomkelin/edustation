<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
    @close="onClose"
  >
    <!-- 软唯一命中告警 (仅当未传 parent 时) -->
    <el-alert
      v-if="!parent && !childLead && duplicates.length > 0"
      type="warning"
      :closable="false"
      show-icon
      class="mb"
    >
      <template #title>
        该手机号已存在家长账户, 共 {{ duplicates.length }} 个
      </template>
      <div v-for="d in duplicates" :key="d._id" class="dup-line">
        <el-link type="primary" @click="onOpenExisting(d)">
          [查看] {{ d.phone }} - 状态: {{ lifecycleLabel(d.lifecycle) }} ({{ formatTime(d.createdAt) }})
        </el-link>
      </div>
    </el-alert>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
    >
      <!-- 家长电话 (新建家长时必填; 编辑模式不可改) -->
      <el-form-item
        v-if="!parent && !childLead"
        label="家长电话"
        prop="phone"
      >
        <el-input
          v-model="form.phone"
          placeholder="11 位手机号"
          maxlength="11"
          @blur="onPhoneBlur"
        />
      </el-form-item>
      <el-form-item
        v-else-if="parent"
        label="家长电话"
      >
        <el-input :model-value="parent.phone" disabled />
      </el-form-item>

      <el-form-item label="孩子姓名" prop="name">
        <el-input v-model="form.name" maxlength="50" placeholder="如: 张三" />
      </el-form-item>

      <el-form-item label="性别" prop="gender">
        <el-radio-group v-model="form.gender">
          <el-radio value="male">男</el-radio>
          <el-radio value="female">女</el-radio>
          <el-radio value="other">其他</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="年龄" prop="age">
        <el-input-number v-model="form.age" :min="2" :max="25" placeholder="2-25" />
      </el-form-item>

      <el-form-item label="学校" prop="school">
        <el-select v-model="form.school" filterable clearable placeholder="选学校" style="width: 100%">
          <el-option
            v-for="s in schoolOptions"
            :key="s._id || s.id"
            :label="s.name"
            :value="s._id || s.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="年级/班级" prop="grade">
        <div class="row-2">
          <el-input v-model="form.grade" placeholder="如: 三年级" maxlength="30" />
          <el-input v-model="form.className" placeholder="如: 2班" maxlength="30" />
        </div>
      </el-form-item>

      <el-form-item label="试听科目类别" prop="trialSubjects">
        <el-select
          v-model="form.trialSubjects"
          multiple
          filterable
          placeholder="可多选 (按数组长度建 N 笔试听预约); 真正的试听级别由老师判定"
          style="width: 100%"
        >
          <el-option
            v-for="c in trialSubjectCategoryOptions"
            :key="c._id"
            :label="c.name"
            :value="c._id"
          />
        </el-select>
        <div class="hint">销售录入时只需大致归类 (例如: 科技类/艺术类/体育类); 试课时由老师根据年龄段/级别选具体 Subject</div>
      </el-form-item>

      <el-form-item label="试听缴费" prop="trialFee">
        <el-input-number v-model="form.trialFee" :min="0" :precision="2" :step="0.01" />
        <span class="hint">元 (纯记账, 暂不接支付)</span>
      </el-form-item>

      <!-- 招生渠道 (Channel 字典, 2026-06-15); 默认 = 地推 -->
      <el-form-item label="招生渠道" prop="source">
        <el-select
          v-model="form.source"
          filterable
          clearable
          placeholder="不选则默认 = 地推"
          style="width: 100%"
        >
          <el-option
            v-for="c in channelOptions"
            :key="c._id"
            :label="c.name"
            :value="c._id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="邀约老师" prop="inviteTeacher">
        <el-select
          v-model="form.inviteTeacher"
          filterable
          clearable
          placeholder="默认 = 当前登录用户"
          style="width: 100%"
        >
          <el-option
            v-for="u in teacherOptions"
            :key="u._id || u.id"
            :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
            :value="u._id || u.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="期望时间" prop="expectedTime">
        <el-input v-model="form.expectedTime" maxlength="100" placeholder="如: 周末下午" />
      </el-form-item>

      <el-form-item label="具体约哪天" prop="specificDate">
        <el-date-picker
          v-model="form.specificDate"
          type="date"
          placeholder="(可选) 排课 hint"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" />
      </el-form-item>

      <!-- 状态 (仅编辑模式可见; 手动可改 pending/contacted/lost, 系统态只读展示) -->
      <template v-if="isEdit">
        <el-form-item label="状态" prop="status">
          <div class="status-row">
            <el-select
              v-model="form.status"
              placeholder="选择手动管理后的状态"
              style="flex: 1"
            >
              <el-option
                v-for="s in editableStatuses"
                :key="s.value"
                :label="s.label"
                :value="s.value"
              />
            </el-select>
            <el-tag
              v-if="isSystemStatus(currentStatus)"
              :type="statusTagType(currentStatus)"
              size="small"
              class="ml"
            >
              当前 {{ statusLabel(currentStatus) }} (系统维护)
            </el-tag>
          </div>
          <div class="hint">仅 pending/contacted/lost 可手动调整; scheduled/tried/converted 由系统自动维护</div>
        </el-form-item>
        <el-form-item v-if="form.status === 'lost'" label="流失原因" prop="lostReason">
          <el-input v-model="form.lostReason" maxlength="500" placeholder="选 lost 时必填" />
        </el-form-item>
      </template>

      <!-- 家长状态 (仅编辑模式 + 有 parent 时; 5 态可手动改, 但跟 '已流失' 标签 / recompute 联动) -->
      <template v-if="isEdit && parent">
        <el-form-item label="家长状态" prop="lifecycle">
          <div class="status-row">
            <el-select
              v-model="form.lifecycle"
              placeholder="手动管理家长 lifecycle"
              style="flex: 1"
            >
              <el-option
                v-for="s in lifecycleOptions"
                :key="s.value"
                :label="s.label"
                :value="s.value"
              />
            </el-select>
            <el-tag
              :type="lifecycleTagType(currentLifecycle)"
              size="small"
              class="ml"
            >
              当前 {{ lifecycleLabel(currentLifecycle) }}
            </el-tag>
            <el-button
              size="small"
              link
              type="primary"
              :loading="recomputing"
              class="ml"
              @click="onRecomputeLifecycle"
            >重算</el-button>
          </div>
          <div class="hint">
            手动改后跟系统推导可能不一致; 加 '已流失' 标签 / 点 '重算' 会覆盖手动值
          </div>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ submitText }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { parentApi } from '@/api/parent'
import { childLeadApi } from '@/api/childLead'
import { schoolApi } from '@/api/school'
import { userApi } from '@/api/user'
import { categoryApi } from '@/api/category'
import { PARENT_LIFECYCLE_LABEL, PARENT_LIFECYCLE_TAG_TYPE, CHILD_LEAD_STATUS_LABEL, CHILD_LEAD_STATUS_TAG_TYPE } from '@/utils/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** 已存在的 parent (同家长加孩 / 编辑孩子模式); null 表示新建家长 + 第一个孩子 */
  parent: { type: Object, default: null },
  /** 已存在的 childLead (编辑单个孩子模式); null 表示新增 */
  childLead: { type: Object, default: null },
  /** 跨年重试: 预填 sameAs */
  sameAs: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:visible', 'saved', 'open-existing'])

const formRef = ref(null)
const submitting = ref(false)
const recomputing = ref(false)
const duplicates = ref([])
// 2026-06-18: trialSubject(s) 改引 Category(model='Subject'); 录入侧只标记"试听类别"
const trialSubjectCategoryOptions = ref([])
const schoolOptions = ref([])
const teacherOptions = ref([])
const channelOptions = ref([])

const isEdit = computed(() => !!props.childLead)

const dialogTitle = computed(() => {
  if (isEdit.value) return `编辑孩子: ${props.childLead?.name || ''}`
  if (props.parent) return `为家长 ${props.parent.phone} 加一个孩子`
  return '录入家长账户 + 第一个孩子'
})

const submitText = computed(() => {
  if (isEdit.value) return '保存修改'
  if (props.parent) return '为该家长加一个孩子'
  return '创建家长 + 第一个孩子'
})

const form = reactive({
  phone: '',
  name: '',
  gender: 'male',
  age: 7,
  school: null,
  grade: '',
  className: '',
  trialSubjects: [],
  // 默认 19.90 元 (单次试听标准价, 业务约定), 可改
  trialFee: 19.90,
  // 渠道: null 表示由后端兜底 = 地推
  source: null,
  inviteTeacher: null,
  expectedTime: '',
  specificDate: null,
  remark: '',
  force: false,
  status: '',
  lostReason: '',
  // 家长状态 (5 态, 仅编辑模式有 parent 时用)
  lifecycle: ''
})

const editableStatuses = [
  { value: 'pending', label: '待联系 (回退)' },
  { value: 'contacted', label: '已联系' },
  { value: 'lost', label: '已流失' }
]

// 系统自动维护的状态 (由 TrialBooking / 转化驱动, 不让销售/教务手动改)
const SYSTEM_STATUSES = ['scheduled', 'tried', 'converted']
const isSystemStatus = (s) => SYSTEM_STATUSES.includes(s)
const currentStatus = computed(() => props.childLead?.status || '')

function statusLabel(s) { return CHILD_LEAD_STATUS_LABEL[s] || s || '-' }
function statusTagType(s) { return CHILD_LEAD_STATUS_TAG_TYPE[s] || 'info' }

// 家长 lifecycle (5 态)
const lifecycleOptions = [
  { value: 'new', label: '新登记' },
  { value: 'partial', label: '部分报名' },
  { value: 'full', label: '已成单' },
  { value: 'lost', label: '已流失' },
  { value: 'dormant', label: '沉睡客户' }
]
const currentLifecycle = computed(() => props.parent?.lifecycle || '')
function lifecycleLabel(s) { return PARENT_LIFECYCLE_LABEL[s] || s || '-' }
function lifecycleTagType(s) { return PARENT_LIFECYCLE_TAG_TYPE[s] || 'info' }

const phonePattern = /^1[3-9]\d{9}$/
const rules = computed(() => {
  const r = {
    name: [{ required: true, message: '请填孩子姓名', trigger: 'blur' }],
    trialSubjects: [{ type: 'array', required: true, min: 1, message: '至少选 1 个试听科目类别', trigger: 'change' }]
  }
  if (!props.parent && !props.childLead) {
    r.phone = [
      { required: true, message: '请填家长电话', trigger: 'blur' },
      { pattern: phonePattern, message: '11 位手机号', trigger: 'blur' }
    ]
  }
  if (isEdit.value && form.status === 'lost') {
    r.lostReason = [{ required: true, message: '选 lost 时请填原因', trigger: 'blur' }]
  }
  return r
})

watch(() => props.visible, async (v) => {
  if (!v) return
  if (isEdit.value && props.childLead) {
    // 编辑模式: 预填
    const c = props.childLead
    form.name = c.name || ''
    form.gender = c.gender || 'male'
    form.age = c.age ?? 7
    form.school = c.school?._id || c.school || null
    form.grade = c.grade || ''
    form.className = c.className || ''
    form.trialSubjects = (c.trialSubjects || []).map((s) => s?._id || s).filter(Boolean)
    form.trialFee = c.trialFee ?? 0
    // source 优先取 populate 后的 _id, 兜底取原始字段
    form.source = c.source?._id || c.source || null
    form.inviteTeacher = c.inviteTeacher?._id || c.inviteTeacher || null
    form.expectedTime = c.expectedTime || ''
    form.specificDate = c.specificDate || null
    form.remark = c.remark || ''
    // status 默认 = 当前值 (若是系统态 scheduled/tried/converted, 不会被 select 选项匹配,
    // 但我们用单独 tag 展示; 改不改都通过 form.status 跟踪)
    form.status = c.status || ''
    form.lostReason = c.lostReason || ''
    // 家长 lifecycle 默认 = parent 当前值 (编辑模式 + 有 parent 时)
    form.lifecycle = props.parent?.lifecycle || ''
    duplicates.value = []
    await loadOptions()
    return
  }
  // 新建 / 加孩模式: 重置 form
  form.phone = ''
  form.name = ''
  form.gender = 'male'
  form.age = 7
  form.school = null
  form.grade = ''
  form.className = ''
  form.trialSubjects = []
  form.trialFee = 19.90
  // 新建时 source 留空 → 后端兜底 = 地推
  form.source = null
  form.inviteTeacher = null
  form.expectedTime = ''
  form.specificDate = null
  form.remark = ''
  form.force = false
  form.status = ''
  form.lostReason = ''
  duplicates.value = []
  await loadOptions()
}, { immediate: true })

async function loadOptions() {
  try {
    // 2026-06-18: 试听科目类别改用 Category(model='Subject'); 不再拉 Subject
    const [catRes, scRes, uRes, chRes] = await Promise.all([
      categoryApi.list({ model: 'Subject', pageSize: 200 }),
      schoolApi.list({ pageSize: 200 }),
      userApi.list({ pageSize: 200 }),
      categoryApi.list({ model: 'Channel', pageSize: 100 })
    ])
    trialSubjectCategoryOptions.value = catRes.data?.items || (Array.isArray(catRes.data) ? catRes.data : [])
    schoolOptions.value = Array.isArray(scRes?.data) ? scRes.data : (scRes.data?.items || [])
    teacherOptions.value = (uRes.data?.items || [])
      .filter((u) => !(u.positions || []).some((p) => p.name === '家长'))
    channelOptions.value = chRes.data?.items || (Array.isArray(chRes.data) ? chRes.data : [])
  } catch (e) { /* ignore */ }
}

let blurTimer = null
async function onPhoneBlur() {
  if (props.parent || !form.phone || !phonePattern.test(form.phone)) {
    duplicates.value = []
    return
  }
  clearTimeout(blurTimer)
  blurTimer = setTimeout(async () => {
    try {
      const r = await parentApi.list({ phone: form.phone, pageSize: 50 })
      duplicates.value = r.data?.items || []
    } catch (e) { duplicates.value = [] }
  }, 400)
}

function onOpenExisting(d) {
  emit('open-existing', d)
}

function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  // 编辑模式
  if (isEdit.value && props.childLead) {
    submitting.value = true
    try {
      const payload = {
        name: form.name,
        gender: form.gender,
        age: form.age,
        school: form.school,
        grade: form.grade,
        className: form.className,
        trialSubjects: form.trialSubjects,
        trialFee: form.trialFee,
        source: form.source,
        inviteTeacher: form.inviteTeacher,
        expectedTime: form.expectedTime,
        specificDate: form.specificDate,
        remark: form.remark
      }
      if (form.status && form.status !== currentStatus.value) {
        // 用户真的改了 status (而不是保持原值)
        payload.status = form.status
        if (form.status === 'lost') payload.lostReason = form.lostReason
      }
      const r = await childLeadApi.update(props.childLead._id, payload)
      // 家长 lifecycle 改了 → 同步调 parentApi.update
      // 业务上 lifecycle 是 Parent 字段, 不属于 ChildLead, 必须单独提交
      if (props.parent && form.lifecycle && form.lifecycle !== currentLifecycle.value) {
        await parentApi.update(props.parent._id, { lifecycle: form.lifecycle })
      }
      ElMessage.success(`已保存 ${r.data?.name || ''}`)
      emit('saved', { mode: 'update', childLead: r.data })
      emit('update:visible', false)
    } finally {
      submitting.value = false
    }
    return
  }
  // 软唯一 + force
  if (!props.parent && duplicates.value.length > 0 && !form.force) {
    try {
      const ok = await ElMessageBox.confirm(
        `该手机号已存在 ${duplicates.value.length} 个家长账户. 是否仍要新建一个家长 (force=true)?`,
        '软唯一命中',
        { type: 'warning' }
      ).catch(() => null)
      if (!ok) return
      form.force = true
    } catch (e) { return }
  }
  submitting.value = true
  try {
    if (props.parent) {
      // 同家长加孩
      const r = await parentApi.addChild(props.parent._id, {
        name: form.name,
        gender: form.gender,
        age: form.age,
        school: form.school,
        grade: form.grade,
        className: form.className,
        trialSubjects: form.trialSubjects,
        trialFee: form.trialFee,
        source: form.source,
        inviteTeacher: form.inviteTeacher,
        expectedTime: form.expectedTime,
        specificDate: form.specificDate,
        remark: form.remark,
        sameAs: props.sameAs
      })
      ElMessage.success(`已为家长 ${props.parent.phone} 添加孩子 ${r.data?.name || ''}`)
      emit('saved', { mode: 'addChild', parent: props.parent, childLead: r.data })
    } else {
      // 新建家长 + 第一个孩子
      const r = await parentApi.withChild({
        phone: form.phone,
        name: form.name,
        gender: form.gender,
        age: form.age,
        school: form.school,
        grade: form.grade,
        className: form.className,
        trialSubjects: form.trialSubjects,
        trialFee: form.trialFee,
        source: form.source,
        inviteTeacher: form.inviteTeacher,
        expectedTime: form.expectedTime,
        specificDate: form.specificDate,
        remark: form.remark,
        force: form.force
      })
      if (r.data?.duplicate) {
        ElMessage.warning('该手机号已存在家长账户, 打开既有')
        emit('open-existing', r.data.parent)
      } else {
        ElMessage.success(`已创建家长 + 孩子 ${r.data?.childLead?.name || ''}`)
        emit('saved', { mode: 'withChild', parent: r.data.parent, childLead: r.data.childLead })
      }
    }
    emit('update:visible', false)
  } finally {
    submitting.value = false
  }
}

function onClose() {
  formRef.value?.resetFields()
}

// 重新计算家长 lifecycle: 调 recompute-lifecycle, 拿到系统推导值后
//   - 同步 form.lifecycle (覆盖手动改的值)
//   - 同步 currentLifecycle 显示 (getter 是基于 props.parent, 不需要)
//   - ElMessage 提示新值
async function onRecomputeLifecycle() {
  if (!props.parent?._id) return
  recomputing.value = true
  try {
    const r = await parentApi.recomputeLifecycle(props.parent._id)
    const newLc = r.data?.lifecycle
    if (newLc) {
      form.lifecycle = newLc
      ElMessage.success(`已重算: ${lifecycleLabel(newLc)}`)
    } else {
      ElMessage.warning('重算成功, 但未返回 lifecycle')
    }
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '重算失败'
    ElMessage.error(`重算失败: ${msg}`)
  } finally {
    recomputing.value = false
  }
}
</script>

<style scoped>
.mb { margin-bottom: 16px; }
.dup-line { padding: 2px 0; font-size: 13px; }
.row-2 { display: flex; gap: 8px; }
.row-2 .el-input { flex: 1; }
.ml { margin-left: 8px; }
.hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.status-row { display: flex; align-items: center; width: 100%; }
</style>
