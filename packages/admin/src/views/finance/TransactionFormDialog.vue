<template>
  <el-dialog
    v-model="visible"
    title="录入流水"
    width="520px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" label-position="right">
      <el-form-item label="账本" prop="account">
        <el-select v-model="form.account" placeholder="选择账本" style="width: 100%" filterable>
          <el-option
            v-for="a in accounts"
            :key="a._id"
            :label="`${a.name} (${ACCOUNT_TYPE_LABEL[a.type] || a.type})${a.isPrimary ? ' · 默认' : ''}`"
            :value="a._id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="类型" prop="type">
        <el-radio-group v-model="form.type">
          <el-radio-button value="income">收入</el-radio-button>
          <el-radio-button value="expense">支出</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="金额" prop="amount">
        <el-input-number
          v-model="form.amount"
          :min="0.01"
          :precision="2"
          :step="100"
          style="width: 100%"
          placeholder="0.00"
        />
      </el-form-item>
      <el-form-item label="原因" prop="reason">
        <el-select
          v-model="form.reason"
          placeholder="选择收支原因"
          style="width: 100%"
          filterable
          @change="onReasonChange"
        >
          <el-option
            v-for="r in filteredReasons"
            :key="r._id"
            :label="r.name"
            :value="r._id"
          />
        </el-select>
        <div class="form-hint">
          当前类型 {{ form.type === 'income' ? '收入' : '支出' }} 仅显示 {{ form.type === 'income' ? 'in' : 'out' }} 类原因
        </div>
      </el-form-item>
      <el-form-item label="发生时间" prop="occurredAt">
        <el-date-picker
          v-model="form.occurredAt"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
          style="width: 100%"
          placeholder="默认当前时间"
        />
      </el-form-item>
      <!-- 2026-06-25: 关联员工 picker (人工/工资 场景); 跟关联学员 二选一 -->
      <el-form-item v-if="needsRelatedStaff" label="关联员工" prop="relatedStaff">
        <el-select
          v-model="form.relatedStaff"
          placeholder="选择员工 (本机构老师/教务/财务等岗位)"
          style="width: 100%"
          filterable
          :loading="staffLoading"
        >
          <el-option
            v-for="u in staffOptions"
            :key="u._id"
            :label="`${u.realName || u.mobile}${u.mobile ? ' · ' + u.mobile : ''}`"
            :value="u._id"
          />
        </el-select>
        <div class="form-hint">人工类支出 (如工资/提成) 必须关联员工; 与关联学员互斥</div>
      </el-form-item>
      <el-form-item v-if="needsRelatedStudent" label="关联学员" prop="relatedStudent">
        <el-input v-model="form.relatedStudent" placeholder="可选：学员 ID（自由文本，预留）" />
        <div class="form-hint">学费类原因 (学员报名/退费) 建议关联学员</div>
      </el-form-item>
      <el-form-item v-if="needsRelatedOrder" label="关联订单" prop="relatedOrder">
        <el-input v-model="form.relatedOrder" placeholder="可选：订单 ID（自由文本，预留）" />
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选：财务凭证 / 家长沟通记录" maxlength="500" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { financeAccountApi } from '@/api/finance/account'
import { financeReasonApi } from '@/api/finance/reason'
import { financeTransactionApi } from '@/api/finance/transaction'
import { userApi } from '@/api/user'
import { FINANCE_ACCOUNT_TYPE_LABEL } from '@/utils/constants'

const ACCOUNT_TYPE_LABEL = FINANCE_ACCOUNT_TYPE_LABEL

const props = defineProps({
  visible: { type: Boolean, default: false },
  defaultAccountId: { type: String, default: '' }
})
const emit = defineEmits(['update:visible', 'saved'])

const visible = ref(props.visible)
watch(() => props.visible, (v) => { visible.value = v })
watch(visible, (v) => emit('update:visible', v))

const formRef = ref(null)
const saving = ref(false)
const accounts = ref([])
const reasons = ref([])
const staffOptions = ref([])
const staffLoading = ref(false)

const form = reactive({
  account: '',
  type: 'income',
  amount: 0,
  reason: '',
  occurredAt: null,
  relatedStudent: '',
  relatedStaff: '',
  relatedOrder: '',
  remark: ''
})

const rules = {
  account: [{ required: true, message: '账本必填（用户诉求）', trigger: 'change' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  amount: [
    { required: true, message: '金额必填', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '金额必须 > 0', trigger: 'blur' }
  ],
  reason: [{ required: true, message: '原因必填', trigger: 'change' }],
  relatedStaff: [{
    required: true,
    validator: (rule, value, cb) => {
      if (needsRelatedStaff.value && !value) cb(new Error('人工类原因必须关联员工'))
      else cb()
    },
    trigger: 'change'
  }]
}

const filteredReasons = computed(() => {
  const want = form.type === 'income' ? 'in' : 'out'
  return reasons.value.filter((r) => r.meta && r.meta.direction === want)
})

// 选中原因后, 根据 meta.category 决定联动字段
const selectedReason = computed(() => reasons.value.find((r) => r._id === form.reason) || null)
const reasonCategory = computed(() => (selectedReason.value && selectedReason.value.meta && selectedReason.value.meta.category) || '')

// 联动字段显隐 (2026-06-25): 根据 reason.category 切换
//  - 人工 → 显示 关联员工 (必填)
//  - 学费 → 显示 关联学员 (可选, free text 预留)
//  - 办公/场地/其他 → 不显示
const needsRelatedStaff = computed(() => reasonCategory.value === '人工')
const needsRelatedStudent = computed(() => reasonCategory.value === '学费')
const needsRelatedOrder = computed(() => reasonCategory.value === '学费')

function onReasonChange() {
  // 切换原因后清空联动字段 (互斥)
  form.relatedStaff = ''
  form.relatedStudent = ''
  form.relatedOrder = ''
  if (needsRelatedStaff.value && staffOptions.value.length === 0) {
    loadStaff()
  }
}

// 切换类型时清空原因 + 联动字段 (因为 filteredReasons 会变化, 旧 reason 可能不在新列表里)
watch(() => form.type, () => {
  form.reason = ''
  form.relatedStaff = ''
  form.relatedStudent = ''
  form.relatedOrder = ''
})

async function loadAccounts() {
  try {
    const r = await financeAccountApi.list({ page: 1, pageSize: 100, isActive: true })
    accounts.value = r.data && r.data.items ? r.data.items : []
    if (!form.account) {
      form.account = props.defaultAccountId || (accounts.value.find((a) => a.isPrimary) || accounts.value[0] || {})._id || ''
    }
  } catch (e) { /* 静默 */ }
}

async function loadReasons() {
  try {
    const r = await financeReasonApi.list({ isActive: true })
    reasons.value = r.data || []
  } catch (e) { /* 静默 */ }
}

// 加载本机构员工 (roleScope=staff: clientLevel>0 的岗位 + 平台超管)
async function loadStaff() {
  staffLoading.value = true
  try {
    const r = await userApi.list({ page: 1, pageSize: 200, roleScope: 'staff' })
    staffOptions.value = (r.data && r.data.items) || []
  } catch (e) { /* 静默 */ }
  finally { staffLoading.value = false }
}

watch(visible, (v) => {
  if (v) {
    loadAccounts()
    loadReasons()
  }
})

function resetForm() {
  Object.assign(form, {
    account: '',
    type: 'income',
    amount: 0,
    reason: '',
    occurredAt: null,
    relatedStudent: '',
    relatedStaff: '',
    relatedOrder: '',
    remark: ''
  })
}

async function submit() {
  if (!formRef.value) return
  try { await formRef.value.validate() } catch (_) { ElMessage.warning('请检查表单'); return }
  saving.value = true
  try {
    const payload = {
      account: form.account,
      type: form.type,
      amount: Number(form.amount),
      reason: form.reason,
      occurredAt: form.occurredAt || undefined,
      relatedStaff: form.relatedStaff || undefined,
      relatedStudent: form.relatedStudent || undefined,
      relatedOrder: form.relatedOrder || undefined,
      remark: form.remark || undefined
    }
    await financeTransactionApi.create(payload)
    ElMessage.success('已记录')
    visible.value = false
    emit('saved')
  } finally {
    saving.value = false
  }
}

onMounted(() => { loadAccounts(); loadReasons() })
</script>

<style scoped>
.form-hint { font-size: 12px; color: #909399; line-height: 1.4; margin-top: 4px; }
</style>
