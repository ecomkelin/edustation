<template>
  <div class="login-page">
    <el-card class="login-card">
      <h2 class="title">🎓 EduStation 登录</h2>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="0" @keyup.enter="submit">
        <el-form-item prop="mobile">
          <el-input v-model="form.mobile" placeholder="手机号" size="large" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" show-password />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" style="width: 100%" @click="submit">
          登录
        </el-button>
      </el-form>
      <p class="hint">默认密码 Admin@123，详见 README</p>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref()
const loading = ref(false)
const form = reactive({ mobile: '', password: '' })
const rules = {
  mobile: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  loading.value = true
  try {
    await auth.login({ mobile: form.mobile, password: form.password })
    ElMessage.success('登录成功')
    const redirect = route.query.redirect || '/dashboard'
    router.replace(redirect)
  } catch (e) {
    // 错误已由 http 拦截器统一弹窗
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-card {
  width: 380px;
  padding: 24px 8px;
}
.title {
  text-align: center;
  margin: 0 0 24px 0;
  color: #303133;
}
.hint {
  text-align: center;
  color: #909399;
  font-size: 12px;
  margin-top: 16px;
}
</style>
