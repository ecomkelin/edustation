<!--
  StudentFormDialog.vue (2026-08-07)

  学生详情页 / 列表页共用的「编辑基础信息」弹窗。
  - 与列表页里的同名 dialog 同语义, 简化: 不含 3 栏生日下拉 (用 el-date-picker),
    不含「监护人手机」(列表页 create 流程专用)
  - 仅承载: name / gender / birthday / school / grade / className / notes / avatarSvgKey
  - 复用 Student 现有 update 接口 (R-0403)
-->
<template>
  <el-dialog
    :model-value="visible"
    :title="form._id ? '编辑学生' : '新建学生'"
    width="520px"
    @update:model-value="onClose"
    @open="onOpen"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="姓名" prop="name" required>
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="头像">
        <div style="display: flex; align-items: center; gap: 12px">
          <SvgAvatar :svg-key="form.avatarSvgKey" :size="48" audience="student" />
          <el-button size="small" type="primary" link @click="picker = true">选择形象</el-button>
          <span v-if="!form.avatarSvgKey" style="color: #909399; font-size: 12px">未选择 (默认显示字母)</span>
        </div>
      </el-form-item>
      <el-form-item label="性别">
        <el-select v-model="form.gender" style="width: 100%">
          <el-option label="男" value="male" />
          <el-option label="女" value="female" />
          <el-option label="其他" value="other" />
        </el-select>
      </el-form-item>
      <el-form-item label="生日">
        <el-date-picker
          v-model="form.birthday"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择生日"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="年级">
        <el-input v-model="form.grade" placeholder="例: 三年级" />
      </el-form-item>
      <el-form-item label="班级">
        <el-input v-model="form.className" placeholder="例: 2班" />
      </el-form-item>
      <el-form-item label="所属学校">
        <el-select
          v-model="form.school"
          filterable
          clearable
          placeholder="不选则无(选填)"
          style="width: 100%"
        >
          <el-option
            v-for="s in schoolOptions"
            :key="s._id"
            :label="`${s.name}${SCHOOL_TYPE_LABEL[s.type] ? ' · ' + SCHOOL_TYPE_LABEL[s.type] : ''}`"
            :value="s._id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="3" placeholder="过敏史 / 特殊需求 / 老师注意事项" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="onClose">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>

    <AvatarSvgPicker
      v-model="picker"
      v-model:key-value="form.avatarSvgKey"
      audience="student"
      :allow-clear="true"
      title="选择学生形象"
    />
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { studentApi } from '@/api/student'
import { schoolApi } from '@/api/school'
import SvgAvatar from '@/components/Avatar/SvgAvatar.vue'
import AvatarSvgPicker from '@/components/Avatar/AvatarSvgPicker.vue'
import { SCHOOL_TYPE_LABEL } from '@/utils/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  // 编辑时传学生对象 (含 _id); 新建可传 null
  student: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref(null)
const saving = ref(false)
const picker = ref(false)
const schoolOptions = ref([])

const form = reactive({
  _id: '',
  name: '',
  gender: 'male',
  birthday: null,
  grade: '',
  className: '',
  school: '',
  notes: '',
  avatarSvgKey: null
})

const rules = {
  name: [{ required: true, message: '请填写姓名', trigger: 'blur' }]
}

watch(
  () => props.student,
  (s) => {
    if (!s) {
      Object.assign(form, {
        _id: '',
        name: '',
        gender: 'male',
        birthday: null,
        grade: '',
        className: '',
        school: '',
        notes: '',
        avatarSvgKey: null
      })
      return
    }
    Object.assign(form, {
      _id: s._id || s.id || '',
      name: s.name || '',
      gender: s.gender || 'male',
      birthday: s.birthday ? formatBirthday(s.birthday) : null,
      grade: s.grade || '',
      className: s.className || '',
      school: s.school ? (s.school._id || String(s.school)) : '',
      notes: s.notes || '',
      avatarSvgKey: s.avatarSvgKey || null
    })
  },
  { immediate: true }
)

/**
 * 后端 birthday 是 Date; 给 el-date-picker 喂 YYYY-MM-DD 字符串
 * 用本地年月日避免时区漂移 (1970-01-01 边缘)
 */
function formatBirthday(d) {
  const dd = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dd.getTime())) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`
}

async function loadSchools() {
  try {
    const r = await schoolApi.list({ isActive: 'true', pageSize: 500 })
    schoolOptions.value = r.data.items || []
  } catch (_) {
    schoolOptions.value = []
  }
}

function onOpen() {
  loadSchools()
}

function onClose() {
  emit('update:visible', false)
}

async function submit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    await studentApi.update(form._id, {
      name: form.name,
      gender: form.gender,
      birthday: form.birthday || null,
      grade: form.grade || '',
      className: form.className || '',
      school: form.school || null,
      notes: form.notes,
      avatarSvgKey: form.avatarSvgKey || null
    })
    ElMessage.success('已保存')
    emit('saved')
    onClose()
  } finally {
    saving.value = false
  }
}
</script>
