<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '编辑潜客' : '新建潜客'"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
    @close="onClose"
  >
    <el-alert
      v-if="duplicate"
      type="warning"
      :closable="false"
      show-icon
      class="mb"
    >
      <template #title>
        该手机号已存在潜客:
        <el-button link type="primary" @click="onOpenExisting">{{ duplicate.name }} ({{ duplicate.phone }})</el-button>
      </template>
    </el-alert>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
    >
      <el-form-item label="孩子姓名" prop="name">
        <el-input v-model="form.name" placeholder="请输入孩子姓名" maxlength="50" />
      </el-form-item>
      <el-form-item label="性别" prop="gender">
        <el-radio-group v-model="form.gender">
          <el-radio value="male">男</el-radio>
          <el-radio value="female">女</el-radio>
          <el-radio value="other">其他</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="年龄" prop="age">
        <el-input-number v-model="form.age" :min="2" :max="25" />
      </el-form-item>
      <el-form-item label="联系电话" prop="phone">
        <el-input
          v-model="form.phone"
          placeholder="11 位手机号"
          maxlength="11"
          @blur="onPhoneBlur"
        />
      </el-form-item>
      <el-form-item label="学校" prop="school">
        <el-select v-model="form.school" filterable clearable placeholder="选填" style="width: 100%">
          <el-option
            v-for="s in schools"
            :key="s._id || s.id"
            :label="s.name"
            :value="s._id || s.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="年级 / 班级" prop="grade">
        <div style="display: flex; gap: 8px; width: 100%">
          <el-input v-model="form.grade" placeholder="如 三年级" maxlength="30" />
          <el-input v-model="form.className" placeholder="如 2 班" maxlength="30" />
        </div>
      </el-form-item>
      <el-form-item label="试听科目" prop="trialSubject">
        <el-select v-model="form.trialSubject" filterable clearable placeholder="选填" style="width: 100%">
          <el-option
            v-for="s in subjects"
            :key="s._id || s.id"
            :label="s.name"
            :value="s._id || s.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="试听缴费" prop="trialFee">
        <el-input-number v-model="form.trialFee" :min="0" :precision="2" />
      </el-form-item>
      <el-form-item label="邀约老师" prop="inviteTeacher">
        <el-select
          v-model="form.inviteTeacher"
          filterable
          clearable
          placeholder="默认 = 当前登录用户, 可改"
          style="width: 100%"
        >
          <el-option
            v-for="u in orgEmployees"
            :key="u._id || u.id"
            :label="`${u.realName || u.mobile} (${u.mobile || ''})`"
            :value="u._id || u.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="期望时间" prop="expectedTime">
        <el-input v-model="form.expectedTime" placeholder="模糊: 周末下午" maxlength="100" />
      </el-form-item>
      <el-form-item label="具体约哪天" prop="specificDate">
        <el-date-picker
          v-model="form.specificDate"
          type="date"
          placeholder="选填 (仅做排课参考, 实际由批量排课决定)"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          maxlength="500"
          show-word-limit
          placeholder="选填"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ isEdit ? '保存' : (duplicate ? '覆盖新建' : '创建并建试听') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { leadApi } from '@/api/lead'
import { subjectApi } from '@/api/subject'
import { schoolApi } from '@/api/school'
import { userApi } from '@/api/user'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  visible: { type: Boolean, default: false },
  lead: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'saved', 'open-existing'])

const auth = useAuthStore()
const isEdit = computed(() => !!props.lead)
const formRef = ref(null)
const submitting = ref(false)
const duplicate = ref(null) // 命中既有 lead 时填
const subjects = ref([])
const schools = ref([])
const orgEmployees = ref([]) // 邀约老师下拉: 本公司员工

const form = reactive({
  name: '',
  gender: 'male',  // 默认男 (2026-06 用户反馈)
  age: 7,          // 默认 7 岁 (2026-06 用户反馈)
  phone: '',
  school: null,
  grade: '',
  className: '',
  trialSubject: null,
  trialFee: 19.9,  // 默认 19.9 元 (2026-06 用户反馈)
  inviteTeacher: null, // 编辑时填, 新建时取当前用户 id
  expectedTime: '',
  specificDate: null,
  remark: ''
})

const rules = {
  name: [
    { required: true, message: '请输入孩子姓名', trigger: 'blur' }
  ],
  phone: [
    { required: true, message: '请输入联系电话', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '电话格式不正确', trigger: 'blur' }
  ]
}

watch(() => props.visible, async (v) => {
  if (v) {
    duplicate.value = null
    await loadOptions()
    if (props.lead) {
      Object.assign(form, {
        name: props.lead.name || '',
        gender: props.lead.gender || 'male',
        age: props.lead.age ?? 7,
        phone: props.lead.phone || '',
        school: typeof props.lead.school === 'object' ? props.lead.school?._id : props.lead.school,
        grade: props.lead.grade || '',
        className: props.lead.className || '',
        trialSubject: typeof props.lead.trialSubject === 'object' ? props.lead.trialSubject?._id : props.lead.trialSubject,
        trialFee: props.lead.trialFee ?? 19.9,
        inviteTeacher: typeof props.lead.inviteTeacher === 'object'
          ? (props.lead.inviteTeacher?._id || props.lead.inviteTeacher?.id)
          : props.lead.inviteTeacher || null,
        expectedTime: props.lead.expectedTime || '',
        specificDate: props.lead.specificDate || null,
        remark: props.lead.remark || ''
      })
    } else {
      Object.assign(form, {
        name: '', gender: 'male', age: 7, phone: '',
        school: null, grade: '', className: '',
        trialSubject: null, trialFee: 19.9,
        inviteTeacher: auth.user?.id || auth.user?._id || null,
        expectedTime: '', specificDate: null, remark: ''
      })
    }
  }
}, { immediate: true })

async function loadOptions() {
  try {
    const [sRes, scRes, uRes] = await Promise.all([
      subjectApi.list({ pageSize: 200 }),
      schoolApi.list({ pageSize: 200 }),
      // 邀约老师下拉: 拉本机构员工 (pageSize 给 500 防分页丢, 机构员工数一般 < 100)
      userApi.list({ pageSize: 500 })
    ])
    // 响应统一被 ApiResponse.ok 包成 {success, data: ...}; http 拦截器 return body.
    // subject 端点 data 是裸 array; school/user data 是 {items, total} 分页结构.
    subjects.value = Array.isArray(sRes?.data) ? sRes.data : []
    schools.value = scRes?.data?.items || []
    // 邀约老师下拉: 仅本公司员工, 排除「家长」(2026-06 用户反馈); u.positions 是 [{name, ...}]
    orgEmployees.value = (uRes?.data?.items || [])
      .filter((u) => u.isActive !== false)
      .filter((u) => !(u.positions || []).some((p) => p.name === '家长'))
  } catch (e) {
    // ignore; 字段是 optional
  }
}

let phoneBlurTimer = null
function onPhoneBlur() {
  if (!form.phone || !/^1[3-9]\d{9}$/.test(form.phone)) return
  if (isEdit.value) return
  clearTimeout(phoneBlurTimer)
  phoneBlurTimer = setTimeout(async () => {
    try {
      const r = await leadApi.list({ phone: form.phone, pageSize: 1 })
      const items = r.data?.items || []
      if (items.length > 0) {
        duplicate.value = items[0]
      } else {
        duplicate.value = null
      }
    } catch (e) {
      // 静默
    }
  }, 400)
}

function onOpenExisting() {
  if (!duplicate.value) return
  emit('open-existing', duplicate.value)
  emit('update:visible', false)
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  // 软唯一命中: 弹确认是否继续新建 (默认行为不阻断, 但提示)
  if (!isEdit.value && duplicate.value) {
    try {
      await ElMessageBox.confirm(
        '已存在相同手机号的潜客, 是否仍要创建? 这将产生两个潜客记录。',
        '重复手机号',
        { type: 'warning', confirmButtonText: '仍要新建', cancelButtonText: '打开既有' }
      )
    } catch (_) {
      // 取消 → 打开既有
      onOpenExisting()
      return
    }
  }
  submitting.value = true
  try {
    const payload = {
      name: form.name,
      gender: form.gender || null,
      age: form.age,
      phone: form.phone,
      school: form.school || null,
      grade: form.grade || '',
      className: form.className || '',
      trialSubject: form.trialSubject || null,
      trialFee: form.trialFee,
      inviteTeacher: form.inviteTeacher || null,
      expectedTime: form.expectedTime || '',
      specificDate: form.specificDate || null,
      remark: form.remark || ''
    }
    if (isEdit.value) {
      await leadApi.update(props.lead._id || props.lead.id, payload)
      ElMessage.success('已保存')
    } else {
      const r = await leadApi.create(payload)
      if (r.data?.duplicate) {
        // 软唯一命中: 跳转既有
        ElMessage.info('该手机号已存在潜客, 已为您打开既有记录')
        emit('open-existing', r.data.lead)
        emit('update:visible', false)
        return
      }
      ElMessage.success('已创建, 并自动建了首笔试听预约')
    }
    emit('saved')
    emit('update:visible', false)
  } finally {
    submitting.value = false
  }
}

function onClose() {
  duplicate.value = null
  formRef.value?.resetFields()
}
</script>

<style scoped>
.mb {
  margin-bottom: 16px;
}
</style>
