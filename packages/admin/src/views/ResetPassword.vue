<template>
  <div class="reset-password-page">
    <el-card class="reset-card">
      <template #header>
        <div class="card-header">
          <el-icon><Key /></el-icon>
          <span>修改密码</span>
        </div>
      </template>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        label-position="top"
        @submit.prevent="submit"
      >
        <el-alert
          v-if="isInitial"
          type="warning"
          :closable="false"
          title="首次登录, 请修改密码后再使用系统"
          description="您当前的初始密码为手机号后 6 位, 为了账号安全请立即修改。"
          show-icon
          class="mb"
        />
        <el-form-item label="原密码" prop="oldPassword">
          <el-input
            v-model="form.oldPassword"
            type="password"
            show-password
            placeholder="请输入原密码"
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            show-password
            placeholder="6-32 位, 建议字母+数字组合"
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            placeholder="再次输入新密码"
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="submitting"
            native-type="submit"
            style="width: 100%"
            @click="submit"
          >
            确认修改
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Key } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import http from '@/api/http'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const isInitial = computed(() => route.query.initial === '1')
const formRef = ref(null)
const submitting = ref(false)
const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const rules = {
  oldPassword: [
    { required: true, message: '请输入原密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '新密码 6-32 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_, value, cb) => {
        if (value !== form.newPassword) return cb(new Error('两次输入的密码不一致'))
        cb()
      },
      trigger: 'blur'
    }
  ]
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  submitting.value = true
  try {
    await http.post('/auth/change-password', {
      oldPassword: form.oldPassword,
      newPassword: form.newPassword
    })
    // 清掉首登强改标志
    auth.clearRequirePasswordChange()
    ElMessage.success('密码已修改')
    const redirect = route.query.redirect || '/dashboard'
    router.replace(redirect)
  } catch (e) {
    // http 拦截器已弹错误, 这里不重复弹
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.reset-password-page {
  min-height: 100vh;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.reset-card {
  width: 100%;
  max-width: 460px;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.mb {
  margin-bottom: 16px;
}
</style>
