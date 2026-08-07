<!--
  OrgPromotionDrawer.vue (2026-08-07)
  机构推广信息 —— 右侧滑入抽屉。列表页 (Orgs.vue) 与详情页 (OrgDetail.vue) 共用。

  为什么要在打开期间切 org 上下文:
    R-0930/R-0931 (GET/PUT /orgs/:id/promotion) 的 org 取自**路径参数**，跟 x-org-id 无关；
    但表单里的图片走 storage，而 storage 的「文件列表」「上传」都按 x-org-id 分租户
    (storage.service.js)。若在「当前机构=A」时编辑机构 B 的推广，选到/传到的图会挂在 A 名下，
    B 自己的管理员之后就读不到缩略图 (storage.detail 对非超管拒绝跨机构读)。
    所以打开抽屉时切到目标机构，关闭时切回去 —— 与改造前 openPromotion 的 auth.setOrg 等价。
    auth.setOrg 只改 store + 落 localStorage，不发请求不刷页，来回切是安全的。
-->
<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    size="760px"
    :with-header="false"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="promo-drawer">
      <header class="promo-header">
        <div class="promo-header__main">
          <h3>推广信息</h3>
          <span class="promo-header__org">
            正在编辑：{{ orgName || '当前机构' }}
          </span>
        </div>
        <el-button link @click="close">关闭</el-button>
      </header>

      <section class="promo-body">
        <p class="hint">
          维护该机构对外宣传的内容：简介、教学特色、招生热线、自媒体号、SEO、资质证书图等。
          基础信息（全称、信用代码、负责人等）在机构详情页维护。
        </p>
        <OrgPromotionForm ref="formRef" :org-id="orgId" @saved="emit('saved')" />
      </section>

      <footer class="promo-footer">
        <el-button @click="close">取消</el-button>
        <el-button @click="onReset">重置</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </footer>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import OrgPromotionForm from './OrgPromotionForm.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  orgId: { type: String, default: '' },
  orgName: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const auth = useAuthStore()
const formRef = ref()
const saving = ref(false)

// 打开前的全局机构 id，关闭时还原。null = 当前没有暂存（抽屉是关的）
const prevOrgId = ref(null)

function enterOrgContext() {
  if (prevOrgId.value !== null) return
  prevOrgId.value = auth.currentOrgId || ''
  if (props.orgId && props.orgId !== auth.currentOrgId) auth.setOrg(props.orgId)
}

function restoreOrgContext() {
  if (prevOrgId.value === null) return
  const prev = prevOrgId.value
  prevOrgId.value = null
  if (prev !== auth.currentOrgId) auth.setOrg(prev)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) enterOrgContext()
    else restoreOrgContext()
  },
  { immediate: true }
)

// 抽屉开着直接路由跳走时兜底，避免全局机构被永久换成被编辑的那家
onBeforeUnmount(restoreOrgContext)

function close() {
  emit('update:modelValue', false)
}

async function onSave() {
  if (!formRef.value) return
  saving.value = true
  try {
    await formRef.value.submit()
    close()
  } catch (_) {
    // 校验失败由 el-form 标红；请求失败由 http.js 拦截器 toast。抽屉保持打开以便修改
  } finally {
    saving.value = false
  }
}

function onReset() {
  formRef.value?.reload()
}
</script>

<style scoped>
.promo-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.promo-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}
.promo-header h3 {
  margin: 0;
  font-size: 16px;
}
.promo-header__org {
  display: block;
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}
.promo-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 2px 0;
}
.promo-footer {
  padding: 16px 0 0;
  border-top: 1px solid #ebeef5;
  text-align: right;
}
.hint {
  color: #606266;
  font-size: 13px;
  margin: 0 0 16px;
}
</style>
