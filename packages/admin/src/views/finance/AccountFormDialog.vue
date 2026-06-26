<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑账本' : '新建账本'"
    width="520px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" label-position="right">
      <el-form-item label="账本名" prop="name">
        <el-input v-model="form.name" placeholder="如: 现金账本 / 招商卡-王校长" maxlength="50" show-word-limit />
      </el-form-item>
      <el-form-item label="账本类型" prop="type">
        <el-select v-model="form.type" :disabled="isEdit" placeholder="选择账本类型" style="width: 100%">
          <el-option
            v-for="t in accountTypes"
            :key="t.value"
            :label="t.label"
            :value="t.value"
          />
        </el-select>
        <div v-if="isEdit" class="form-hint">账本类型不可修改（已锁定收款渠道）</div>
      </el-form-item>

      <!-- bank 子字段 -->
      <template v-if="form.type === 'bank'">
        <el-form-item label="开户行" prop="bankName">
          <el-input v-model="form.bankName" placeholder="如: 招商银行" maxlength="50" />
        </el-form-item>
        <el-form-item label="户名" prop="accountHolder">
          <el-input v-model="form.accountHolder" placeholder="如: 王校长 / 机构全称" maxlength="50" />
        </el-form-item>
        <el-form-item label="账号末四位" prop="accountNumberLast4">
          <el-input v-model="form.accountNumberLast4" placeholder="4 位数字（脱敏）" maxlength="4" />
        </el-form-item>
        <el-form-item label="支行" prop="branch">
          <el-input v-model="form.branch" placeholder="可选" maxlength="50" />
        </el-form-item>
      </template>

      <template v-if="form.type === 'wechat'">
        <el-form-item label="微信账号" prop="wechatId">
          <el-input v-model="form.wechatId" placeholder="微信号 / 昵称" maxlength="50" />
        </el-form-item>
      </template>

      <template v-if="form.type === 'alipay'">
        <el-form-item label="支付宝账号" prop="alipayId">
          <el-input v-model="form.alipayId" placeholder="支付宝账号 / 邮箱" maxlength="80" />
        </el-form-item>
      </template>

      <template v-if="form.type === 'cash'">
        <el-form-item label="物理位置" prop="location">
          <el-input v-model="form.location" placeholder="如: 前台保险柜 / 抽屉" maxlength="100" />
        </el-form-item>
      </template>

      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" maxlength="500" show-word-limit />
      </el-form-item>
      <el-form-item v-if="isEdit" label="启用" prop="isActive">
        <el-switch v-model="form.isActive" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="saving" @click="submit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { financeAccountApi } from '@/api/finance/account'
import { FINANCE_ACCOUNT_TYPE_LABEL } from '@/utils/constants'

const props = defineProps({
  visible: { type: Boolean, default: false },
  account: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'saved'])

const visible = ref(props.visible)
watch(() => props.visible, (v) => { visible.value = v })
watch(visible, (v) => emit('update:visible', v))

const formRef = ref(null)
const saving = ref(false)
const isEdit = computed(() => !!props.account && !!props.account._id)

const accountTypes = Object.keys(FINANCE_ACCOUNT_TYPE_LABEL).map((k) => ({ value: k, label: FINANCE_ACCOUNT_TYPE_LABEL[k] }))

const form = reactive({
  name: '',
  type: 'cash',
  bankName: '',
  accountHolder: '',
  accountNumberLast4: '',
  branch: '',
  wechatId: '',
  alipayId: '',
  location: '',
  remark: '',
  isActive: true
})

// 按 type 动态校验
const rules = computed(() => {
  const r = {
    name: [{ required: true, message: '账本名必填', trigger: 'blur' }],
    type: [{ required: true, message: '请选择账本类型', trigger: 'change' }]
  }
  if (form.type === 'bank') {
    r.bankName = [{ required: true, message: '开户行必填', trigger: 'blur' }]
    r.accountHolder = [{ required: true, message: '户名必填', trigger: 'blur' }]
    r.accountNumberLast4 = [
      { required: true, message: '账号末四位必填', trigger: 'blur' },
      { pattern: /^\d{4}$/, message: '必须是 4 位数字', trigger: 'blur' }
    ]
  }
  if (form.type === 'wechat') {
    r.wechatId = [{ required: true, message: '微信账号必填', trigger: 'blur' }]
  }
  if (form.type === 'alipay') {
    r.alipayId = [{ required: true, message: '支付宝账号必填', trigger: 'blur' }]
  }
  return r
})

watch(() => props.account, (a) => {
  if (a) {
    Object.assign(form, {
      name: a.name || '',
      type: a.type || 'cash',
      bankName: a.bankName || '',
      accountHolder: a.accountHolder || '',
      accountNumberLast4: a.accountNumberLast4 || '',
      branch: a.branch || '',
      wechatId: a.wechatId || '',
      alipayId: a.alipayId || '',
      location: a.location || '',
      remark: a.remark || '',
      isActive: a.isActive !== false
    })
  } else {
    resetForm()
  }
}, { immediate: true })

function resetForm() {
  Object.assign(form, {
    name: '',
    type: 'cash',
    bankName: '',
    accountHolder: '',
    accountNumberLast4: '',
    branch: '',
    wechatId: '',
    alipayId: '',
    location: '',
    remark: '',
    isActive: true
  })
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    ElMessage.warning('请检查表单')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name,
      type: form.type,
      bankName: form.bankName || undefined,
      accountHolder: form.accountHolder || undefined,
      accountNumberLast4: form.accountNumberLast4 || undefined,
      branch: form.branch || undefined,
      wechatId: form.wechatId || undefined,
      alipayId: form.alipayId || undefined,
      location: form.location || undefined,
      remark: form.remark || undefined
    }
    if (isEdit.value) {
      payload.isActive = form.isActive
      await financeAccountApi.update(props.account._id, payload)
      ElMessage.success('已更新')
    } else {
      await financeAccountApi.create(payload)
      ElMessage.success('已创建')
    }
    visible.value = false
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.form-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 4px;
}
</style>
