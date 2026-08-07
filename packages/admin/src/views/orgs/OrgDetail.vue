<!--
  OrgDetail.vue (2026-08-07 新增)
  机构详情页 —— 原 Orgs.vue 里的「详情」弹窗改成独立页面
  - 数据源: R-0901 GET /api/v1/orgs/:id
  - 路由: /orgs/:id (meta.platform，仅平台超管)
  - 只读展示 + 卡片头三个动作: 编辑 / 推广信息 / 启用停用
-->
<template>
  <div class="page" v-loading="loading">
    <el-page-header :icon="ArrowLeft" content="返回机构列表" @back="onBack" class="page-header">
      <template #content>
        <span class="page-header__title">{{ org.name || '机构详情' }}</span>
        <el-tag
          v-if="org._id"
          :type="org.isActive ? 'success' : 'info'"
          size="small"
          style="margin-left: 8px"
        >{{ org.isActive ? '启用' : '停用' }}</el-tag>
      </template>
    </el-page-header>

    <div v-if="!loading && !org._id" class="empty-wrap">
      <el-empty description="机构不存在或已被删除" />
    </div>

    <template v-else-if="org._id">
      <el-card class="block" shadow="never">
        <template #header>
          <div class="card-head">
            <b>基本信息</b>
            <div>
              <el-button size="small" type="primary" :icon="Edit" @click="editDialog = true">编辑</el-button>
              <el-button size="small" type="primary" plain @click="promotionDrawer = true">推广信息</el-button>
              <el-button
                v-if="org.isActive"
                size="small"
                type="warning"
                @click="askToggle(false)"
              >停用</el-button>
              <el-button
                v-else
                size="small"
                type="success"
                @click="askToggle(true)"
              >启用</el-button>
            </div>
          </div>
        </template>

        <div class="detail-logo">
          <el-avatar :size="64" :src="org.logo || ''" shape="square">
            <el-icon :size="28"><Picture /></el-icon>
          </el-avatar>
        </div>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="内部编码">{{ org.unicode }}</el-descriptions-item>
          <el-descriptions-item label="社会信用代码">{{ org.socialCreditCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="简称">{{ org.nameAbbreviation }}</el-descriptions-item>
          <el-descriptions-item label="法人代表">{{ org.legalPerson || '-' }}</el-descriptions-item>
          <el-descriptions-item label="办学许可证号" :span="2">{{ org.licenseNumber || '-' }}</el-descriptions-item>
          <el-descriptions-item label="全称" :span="2">{{ org.name }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ orgTypeLabel(org.type) }}</el-descriptions-item>
          <el-descriptions-item label="地区">{{ org.region ? org.region.name : '-' }}</el-descriptions-item>
          <el-descriptions-item label="负责人">
            {{ org.principal ? (org.principal.realName || org.principal.mobile) : '未指定' }}
          </el-descriptions-item>
          <el-descriptions-item label="启用">
            <el-tag :type="org.isActive ? 'success' : 'info'">{{ org.isActive ? '是' : '否' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="联系人">{{ org.contactPerson || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系方式">{{ org.contactPhone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="地址" :span="2">{{ org.address || '-' }}</el-descriptions-item>
          <el-descriptions-item label="开设时间">
            {{ org.establishedDate ? String(org.establishedDate).slice(0, 10) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ fmtTime(org.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="名师团队展示" :span="2">
            <el-tag :type="org.showTeacherTeam ? 'success' : 'info'" size="small">
              {{ org.showTeacherTeam ? '对外展示' : '隐藏' }}
            </el-tag>
            <span class="form-tip">C 端机构主页是否展示「名师团队」板块</span>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>
    </template>

    <!-- 编辑 -->
    <OrgFormDialog v-model="editDialog" :org="org._id ? org : null" @saved="load" />

    <!-- 推广信息（右侧抽屉） -->
    <OrgPromotionDrawer
      v-model="promotionDrawer"
      :org-id="org._id ? String(org._id) : ''"
      :org-name="org.name || ''"
    />

    <!-- 启用 / 停用 二次确认 -->
    <PasswordConfirmDialog
      v-model="pwdDialog"
      :title="pwdTitle"
      :message="pwdMessage"
      @confirm="onPwdConfirm"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Edit, Picture } from '@element-plus/icons-vue'
import { orgApi } from '@/api/org'
import { ORG_TYPE_LABELS } from '@shared/enums.mjs'
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog.vue'
import OrgFormDialog from './OrgFormDialog.vue'
import OrgPromotionDrawer from './OrgPromotionDrawer.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const org = ref({})

const editDialog = ref(false)
const promotionDrawer = ref(false)

const pwdDialog = ref(false)
const pwdTitle = ref('')
const pwdMessage = ref('')
const pwdNext = ref(false)

function orgTypeLabel(v) {
  return v ? (ORG_TYPE_LABELS[v] || v) : '-'
}

function fmtTime(t) {
  if (!t) return '-'
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load() {
  const id = route.params.id
  if (!id) return
  loading.value = true
  try {
    const r = await orgApi.detail(id)
    org.value = r.data || {}
  } catch (_) {
    // 404 / 非法 id：http.js 已 toast，这里保持空对象走 el-empty 兜底
    org.value = {}
  } finally {
    loading.value = false
  }
}

function onBack() {
  router.push('/orgs')
}

function askToggle(next) {
  pwdNext.value = next
  pwdTitle.value = next ? '启用机构' : '停用机构'
  pwdMessage.value = next
    ? `确认启用「${org.value.name}」？该操作不可撤销。\n请输入您的登录密码以继续：`
    : `确认停用「${org.value.name}」？停用后该机构相关业务将不可用。\n请输入您的登录密码以继续：`
  pwdDialog.value = true
}

async function onPwdConfirm(password) {
  try {
    await orgApi.toggleActive(org.value._id, password)
    ElMessage.success(pwdNext.value ? '已启用' : '已停用')
    pwdDialog.value = false
    load()
  } catch (_) {
    // 错误已由 http.js 弹窗；保持对话框打开以便用户重试
  }
}

watch(() => route.params.id, load, { immediate: true })
</script>

<style scoped>
.page {
  max-width: 100%;
}
.page-header {
  margin-bottom: 16px;
}
.page-header__title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
.block {
  margin-bottom: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.detail-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.empty-wrap {
  margin-top: 40px;
}
</style>
