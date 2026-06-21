<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <!-- 学生选择器 (2026-06-21): student 为 null 时显示可搜索 picker -->
      <el-form-item v-if="!student" label="学生" prop="studentId">
        <el-select
          v-model="form.studentId"
          placeholder="搜索学生姓名 / 手机号"
          filterable
          remote
          :remote-method="searchStudents"
          :loading="studentSearchLoading"
          style="width: 100%"
          @change="onStudentChange"
        >
          <el-option
            v-for="s in studentOptions"
            :key="s.id"
            :label="studentOptionLabel(s)"
            :value="s.id"
          />
        </el-select>
        <div v-if="currentBalance !== null" class="hint">
          当前余额: <strong>{{ currentBalance }}</strong> 分（无账户则为 0, 提交后自动创建）
        </div>
      </el-form-item>

      <!-- 已指定 student 的场景 (从行点击 / 学生画像 进来) -->
      <el-form-item v-else label="学生">
        <span class="student-name">{{ student.name || '—' }}</span>
        <span v-if="currentBalance !== null" class="muted" style="margin-left: 12px">
          当前余额: {{ currentBalance }} 分
        </span>
      </el-form-item>

      <el-form-item label="积分原因" prop="reasonId">
        <el-select
          v-model="form.reasonId"
          placeholder="选择预设原因（不选则自定义）"
          clearable
          filterable
          style="width: 100%"
          @change="onReasonChange"
        >
          <el-option
            v-for="r in reasons"
            :key="r.id"
            :label="formatReasonLabel(r)"
            :value="r.id"
          />
        </el-select>
        <div class="hint">不选原因可手动填写"加分/扣分"和备注</div>
      </el-form-item>

      <el-form-item label="方向" prop="direction">
        <el-radio-group v-model="form.direction" :disabled="reasonLocked">
          <el-radio-button value="in">加分 (+)</el-radio-button>
          <el-radio-button value="out">扣分 (-)</el-radio-button>
        </el-radio-group>
        <span v-if="reasonLocked" class="hint">已选原因, 方向锁定</span>
      </el-form-item>

      <el-form-item label="积分数量" prop="amount">
        <el-input-number
          v-model="form.amount"
          :min="1"
          :step="1"
          :precision="0"
          controls-position="right"
          style="width: 180px"
        />
        <span class="muted" style="margin-left: 12px">正整数</span>
        <div v-if="previewBalance !== null" class="hint" :class="{ danger: willOverdraft }">
          预计余额: <strong>{{ previewBalance }}</strong> 分
          <span v-if="willOverdraft" style="color: #f56c6c">（透支 {{ -previewBalance }}）</span>
        </div>
      </el-form-item>

      <el-form-item label="备注" prop="remark">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          :maxlength="200"
          show-word-limit
          placeholder="默认填原因名称, 可手动修改"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="onClose(false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!canSubmit" @click="onSubmit">
        确定{{ form.direction === 'in' ? '加分' : '扣分' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
/**
 * 手动调整积分 dialog (2026-06-21)
 *
 * 用法:
 *   1. 行点击 / 学生画像: <PointsAdjustDialog :student="row" />
 *   2. 顶部按钮 (任意学生): <PointsAdjustDialog :student="null" />
 *      dialog 内显示可搜索学生 picker
 *
 * 交互:
 *   - 选原因后, 金额预填 |defaultValue|, 方向锁为 sign(defaultValue)
 *   - 不选原因 ("自定义"): 解锁方向, 金额空
 *   - 备注默认 = 原因.name, 可改
 *   - 提交调 pointsAdminApi.adjust(studentId, { amount, reasonId, customReason, remark })
 *   - amount 是 signed: 加 = +N, 扣 = -N
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { pointsAdminApi } from '@/api/pointsAdmin'
import { studentApi } from '@/api/student'

const props = defineProps({
  visible: { type: Boolean, default: false },
  student: { type: Object, default: null },
  defaultDirection: { type: String, default: 'in' } // 'in' | 'out'
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref()
const saving = ref(false)
const reasons = ref([])
const currentBalance = ref(null)
const studentOptions = ref([])
const studentSearchLoading = ref(false)

const form = reactive({
  studentId: '',
  reasonId: '',
  direction: 'in',
  amount: null,
  remark: ''
})

const rules = {
  studentId: [{ required: true, message: '请选择学生', trigger: 'change' }],
  reasonId: [],
  direction: [{ required: true, message: '请选择方向', trigger: 'change' }],
  amount: [
    {
      validator: (_, value, cb) => {
        const n = Number(value)
        if (!Number.isFinite(n) || n === 0 || !Number.isInteger(n) || n < 1) {
          return cb(new Error('积分数量必须是 >= 1 的整数'))
        }
        cb()
      },
      trigger: 'change'
    }
  ],
  remark: [{ max: 200, message: '备注最多 200 字' }]
}

const reasonLocked = computed(() => !!form.reasonId)
const canSubmit = computed(() => {
  const n = Number(form.amount)
  return Number.isFinite(n) && n >= 1 && Number.isInteger(n) && form.direction && (!!props.student || !!form.studentId)
})

const signedAmount = computed(() => {
  const n = Number(form.amount) || 0
  return form.direction === 'out' ? -n : n
})

const previewBalance = computed(() => {
  if (currentBalance.value === null) return null
  if (!Number.isFinite(Number(form.amount)) || Number(form.amount) < 1) return currentBalance.value
  return currentBalance.value + signedAmount.value
})

const willOverdraft = computed(() => previewBalance.value !== null && previewBalance.value < 0)

const title = computed(() => {
  const action = form.direction === 'in' ? '加分' : '扣分'
  const name = props.student?.name || studentOptions.value.find((s) => s.id === form.studentId)?.name
  return name ? `${action}: ${name}` : `手动${action}`
})

function studentOptionLabel(s) {
  const g = (s.guardians || [])[0]
  const phoneTail = g?.mobile ? ` (${String(g.mobile).slice(-4)})` : ''
  return `${s.name}${phoneTail}`
}

function formatReasonLabel(r) {
  const sign = r.defaultValue > 0 ? '+' : r.defaultValue < 0 ? '' : '±'
  const absVal = Math.abs(r.defaultValue)
  return `${r.name} (${sign}${absVal})`
}

async function loadReasons() {
  try {
    const r = await pointsAdminApi.listReasons()
    reasons.value = r.data || []
  } catch (e) {
    reasons.value = []
  }
}

async function loadCurrentBalance(studentId) {
  const id = studentId || props.student?.id
  if (!id) {
    currentBalance.value = null
    return
  }
  try {
    const r = await pointsAdminApi.getAccount(id)
    currentBalance.value = r.data.account?.balance ?? 0
  } catch (e) {
    // 学员无账户 (balance=0) 或加载失败: 视为 0, 提交时 ensureAccount 自动创建
    currentBalance.value = 0
  }
}

async function searchStudents(q) {
  studentSearchLoading.value = true
  try {
    const r = await studentApi.list({ keyword: q || '', pageSize: 20, isActive: 'true' })
    studentOptions.value = (r.data.items || []).map((s) => ({
      id: s._id,
      name: s.name,
      guardians: s.guardians || []
    }))
  } catch (e) {
    studentOptions.value = []
  } finally {
    studentSearchLoading.value = false
  }
}

async function onStudentChange(studentId) {
  if (studentId) {
    await loadCurrentBalance(studentId)
  } else {
    currentBalance.value = null
  }
}

function onReasonChange(reasonId) {
  if (!reasonId) return
  const r = reasons.value.find((x) => x.id === reasonId)
  if (!r) return
  form.direction = r.direction === 'out' ? 'out' : 'in'
  form.amount = Math.abs(r.defaultValue) || 1
  form.remark = r.name
}

function resetForm() {
  form.studentId = ''
  form.reasonId = ''
  form.direction = props.defaultDirection || 'in'
  form.amount = null
  form.remark = ''
  currentBalance.value = null
  studentOptions.value = []
}

function onClose(v) {
  emit('update:visible', v ?? false)
  if (!(v ?? false)) {
    resetForm()
    formRef.value?.clearValidate()
  }
}

async function onSubmit() {
  const targetStudentId = props.student?.id || form.studentId
  if (!targetStudentId) {
    ElMessage.error('请先选择学生')
    return
  }
  if (!form.reasonId) {
    ElMessage.warning('请选择积分原因')
    return
  }
  if (willOverdraft.value) {
    ElMessage.error('余额不足, 不能扣分')
    return
  }
  saving.value = true
  try {
    await formRef.value.validate()
    const amount = signedAmount.value
    await pointsAdminApi.adjust(targetStudentId, {
      amount,
      reasonId: form.reasonId,
      customReason: form.remark || undefined,
      remark: form.remark || undefined
    })
    ElMessage.success(`已${form.direction === 'in' ? '加分' : '扣分'} ${Math.abs(amount)}`)
    emit('saved')
    onClose(false)
  } catch (e) {
    // axios 拦截器已弹; validate 失败也走这里
    if (e && e.message) ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.visible, props.student?.id],
  async ([vis, id]) => {
    if (vis && id) {
      resetForm()
      await Promise.all([loadReasons(), loadCurrentBalance()])
    } else if (vis && !id) {
      // 无 student 场景 (顶部按钮打开)
      resetForm()
      await loadReasons()
      // 触发一次空查询, 让 picker 有初始占位
      await searchStudents('')
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.student-name { font-weight: 600; }
.hint { color: #999; font-size: 12px; margin-top: 4px; }
.hint.danger { color: #f56c6c; }
.muted { color: #999; font-size: 12px; }
</style>
