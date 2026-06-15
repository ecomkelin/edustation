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

      <el-form-item label="试听科目" prop="trialSubjects">
        <el-select
          v-model="form.trialSubjects"
          multiple
          filterable
          placeholder="可多选 (按数组长度建 N 笔试听预约)"
          style="width: 100%"
        >
          <el-option
            v-for="s in subjectOptions"
            :key="s._id || s.id"
            :label="s.name"
            :value="s._id || s.id"
          />
        </el-select>
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

      <!-- 状态 (仅编辑模式可见, 且仅允许 contacted/lost) -->
      <template v-if="isEdit">
        <el-form-item label="状态" prop="status">
          <el-select
            v-model="form.status"
            placeholder="保持当前状态, 仅允许主动改 contacted/lost"
            style="width: 100%"
          >
            <el-option
              v-for="s in editableStatuses"
              :key="s.value"
              :label="s.label"
              :value="s.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.status === 'lost'" label="流失原因" prop="lostReason">
          <el-input v-model="form.lostReason" maxlength="500" placeholder="选 lost 时必填" />
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
import { subjectApi } from '@/api/subject'
import { schoolApi } from '@/api/school'
import { userApi } from '@/api/user'
import { categoryApi } from '@/api/category'
import { PARENT_LIFECYCLE_LABEL } from '@/utils/constants'

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
const duplicates = ref([])
const subjectOptions = ref([])
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
  lostReason: ''
})

const editableStatuses = [
  { value: 'contacted', label: '已联系' },
  { value: 'lost', label: '已流失' }
]

const phonePattern = /^1[3-9]\d{9}$/
const rules = computed(() => {
  const r = {
    name: [{ required: true, message: '请填孩子姓名', trigger: 'blur' }],
    trialSubjects: [{ type: 'array', required: true, min: 1, message: '至少选 1 个试听科目', trigger: 'change' }]
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
    form.status = ''
    form.lostReason = c.lostReason || ''
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
    const [sRes, scRes, uRes, cRes] = await Promise.all([
      subjectApi.list({ pageSize: 200 }),
      schoolApi.list({ pageSize: 200 }),
      userApi.list({ pageSize: 200 }),
      categoryApi.list({ model: 'Channel', pageSize: 100 })
    ])
    subjectOptions.value = Array.isArray(sRes?.data) ? sRes.data : (sRes.data?.items || [])
    schoolOptions.value = Array.isArray(scRes?.data) ? scRes.data : (scRes.data?.items || [])
    teacherOptions.value = (uRes.data?.items || [])
      .filter((u) => !(u.positions || []).some((p) => p.name === '家长'))
    channelOptions.value = cRes.data?.items || (Array.isArray(cRes.data) ? cRes.data : [])
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
function lifecycleLabel(s) { return PARENT_LIFECYCLE_LABEL[s] || s || '-' }

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
      if (form.status) {
        payload.status = form.status
        if (form.status === 'lost') payload.lostReason = form.lostReason
      }
      const r = await childLeadApi.update(props.childLead._id, payload)
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
</script>

<style scoped>
.mb { margin-bottom: 16px; }
.dup-line { padding: 2px 0; font-size: 13px; }
.row-2 { display: flex; gap: 8px; }
.row-2 .el-input { flex: 1; }
.hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
