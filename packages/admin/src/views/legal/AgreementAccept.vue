<template>
  <div class="accept-page">
    <el-card class="accept-card">
      <template #header>
        <div class="card-header">
          <el-icon><Document /></el-icon>
          <span>请阅读并同意以下协议</span>
        </div>
      </template>

      <el-alert
        type="warning"
        :closable="false"
        title="协议有更新,需要您重新确认"
        description="为保障您的合法权益,请仔细阅读以下协议条款。勾选「我已阅读并同意」后即可继续使用系统。"
        show-icon
        class="mb"
      />

      <div v-if="!auth.hasPendingConsents" class="muted center">
        <el-icon size="48"><CircleCheck /></el-icon>
        <p>没有需要重新同意的协议。</p>
        <el-button type="primary" @click="goRedirect">回到首页</el-button>
      </div>

      <template v-else>
        <el-collapse v-model="opened" class="docs">
          <el-collapse-item v-for="doc in auth.pendingConsents" :key="doc.key" :name="doc.key">
            <template #title>
              <div class="title-line">
                <span class="doc-title">{{ doc.title }}</span>
                <el-tag size="small" type="info" class="ml">v{{ doc.version }}</el-tag>
                <el-tag size="small" :type="doc.type === 'platform' ? '' : 'success'" class="ml">
                  {{ doc.type === 'platform' ? '平台协议' : '本机构协议' }}
                </el-tag>
              </div>
            </template>
            <div v-if="doc.summary" class="summary">{{ doc.summary }}</div>
            <MarkdownView :html="doc.html" />
          </el-collapse-item>
        </el-collapse>

        <div class="agree-bar">
          <el-checkbox v-model="agreed">
            我已阅读并同意以上 <strong>{{ auth.pendingConsents.length }}</strong> 份协议的全部内容
          </el-checkbox>
          <el-button
            type="primary"
            :disabled="!agreed"
            :loading="submitting"
            @click="submit"
          >同意并继续</el-button>
        </div>

        <div class="cancel-bar">
          <el-button link @click="onLogout">不同意,退出登录</el-button>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, CircleCheck } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { legalApi } from '@/api/legal'
import MarkdownView from '@/components/MarkdownView.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const opened = ref([])
const agreed = ref(false)
const submitting = ref(false)

// 默认全部展开,鼓励用户实际滚动阅读
onMounted(() => {
  opened.value = (auth.pendingConsents || []).map((d) => d.key)
})

async function submit() {
  if (!agreed.value) return
  submitting.value = true
  try {
    const consents = auth.pendingConsents.map((d) => ({
      key: d.key,
      type: d.type,
      version: d.version,
      // 机构级 consent 必须带 org;此时 currentOrgId 已确定
      org: d.type === 'org' ? auth.currentOrgId : undefined
    }))
    await legalApi.recordConsent({ consents })
    auth.clearPendingConsents()
    ElMessage.success('已记录您的同意,感谢您的阅读')
    goRedirect()
  } finally {
    submitting.value = false
  }
}

function goRedirect() {
  const redirect = route.query.redirect || '/dashboard'
  router.replace(redirect)
}

async function onLogout() {
  await auth.logout()
  router.replace('/login')
}
</script>

<style scoped>
.accept-page {
  min-height: 100vh;
  background: #f5f7fa;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px;
}
.accept-card {
  width: 100%;
  max-width: 900px;
}
.card-header { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.mb { margin-bottom: 16px; }
.muted { color: #909399; }
.center { text-align: center; padding: 40px 0; }
.docs { margin-bottom: 24px; }
.title-line { display: flex; align-items: center; gap: 8px; }
.doc-title { font-size: 15px; font-weight: 500; color: #303133; }
.ml { margin-left: 8px; }
.summary {
  margin: 8px 0 12px;
  padding: 8px 12px;
  background: #fafafa;
  border-left: 3px solid #409EFF;
  color: #606266;
  font-size: 13px;
}
.agree-bar {
  margin-top: 16px;
  padding: 16px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.cancel-bar {
  margin-top: 12px;
  text-align: center;
}
</style>
