<!--
  OrgPromotion.vue —— 机构推广信息编辑页 (2026-06)

  范围:
    - 仅展示/编辑当前激活机构的推广信息 (orgId = auth.currentOrgId)
    - 平台超管也能访问, 看到当前激活机构的推广
    - 基础信息 (全称/信用代码/负责人) 不在本页, 走平台超管的 /orgs 页

  2026-08-07: 表单主体抽到 OrgPromotionForm.vue, 本页只剩「壳 + footer」。
  平台超管在 /orgs 列表 / 详情页点「推广信息」走的是同一个表单的抽屉版
  (OrgPromotionDrawer.vue), 两处行为一致。
-->
<template>
  <div class="page">
    <h2>机构推广信息</h2>
    <p class="hint">
      维护本机构对外宣传的内容：简介、教学特色、招生热线、自媒体号、SEO、资质证书图等。
      基础信息（全称、信用代码、负责人等）请平台超管在
      <el-link type="primary" @click="$router.push('/orgs')">机构管理</el-link>
      中维护。
    </p>

    <el-card shadow="never">
      <OrgPromotionForm ref="formRef" :org-id="currentOrgId" />

      <div class="form-footer">
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        <el-button @click="onReset">重置</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import OrgPromotionForm from './OrgPromotionForm.vue'

const auth = useAuthStore()
// 机构切换后 orgId 变 → 由 OrgPromotionForm 自己 watch 重拉，本页不再 watch
const currentOrgId = computed(() => auth.currentOrgId || '')

const formRef = ref()
const saving = ref(false)

async function onSave() {
  if (!formRef.value) return
  saving.value = true
  try {
    await formRef.value.submit()
  } catch (_) {
    // 校验失败由 el-form 标红；请求失败由 http.js 拦截器 toast
  } finally {
    saving.value = false
  }
}

function onReset() {
  formRef.value?.reload()
}
</script>

<style scoped>
.page {
  max-width: 100%;
}
.hint {
  color: #606266;
  font-size: 13px;
  margin: 4px 0 16px;
}
.form-footer {
  margin-top: 16px;
  text-align: right;
  border-top: 1px solid #ebeef5;
  padding-top: 16px;
}
</style>
