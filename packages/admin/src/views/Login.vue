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
        <el-form-item class="agree">
          <el-checkbox v-model="form.agreed">
            我已阅读并同意
            <el-link type="primary" :underline="false" @click="openAgreement('user-agreement')">《用户协议》</el-link>
            和
            <el-link type="primary" :underline="false" @click="openAgreement('privacy-policy')">《隐私政策》</el-link>
          </el-checkbox>
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" style="width: 100%" @click="submit">
          登录
        </el-button>
      </el-form>
      <p class="hint">默认密码 Admin@123，详见 README</p>
    </el-card>

    <div class="login-footer">{{ footer }}</div>

    <AgreementPreviewDialog v-model="previewVisible" :agreement-key="previewKey" />
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useSiteConfigStore } from '@/stores/siteConfig'
import AgreementPreviewDialog from '@/views/legal/AgreementPreviewDialog.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const siteConfig = useSiteConfigStore()

const formRef = ref()
const loading = ref(false)
const form = reactive({ mobile: '', password: '', agreed: false })
const rules = {
  mobile: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

// 登录页底部备案 + 版权 (走 siteConfig store; 未加载时降级)
const footer = computed(() => siteConfig.copyrightLine || `© ${new Date().getFullYear()} EduStation`)

// 协议预览 dialog
const previewVisible = ref(false)
const previewKey = ref('')
function openAgreement(key) {
  previewKey.value = key
  previewVisible.value = true
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  if (!form.agreed) {
    ElMessage.warning('请先勾选并阅读协议')
    return
  }
  loading.value = true
  try {
    await auth.login({ mobile: form.mobile, password: form.password })
    ElMessage.success('登录成功')
    // 注意: router guard 会进一步处理 needPasswordChange / hasPendingConsents 拦截,
    // 这里直接跳目标路径即可, 守卫会接力拦到改密页 / 接受页
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
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 24px;
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
.agree { margin-bottom: 0; }
.agree :deep(.el-checkbox__label) {
  white-space: normal;
  line-height: 1.6;
  color: #606266;
  font-size: 13px;
}
.hint {
  text-align: center;
  color: #909399;
  font-size: 12px;
  margin-top: 16px;
}
.login-footer {
  margin-top: 24px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  text-align: center;
}
</style>
