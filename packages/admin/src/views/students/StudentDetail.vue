<!--
  StudentDetail.vue (2026-08-07)

  学生详情页 —— 三个 tab 一站式展示学员全貌:
    概览 (TabOverview):   基本信息 + 监护人 + 学习画像 + 家长沟通画像
    业务 (TabBusiness):   在册开班 + 考勤 + 课包 + 订单 + 作品
    成长 (TabGrowth):     积分流水 + 宠物事件

  数据源:
    R-0408 GET /students/:id/overview      一次性聚合 (档案 + 计数 + 学习画像 + 家长沟通画像)
    R-0409 GET /students/:id/related/:domain  各 tab 懒加载 (5+2 板块)
    既有 R-0406 / R-0401 / R-0403 / R-0410 / R-0411 / R-0404 等用于弹窗写操作

  越权 (学员不属于当前 org) → 后端返 404, http.js 拦截器弹 toast, 前端走 el-empty 兜底。
  Student 不存在「游离」/「跨机构」概念 (天然 org 隔离), 无 UserDetail 那种 scope 区分。

  形态照搬 UserDetail.vue (2026-08-07): el-page-header + 左账号卡 (常驻) + 右 KPI 行 + tabs。
-->
<template>
  <div class="page" v-loading="loading">
    <el-page-header :icon="ArrowLeft" :title="backText" @back="onBack" class="page-header">
      <template #content>
        <span class="page-header__title">{{ profile.name || '学生详情' }}</span>
        <el-tag :type="profile.isActive ? 'success' : 'info'" size="small" class="hdr-tag">
          {{ profile.isActive ? '在读' : '已退学' }}
        </el-tag>
        <el-tag v-if="profile.isBlocked" type="danger" size="small" class="hdr-tag">黑名单</el-tag>
        <el-tag v-if="profile.school" type="info" size="small" class="hdr-tag">
          {{ profile.school.name }}
        </el-tag>
      </template>
    </el-page-header>

    <div v-if="!loading && !profile.id" class="empty-wrap">
      <el-empty description="学生不存在，或不属于当前机构" />
    </div>

    <el-row v-else-if="profile.id" :gutter="16">
      <!-- ─── 左: 账号卡 (常驻) ─── -->
      <el-col :span="6">
        <el-card class="block account" shadow="never">
          <div class="account__hero">
            <SvgAvatar :svg-key="profile.avatarSvgKey" audience="student" :size="72" />
            <div class="account__name">{{ profile.name || '未命名' }}</div>
            <div class="account__sub">
              {{ GENDER_LABEL[profile.gender] || '-' }}
              <span v-if="ageYears !== null"> · {{ ageYears }} 岁</span>
            </div>
            <div v-if="primaryGuardian" class="account__guardian">
              监护人: {{ primaryGuardian.realName || '—' }}
              <a
                v-if="primaryGuardian.mobile"
                :href="`tel:${primaryGuardian.mobile}`"
                style="color: #409eff; margin-left: 6px"
              >
                📞
              </a>
            </div>
          </div>

          <el-divider />

          <div class="account__actions">
            <el-button :icon="Edit" @click="editDialog = true">编辑基础信息</el-button>

            <el-button :icon="Notebook" @click="profileDialog = true">学习画像</el-button>

            <el-tooltip
              :content="parentId ? '' : '该学员未关联家长档案, 无法维护家长画像'"
              placement="top"
            >
              <span style="display: block">
                <el-button
                  :icon="ChatLineRound"
                  :disabled="!parentId"
                  @click="parentProfileDialog = true"
                >家长沟通画像</el-button>
              </span>
            </el-tooltip>

            <el-button
              :type="profile.isActive ? 'warning' : 'success'"
              plain
              @click="onToggleActive"
            >
              {{ profile.isActive ? '停用学员' : '启用学员' }}
            </el-button>

            <el-button
              v-if="auth.isPlatformAdmin"
              :type="profile.isBlocked ? 'success' : 'warning'"
              plain
              @click="onToggleBlock"
            >
              {{ profile.isBlocked ? '解除黑名单' : '加入黑名单' }}
            </el-button>

            <!-- 「误操停用」: 超管+密码+互锁(在册报名/未用完课包)预检 (CLAUDE.md §8.1) -->
            <DestructiveConfirm
              v-if="auth.isPlatformAdmin && profile.isActive"
              :target="`学生 ${profile.name}`"
              warning="中风险"
              :precheck-notes="['无在册报名', '无未用完课包']"
              :precheck="() => studentApi.removableCheck(profile.id).then((r) => r.data)"
              @confirm="(p) => onRemoveConfirm(p)"
            >
              <el-button type="danger" plain>停用</el-button>
            </DestructiveConfirm>
          </div>
        </el-card>
      </el-col>

      <!-- ─── 右: tabs ─── -->
      <el-col :span="18">
        <el-row :gutter="10" class="kpi-row">
          <el-col v-for="k in kpis" :key="k.label" :span="6">
            <KpiCard :label="k.label" :value="k.value" :accent="k.accent" />
          </el-col>
        </el-row>

        <el-tabs v-model="activeTab" class="detail-tabs">
          <el-tab-pane label="概览" name="overview">
            <TabOverview
              :profile="profile"
              :parent-id="parentId"
              :parent-profile="parentProfile"
            />
          </el-tab-pane>
          <el-tab-pane label="业务" name="business">
            <TabBusiness v-if="loadedTabs.has('business')" :student-id="profile.id" />
          </el-tab-pane>
          <el-tab-pane label="成长" name="growth">
            <TabGrowth v-if="loadedTabs.has('growth')" :student-id="profile.id" />
          </el-tab-pane>
        </el-tabs>
      </el-col>
    </el-row>

    <!-- 编辑基础信息 -->
    <StudentFormDialog
      v-model="editDialog"
      :student="formStudent"
      @saved="load"
    />

    <!-- 学习画像 -->
    <StudentProfileDialog
      v-model:visible="profileDialog"
      :student="formStudent"
      @saved="load"
    />

    <!-- 家长沟通画像: parentId 为 null 时按钮已 disabled, 不会到这里 -->
    <ParentProfileDialog
      v-if="parentId"
      v-model:visible="parentProfileDialog"
      :parent="parentDialogTarget"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Edit, Notebook, ChatLineRound } from '@element-plus/icons-vue'

import { studentApi } from '@/api/student'
import { useAuthStore } from '@/stores/auth'
import { handleRemoveError } from '@/utils/removable'

import SvgAvatar from '@/components/Avatar/SvgAvatar.vue'
import KpiCard from '@/components/KpiCard.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import StudentFormDialog from './StudentFormDialog.vue'
import StudentProfileDialog from '@/components/Profile/StudentProfileDialog.vue'
import ParentProfileDialog from '@/components/Profile/ParentProfileDialog.vue'
import TabOverview from './tabs/TabOverview.vue'
import TabBusiness from './tabs/TabBusiness.vue'
import TabGrowth from './tabs/TabGrowth.vue'
import { GENDER_LABEL } from '@/utils/constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const VALID_TABS = ['overview', 'business', 'growth']
const DEFAULT_TAB = 'overview'

const loading = ref(false)
const profile = reactive({})
const counters = ref({})
const parentId = ref(null)
const parentProfile = ref(null)

const editDialog = ref(false)
const profileDialog = ref(false)
const parentProfileDialog = ref(false)

const studentId = computed(() => String(route.params.id || ''))
const primaryGuardian = computed(() => {
  if (!profile.guardians || !profile.guardians.length) return null
  const mainId = profile.guardianUser
  return profile.guardians.find((g) => g.id === mainId) || profile.guardians[0]
})

const formStudent = computed(() => ({
  ...profile,
  // StudentProfileDialog / StudentFormDialog 用 id 字段
  id: profile.id,
  _id: profile.id
}))

const parentDialogTarget = computed(() => ({
  id: parentId.value,
  realName: primaryGuardian.value?.realName || '家长',
  phone: primaryGuardian.value?.mobile || '',
  lifecycle: parentProfile.value?.lifecycle
}))

const ageYears = computed(() => {
  const b = profile && profile.birthday
  if (!b) return null
  const d = new Date(b)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 ? a : null
})

const kpis = computed(() => {
  const c = counters.value || {}
  return [
    { label: '在册开班', value: c.enrollments ?? 0, accent: 'green' },
    {
      label: '有效课包',
      value: c.studentProductsActive ?? 0,
      extra: c.studentProducts ? `共 ${c.studentProducts} 包` : '',
      accent: 'blue'
    },
    {
      label: '考勤',
      value: c.lessonAttendances ?? 0,
      extra: c.lessonAttendancesUpcoming ? `待上 ${c.lessonAttendancesUpcoming}` : '',
      accent: 'default'
    },
    { label: '积分余额', value: c.pointsBalance ?? 0, accent: 'orange' },
    { label: '作品', value: c.works ?? 0, accent: 'green' },
    { label: '订单', value: c.orders ?? 0, accent: 'default' }
  ]
})

const backText = computed(() => '返回学生管理')

/* ─── tab 与 URL 双向同步 + 懒加载 ─── */
const activeTab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : DEFAULT_TAB)
const loadedTabs = ref(new Set([activeTab.value]))

watch(
  activeTab,
  (v) => {
    loadedTabs.value.add(v)
    loadedTabs.value = new Set(loadedTabs.value)
    if (route.query.tab === v) return
    router.replace({ path: route.path, query: { ...route.query, tab: v } })
  },
  { immediate: true }
)

watch(
  () => route.query.tab,
  (v) => {
    const next = VALID_TABS.includes(v) ? v : DEFAULT_TAB
    if (next !== activeTab.value) activeTab.value = next
  }
)

/* ─── 数据 ─── */
async function load() {
  if (!studentId.value) return
  loading.value = true
  try {
    const r = await studentApi.overview(studentId.value)
    const d = r.data
    Object.keys(profile).forEach((k) => delete profile[k])
    Object.assign(profile, d.profile)
    counters.value = d.counters || {}
    parentId.value = d.parentId
    parentProfile.value = d.parentProfile
  } catch (_) {
    Object.keys(profile).forEach((k) => delete profile[k])
    counters.value = {}
    parentId.value = null
    parentProfile.value = null
  } finally {
    loading.value = false
  }
}

function onBack() {
  router.push('/students')
}

/* ─── 写操作 ─── */

async function onToggleActive() {
  const next = !profile.isActive
  const action = next ? '启用' : '停用'
  try {
    await ElMessageBox.confirm(
      next
        ? '启用后该学员可正常报名 / 排课 / 消课。'
        : '停用后该学员不再出现在新报名 / 排课 / 下拉中, 历史数据保留。',
      `${action}学员`,
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  await studentApi.update(profile.id, { isActive: next })
  ElMessage.success(`已${action}`)
  await load()
}

async function onToggleBlock() {
  const next = !profile.isBlocked
  const action = next ? '加入黑名单' : '解除黑名单'
  try {
    const { value: reason } = await ElMessageBox.prompt(
      next
        ? '加入黑名单后该学员将无法报名 / 下单, 家长端不可见。'
        : '解除后可恢复正常业务。',
      action,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入原因(可选)',
        inputType: 'textarea'
      }
    )
    await studentApi.setBlocked(profile.id, next, reason || '')
    ElMessage.success(`已${action}`)
    await load()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e?.response?.data?.message || `${action}失败`)
  }
}

async function onRemoveConfirm({ password }) {
  try {
    await studentApi.remove(profile.id, { password })
    ElMessage.success('已停用')
    router.push('/students')
  } catch (e) {
    await handleRemoveError(e, '无法停用 · 中风险', `学生 ${profile.name}`)
  }
}

watch(() => route.params.id, load, { immediate: true })
</script>

<style scoped>
.page { max-width: 100%; }
.page-header { margin-bottom: 16px; }
.page-header__title { font-size: 18px; font-weight: 600; color: #303133; }
.hdr-tag { margin-left: 8px; }
.block { margin-bottom: 16px; }
.empty-wrap { margin-top: 40px; }

.account { position: sticky; top: 16px; }
.account__hero { text-align: center; }
.account__name { margin-top: 10px; font-size: 16px; font-weight: 600; color: #303133; }
.account__sub { margin-top: 4px; color: #909399; font-size: 13px; }
.account__guardian { margin-top: 8px; color: #606266; font-size: 13px; }
.account__actions { display: flex; flex-direction: column; gap: 8px; }
/* 抹掉 EP 给相邻按钮加的 margin-left; DestructiveConfirm 包着的那个按钮
   不会自动撑满, 统一拉宽保持一列对齐 */
.account__actions :deep(.el-button) { width: 100%; margin-left: 0; }

.kpi-row { margin-bottom: 4px; }
.detail-tabs :deep(.el-tabs__content) { padding-top: 8px; }
</style>
