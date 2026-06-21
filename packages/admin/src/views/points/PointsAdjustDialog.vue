<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="onClose"
  >
    <el-form v-if="student" ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="学生">
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
 *   <PointsAdjustDialog v-model:visible="dialog.visible" :student="row" @saved="onSaved" />
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

const form = reactive({
  reasonId: '',
  direction: 'in',
  amount: null,
  remark: ''
})

const rules = {
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
  return Number.isFinite(n) && n >= 1 && Number.isInteger(n) && form.direction
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
  if (!props.student) return '调整积分'
  const action = form.direction === 'in' ? '加分' : '扣分'
  return `${action}: ${props.student.name || ''}`
})

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

async function loadCurrentBalance() {
  if (!props.student || !props.student.id) return
  try {
    const r = await pointsAdminApi.getAccount(props.student.id)
    currentBalance.value = r.data.account?.balance ?? 0
  } catch (e) {
    currentBalance.value = 0
  }
}

function onReasonChange(reasonId) {
  if (!reasonId) {
    // 清空原因: 不重置 direction/amount, 让用户继续手动输入
    return
  }
  const r = reasons.value.find((x) => x.id === reasonId)
  if (!r) return
  // 锁定方向 + 预填金额
  form.direction = r.direction === 'out' ? 'out' : 'in'
  form.amount = Math.abs(r.defaultValue) || 1
  form.remark = r.name
}

function resetForm() {
  form.reasonId = ''
  form.direction = props.defaultDirection || 'in'
  form.amount = null
  form.remark = ''
  currentBalance.value = null
}

function onClose(v) {
  emit('update:visible', v ?? false)
  if (!(v ?? false)) {
    resetForm()
    formRef.value?.clearValidate()
  }
}

async function onSubmit() {
  if (!props.student || !props.student.id) {
    ElMessage.error('缺少学员信息')
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
    await pointsAdminApi.adjust(props.student.id, {
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
