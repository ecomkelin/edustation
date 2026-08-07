<!--
  ResetPasswordDialog.vue (2026-08-07 新增)

  重置密码弹窗 —— 从 Users.vue / UnaffiliatedUsers.vue 抽出, 三处共用。

  variant:
    org    —— R-0215 POST /users/:id/reset-password        (权限 user.resetPassword)
    orphan —— R-0209 POST /users/unaffiliated/:id/reset-password (平台超管)
-->
<template>
  <el-dialog
    :model-value="modelValue"
    title="重置密码"
    width="400px"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @open="newPassword = ''"
  >
    <p class="hint">
      将重置账号「{{ user?.realName || user?.mobile || '—' }}」的登录密码
    </p>
    <el-input
      v-model="newPassword"
      placeholder="新密码 (6-64)"
      show-password
      maxlength="64"
      @keyup.enter="submit"
    />
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { userApi } from '@/api/user'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  variant: { type: String, default: 'org' }, // 'org' | 'orphan'
  user: { type: Object, default: null } // { id, realName, mobile }
})
const emit = defineEmits(['update:modelValue', 'done'])

const newPassword = ref('')
const saving = ref(false)

async function submit() {
  if (!props.user?.id) return
  if (!newPassword.value || newPassword.value.length < 6) {
    return ElMessage.warning('新密码至少 6 位')
  }
  saving.value = true
  try {
    if (props.variant === 'orphan') {
      await userApi.resetPasswordUnaffiliated(props.user.id, newPassword.value)
    } else {
      await userApi.resetPassword(props.user.id, { newPassword: newPassword.value })
    }
    ElMessage.success('密码已重置')
    emit('update:modelValue', false)
    emit('done')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.hint {
  margin: 0 0 12px;
  color: #909399;
  font-size: 13px;
}
</style>
