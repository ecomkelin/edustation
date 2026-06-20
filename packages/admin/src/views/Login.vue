<template>
  <div class="login-page">
    <el-card class="login-card">
      <h2 class="title">🎓 EduStation 登录</h2>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="0" @keyup.enter="submit">
        <el-form-item prop="mobile">
          <el-input v-model="form.mobile" placeholder="手机号" size="large" :disabled="locked" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" show-password :disabled="locked" />
        </el-form-item>
        <el-form-item class="agree">
          <el-checkbox v-model="form.agreed" :disabled="locked">
            我已阅读并同意
            <el-link type="primary" underline="never" @click="openAgreement('user-agreement')">《用户协议》</el-link>
            和
            <el-link type="primary" underline="never" @click="openAgreement('privacy-policy')">《隐私政策》</el-link>
          </el-checkbox>
        </el-form-item>

        <!-- 登录防刷 (2026-06): inline 提示, 比右上角 toast 更显眼 -->
        <div v-if="errorMsg" class="login-error" :class="{ 'is-lock': locked }">
          <el-icon class="icon"><component :is="locked ? Lock : Warning" /></el-icon>
          <span class="text">{{ errorMsg }}</span>
        </div>

        <el-button
          type="primary"
          size="large"
          :loading="loading"
          :disabled="locked"
          style="width: 100%"
          @click="submit"
        >
          {{ locked ? `已锁定 (${countdownText})` : '登录' }}
        </el-button>
      </el-form>
      <p class="hint">默认密码 Admin@123，详见 README</p>
    </el-card>

    <div class="login-footer">{{ footer }}</div>

    <AgreementPreviewDialog v-model="previewVisible" :agreement-key="previewKey" />

    <!-- 登录防刷 (2026-06): 滑块验证 -->
    <SliderCaptcha
      v-model="captchaVisible"
      @success="onCaptchaSuccess"
      @cancel="onCaptchaCancel"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Warning, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useSiteConfigStore } from '@/stores/siteConfig'
import AgreementPreviewDialog from '@/views/legal/AgreementPreviewDialog.vue'
import SliderCaptcha from '@/components/SliderCaptcha.vue'

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

// 登录防刷 (2026-06): inline 错误 + 倒计时禁用
const errorMsg = ref('')
const locked = ref(false)
const lockEndsAt = ref(0) // ms timestamp
let countdownTimer = null
const countdownText = computed(() => {
  const remain = Math.max(0, lockEndsAt.value - Date.now())
  const m = Math.floor(remain / 60_000)
  const s = Math.floor((remain % 60_000) / 1000)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    if (Date.now() >= lockEndsAt.value) {
      clearInterval(countdownTimer)
      countdownTimer = null
      locked.value = false
      errorMsg.value = ''
    }
  }, 1000)
}
function lockFor(sec) {
  locked.value = true
  lockEndsAt.value = Date.now() + sec * 1000
  errorMsg.value = `登录尝试过于频繁, 请 ${Math.ceil(sec / 60)} 分钟后重试`
  startCountdown()
}
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

async function submit() {
  if (locked.value) return // 锁定期间直接拦截, 不发请求
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
  await doLogin()
}

// 登录防刷 (2026-06): 滑块验证 dialog 状态
const captchaVisible = ref(false)
const pendingCaptcha = ref(null) // { resolve, reject } 等滑块结果

function onCaptchaSuccess(pass) {
  captchaVisible.value = false
  if (pendingCaptcha.value) {
    pendingCaptcha.value.resolve(pass)
    pendingCaptcha.value = null
  }
}
function onCaptchaCancel() {
  captchaVisible.value = false
  if (pendingCaptcha.value) {
    pendingCaptcha.value.resolve(null) // 当 null 处理, 不重试
    pendingCaptcha.value = null
  }
}

function openCaptchaAndWait() {
  return new Promise((resolve) => {
    pendingCaptcha.value = { resolve }
    captchaVisible.value = true
  })
}

async function doLogin(captchaPass) {
  loading.value = true
  try {
    await auth.login({
      mobile: form.mobile,
      password: form.password,
      captchaPass
    })
    ElMessage.success('登录成功')
    const redirect = route.query.redirect || '/dashboard'
    router.replace(redirect)
    return true
  } catch (e) {
    // 登录防刷 (2026-06): 把后端的限流信息转成 inline 错误
    //   - 400 + reason=captcha_required → 弹滑块, 拿到 pass 后自动重试
    //   - 429 + retryAfterSec → 锁定 + 倒计时
    //   - 401 + rateLimitRemaining → "密码错误, 还剩 N 次" 提示
    const reason = e?.response?.data?.data?.reason
    if (reason === 'captcha_required') {
      const pass = await openCaptchaAndWait()
      if (pass) {
        // 重试一次, 带上 pass
        return await doLogin(pass)
      }
      // 用户取消滑块: 不再重试
      return false
    }
    if (e && e.retryAfterSec) {
      lockFor(e.retryAfterSec)
    } else if (e && Number.isFinite(e.rateLimitRemaining) && e.rateLimitRemaining >= 0) {
      const base = e.response?.data?.message || '账号或密码错误'
      const remain = e.rateLimitRemaining
      errorMsg.value = remain > 0
        ? `${base}, 还剩 ${remain} 次尝试机会`
        : `${base}, 下次将被锁定`
    }
    // 其他错误交给 http 拦截器的 toast
    return false
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

/* 登录防刷 inline 错误 (2026-06) */
.login-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: -4px 0 12px;
  padding: 8px 12px;
  border-radius: 4px;
  background: #fef0f0;
  color: #f56c6c;
  font-size: 13px;
  line-height: 1.4;
  border: 1px solid #fde2e2;
}
.login-error.is-lock {
  background: #fdf6ec;
  color: #e6a23c;
  border-color: #faecd8;
}
.login-error .icon {
  flex-shrink: 0;
  font-size: 16px;
}
</style>
