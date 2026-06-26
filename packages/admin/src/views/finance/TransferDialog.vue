<template>
  <el-dialog
    v-model="visible"
    title="转账"
    width="520px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" label-position="right">
      <el-form-item label="转出账本" prop="fromAccount">
        <el-select v-model="form.fromAccount" placeholder="选择转出账本" style="width: 100%" filterable>
          <el-option
            v-for="a in accounts"
            :key="`f-${a._id}`"
            :label="`${a.name} (${ACCOUNT_TYPE_LABEL[a.type] || a.type})`"
            :value="a._id"
            :disabled="a._id === form.toAccount"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="转入账本" prop="toAccount">
        <el-select v-model="form.toAccount" placeholder="选择转入账本" style="width: 100%" filterable>
          <el-option
            v-for="a in accounts"
            :key="`t-${a._id}`"
            :label="`${a.name} (${ACCOUNT_TYPE_LABEL[a.type] || a.type})`"
            :value="a._id"
            :disabled="a._id === form.fromAccount"
          />
        </el-select>
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
        <el-select v-model="form.reason" placeholder="选择原因（建议：内部转账）" style="width: 100%" filterable>
          <el-option
            v-for="r in reasons"
            :key="r._id"
            :label="r.name"
            :value="r._id"
          />
        </el-select>
        <div class="form-hint">转账不校验 direction，建议选"内部转账"类</div>
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
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="如: 微信余额提现到现金账本" maxlength="500" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="saving" @click="submit">确认转账</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { financeAccountApi } from '@/api/finance/account'
import { financeReasonApi } from '@/api/finance/reason'
import { financeTransactionApi } from '@/api/finance/transaction'
import { FINANCE_ACCOUNT_TYPE_LABEL } from '@/utils/constants'

const ACCOUNT_TYPE_LABEL = FINANCE_ACCOUNT_TYPE_LABEL

const props = defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['update:visible', 'saved'])

const visible = ref(props.visible)
watch(() => props.visible, (v) => { visible.value = v })
watch(visible, (v) => emit('update:visible', v))

const formRef = ref(null)
const saving = ref(false)
const accounts = ref([])
const reasons = ref([])

const form = reactive({
  fromAccount: '',
  toAccount: '',
  amount: 0,
  reason: '',
  occurredAt: null,
  remark: ''
})

const rules = {
  fromAccount: [{ required: true, message: '转出账本必填', trigger: 'change' }],
  toAccount: [{ required: true, message: '转入账本必填', trigger: 'change' }],
  amount: [{ required: true, type: 'number', min: 0.01, message: '金额必须 > 0', trigger: 'blur' }],
  reason: [{ required: true, message: '原因必填', trigger: 'change' }]
}

async function loadAccounts() {
  try {
    const r = await financeAccountApi.list({ page: 1, pageSize: 100, isActive: true })
    accounts.value = r.data && r.data.items ? r.data.items : []
  } catch (e) { /* 静默 */ }
}

async function loadReasons() {
  try {
    const r = await financeReasonApi.list({ isActive: true })
    reasons.value = r.data || []
  } catch (e) { /* 静默 */ }
}

watch(visible, (v) => {
  if (v) { loadAccounts(); loadReasons() }
})

function resetForm() {
  Object.assign(form, {
    fromAccount: '',
    toAccount: '',
    amount: 0,
    reason: '',
    occurredAt: null,
    remark: ''
  })
}

async function submit() {
  if (!formRef.value) return
  try { await formRef.value.validate() } catch (_) { ElMessage.warning('请检查表单'); return }
  if (form.fromAccount === form.toAccount) {
    ElMessage.warning('转出与转入账本不能相同')
    return
  }
  saving.value = true
  try {
    await financeTransactionApi.transfer({
      fromAccount: form.fromAccount,
      toAccount: form.toAccount,
      amount: Number(form.amount),
      reason: form.reason,
      occurredAt: form.occurredAt || undefined,
      remark: form.remark || undefined
    })
    ElMessage.success('转账成功')
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
