<!--
  UserDetail.vue (2026-08-07 新增)

  用户详情页 —— 两个入口共用:
    · 机构管理 → 用户管理 (/users)                        机构视角, perm user.read
    · 系统管理 → 游离用户 (/system/unaffiliated-users)     平台超管, ?from=unaffiliated

  数据源: R-0217 GET /users/:id/overview (档案 + 机构职位 + 有效权限 + 各域计数)
          R-0218 GET /users/:id/related/:domain (各 tab 懒加载, 见 tabs/RelatedSection.vue)

  可见性由后端 resolveScope 决定, 前端只做呈现:
    scope=platform → 显示全部机构 + 「安全与审计」tab
    scope=org      → 只显示当前机构; 安全 tab 不渲染 (后端也会 403 兜底)

  形态照搬 OrgDetail.vue (2026-08-07): el-page-header + 卡片区块 + 弹窗承载写操作。
-->
<template>
  <div class="page" v-loading="loading">
    <!-- 注意: 返回文案要绑 :title 不能绑 :content —— 下面用了 #content 插槽放标题+状态,
         会把 content prop 整个盖掉 (OrgDetail.vue 里那个 content="返回机构列表" 其实没生效) -->
    <el-page-header :icon="ArrowLeft" :title="backText" @back="onBack" class="page-header">
      <template #content>
        <span class="page-header__title">{{ profile.realName || profile.mobile || '用户详情' }}</span>
        <el-tag v-if="profile.isPlatformAdmin" type="warning" size="small" class="hdr-tag">平台超管</el-tag>
        <el-tag v-if="isOrphan" type="info" size="small" class="hdr-tag">游离用户</el-tag>
        <el-tag :type="profile.isActive ? 'success' : 'info'" size="small" class="hdr-tag">
          {{ profile.isActive ? '启用' : '停用' }}
        </el-tag>
        <el-tag v-if="profile.isBlocked" type="danger" size="small" class="hdr-tag">黑名单</el-tag>
      </template>
    </el-page-header>

    <div v-if="!loading && !profile.id" class="empty-wrap">
      <el-empty description="用户不存在，或不属于当前机构" />
    </div>

    <el-row v-else-if="profile.id" :gutter="16">
      <!-- ─── 左: 账号卡 (常驻) ─── -->
      <el-col :span="6">
        <el-card class="block account" shadow="never">
          <div class="account__hero">
            <SvgAvatar :svg-key="profile.avatarSvgKey" audience="user" :size="72" />
            <div class="account__name">{{ profile.realName || '未填写姓名' }}</div>
            <div class="account__mobile">{{ profile.mobile }}</div>
          </div>

          <el-divider />

          <div class="account__actions">
            <el-button :icon="Edit" @click="editDialog = true">编辑资料</el-button>
            <el-button v-if="canResetPassword" :icon="Key" @click="resetDialog = true">重置密码</el-button>

            <template v-if="!isOrphan">
              <el-button :icon="Postcard" @click="positionDialog = true">调整职位</el-button>
              <div class="account__switch">
                <span>对外名师</span>
                <el-tooltip
                  :disabled="canSetTeacher"
                  content="该用户持有家长岗位（clientLevel > 0），不能设为对外名师"
                  placement="top"
                >
                  <span>
                    <el-switch
                      :model-value="currentOrg && currentOrg.showAsTeacher"
                      :disabled="!canSetTeacher"
                      :loading="teacherSaving"
                      inline-prompt
                      active-text="是"
                      inactive-text="否"
                      @change="onToggleTeacher"
                    />
                  </span>
                </el-tooltip>
              </div>
            </template>

            <el-button
              :type="profile.isActive ? 'warning' : 'success'"
              plain
              @click="onToggleActive"
            >
              {{ profile.isActive ? '停用账号' : '启用账号' }}
            </el-button>

            <el-button
              v-if="auth.isPlatformAdmin"
              :type="profile.isBlocked ? 'success' : 'warning'"
              plain
              @click="onToggleBlock"
            >
              {{ profile.isBlocked ? '解除黑名单' : '加入黑名单' }}
            </el-button>

            <!-- 移出机构: §8.1 三重防护 (超管 + 二次密码 + 互锁预检) -->
            <DestructiveConfirm
              v-if="!isOrphan"
              :target="`用户 ${profile.realName || profile.mobile}`"
              warning="中风险"
              reason="仅解除该用户与本机构的关联（不删除账号本体）。他在本机构的职位会一并失效。"
              :precheck-notes="['无开班/排课引用', '无学员监护人关联', '无赠课/作品痕迹']"
              :precheck="() => userApi.removableCheck(userId).then((r) => r.data)"
              @confirm="onRemoveFromOrg"
            >
              <el-button type="danger" plain :disabled="isSelf">移出机构</el-button>
            </DestructiveConfirm>
          </div>

          <div v-if="isSelf" class="account__self-tip">这是你自己的账号</div>
        </el-card>
      </el-col>

      <!-- ─── 右: tabs ─── -->
      <el-col :span="18">
        <el-row :gutter="10" class="kpi-row">
          <el-col v-for="k in kpis" :key="k.label" :span="4">
            <KpiCard :label="k.label" :value="k.value" :accent="k.accent" />
          </el-col>
        </el-row>

        <el-tabs v-model="activeTab" class="detail-tabs">
          <el-tab-pane label="概览" name="overview">
            <TabOverview
              :profile="profile"
              :orgs="orgs"
              :permissions="permissions"
              :scope="scope"
            />
          </el-tab-pane>
          <el-tab-pane label="学生与教学" name="relations">
            <TabRelations v-if="loadedTabs.has('relations')" :user-id="userId" :show-org="isPlatformScope" />
          </el-tab-pane>
          <el-tab-pane label="工作记录" name="work">
            <TabWork v-if="loadedTabs.has('work')" :user-id="userId" :show-org="isPlatformScope" />
          </el-tab-pane>
          <el-tab-pane v-if="isPlatformScope" label="安全与审计" name="security">
            <TabSecurity v-if="loadedTabs.has('security')" :user-id="userId" />
          </el-tab-pane>
        </el-tabs>
      </el-col>
    </el-row>

    <!-- 编辑资料 -->
    <UserFormDialog
      v-model="editDialog"
      mode="edit"
      :variant="isOrphan ? 'orphan' : 'org'"
      :user="formUser"
      @saved="load"
    />

    <!-- 重置密码 -->
    <ResetPasswordDialog
      v-model="resetDialog"
      :variant="isOrphan ? 'orphan' : 'org'"
      :user="profile"
    />

    <!-- 调整职位 -->
    <el-dialog v-model="positionDialog" title="调整职位" width="480px" @open="onOpenPositions">
      <p class="dlg-hint">
        调整该用户在「{{ currentOrg ? currentOrg.name : '当前机构' }}」下持有的职位。保存后其权限立即生效。
      </p>
      <el-select v-model="positionDraft" multiple style="width: 100%">
        <el-option
          v-for="p in positionOptions"
          :key="p._id"
          :label="Number(p.clientLevel) > 0 ? `${p.name}（L${p.clientLevel} 家长）` : p.name"
          :value="p._id"
        />
      </el-select>
      <template #footer>
        <el-button @click="positionDialog = false">取消</el-button>
        <el-button type="primary" :loading="positionSaving" @click="savePositions">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Edit, Key, Postcard } from '@element-plus/icons-vue'

import { userApi } from '@/api/user'
import { positionApi } from '@/api/position'
import { useAuthStore } from '@/stores/auth'
import { handleRemoveError } from '@/utils/removable'

import SvgAvatar from '@/components/Avatar/SvgAvatar.vue'
import KpiCard from '@/components/KpiCard.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import UserFormDialog from './UserFormDialog.vue'
import ResetPasswordDialog from './ResetPasswordDialog.vue'
import TabOverview from './tabs/TabOverview.vue'
import TabRelations from './tabs/TabRelations.vue'
import TabWork from './tabs/TabWork.vue'
import TabSecurity from './tabs/TabSecurity.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const VALID_TABS = ['overview', 'relations', 'work', 'security']
const DEFAULT_TAB = 'overview'

const loading = ref(false)
const scope = ref('org')
const profile = reactive({})
const orgs = ref([])
const permissions = ref({ isPlatformAdmin: false, codes: [] })
const counters = ref({})

const editDialog = ref(false)
const resetDialog = ref(false)
const positionDialog = ref(false)
const positionOptions = ref([])
const positionDraft = ref([])
const positionSaving = ref(false)
const teacherSaving = ref(false)

const userId = computed(() => String(route.params.id || ''))
const isPlatformScope = computed(() => scope.value === 'platform')
const isOrphan = computed(() => !!profile.id && orgs.value.length === 0)
const isSelf = computed(() => profile.id && profile.id === auth.user?.id)

// 机构视角下 orgs 只有一条 = 当前机构; 平台视角下挑当前选中的那家 (用于名师开关/职位)
const currentOrg = computed(() => {
  if (!orgs.value.length) return null
  return orgs.value.find((o) => o.id === auth.currentOrgId) || orgs.value[0]
})

// 家长岗 (clientLevel > 0) 不能设为对外名师 —— 后端 setTeacherFlag 也会兜底 400
const canSetTeacher = computed(() => {
  if (!currentOrg.value) return false
  return !(currentOrg.value.positions || []).some((p) => Number(p.clientLevel) > 0)
})

// 游离用户的重置密码走超管专属 R-0209; 机构态走 R-0215 (需 user.resetPassword)
const canResetPassword = computed(() => (isOrphan.value ? auth.isPlatformAdmin : true))

const backText = computed(() =>
  route.query.from === 'unaffiliated' ? '返回游离用户' : '返回用户管理'
)

/** UserFormDialog 吃的形状: 编辑时需要当前机构的职位 id 列表 */
const formUser = computed(() => ({
  ...profile,
  positions: currentOrg.value ? currentOrg.value.positions : []
}))

const kpis = computed(() => {
  const c = counters.value || {}
  const out = [
    { label: '监护学生', value: c.students ?? 0, accent: 'blue' },
    { label: '任课开班', value: c.courseInstances ?? 0, accent: 'green' },
    { label: '排课', value: c.lessonSchedules ?? 0, accent: 'green' },
    {
      label: '任务',
      value: (c.tasksAssigned ?? 0) + (c.tasksSupervised ?? 0) + (c.tasksCreated ?? 0),
      accent: 'orange'
    },
    {
      label: '招生',
      value: (c.parents ?? 0) + (c.childLeads ?? 0) + (c.trialBookings ?? 0),
      accent: 'orange'
    },
    { label: '财务流水', value: c.financeTx ?? 0, accent: 'default' }
  ]
  // 会话数只有平台视角拿得到 (机构视角后端返 null)
  if (c.sessions != null) out.push({ label: '活跃会话', value: c.sessions, accent: 'red' })
  return out.slice(0, 6)
})

/* ─── tab 与 URL 双向同步 + 懒加载 ─── */
const activeTab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : DEFAULT_TAB)
// 只渲染点开过的 tab, 避免一进页面就打十几个 related 请求
const loadedTabs = ref(new Set([activeTab.value]))

watch(
  activeTab,
  (v) => {
    loadedTabs.value.add(v)
    // 触发 Set 的响应式更新 (Set.add 本身不触发)
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

// scope 从 platform 掉回 org 时 (切机构), 安全 tab 会消失 —— 把选中项拨回概览
watch(isPlatformScope, (v) => {
  if (!v && activeTab.value === 'security') activeTab.value = DEFAULT_TAB
})

/* ─── 数据 ─── */
async function load() {
  if (!userId.value) return
  loading.value = true
  try {
    const r = await userApi.overview(userId.value)
    const d = r.data
    scope.value = d.scope
    Object.keys(profile).forEach((k) => delete profile[k])
    Object.assign(profile, d.profile)
    orgs.value = d.orgs || []
    permissions.value = d.effectivePermissions || { isPlatformAdmin: false, codes: [] }
    counters.value = d.counters || {}
  } catch (_) {
    // 404 / 403 已由 http.js toast; 这里清空走 el-empty 兜底
    Object.keys(profile).forEach((k) => delete profile[k])
    orgs.value = []
    counters.value = {}
  } finally {
    loading.value = false
  }
}

function onBack() {
  router.push(route.query.from === 'unaffiliated' ? '/system/unaffiliated-users' : '/users')
}

/* ─── 写操作 ─── */

async function onOpenPositions() {
  positionDraft.value = (currentOrg.value?.positions || []).map((p) => p.id)
  const r = await positionApi.list({ pageSize: 200 })
  positionOptions.value = r.data.items
}

async function savePositions() {
  positionSaving.value = true
  try {
    await userApi.setPositions(userId.value, positionDraft.value)
    ElMessage.success('职位已更新')
    positionDialog.value = false
    await load()
  } finally {
    positionSaving.value = false
  }
}

async function onToggleTeacher(val) {
  teacherSaving.value = true
  try {
    await userApi.setTeacherFlag(userId.value, val)
    ElMessage.success(val ? '已设为对外名师' : '已取消对外名师')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '切换失败')
    await load() // 失败回滚: 重拉真值, 不手工改本地状态
  } finally {
    teacherSaving.value = false
  }
}

async function onToggleActive() {
  const next = !profile.isActive
  const action = next ? '启用' : '停用'
  try {
    await ElMessageBox.confirm(
      next
        ? '启用后该账号可以正常登录。'
        : '停用后该账号将无法登录（历史数据保留）。常用于员工离职。',
      `${action}账号`,
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  const payload = {
    realName: profile.realName,
    idCard: profile.idCard || null,
    region: profile.region ? profile.region.id : null,
    isActive: next
  }
  if (isOrphan.value) await userApi.updateUnaffiliated(userId.value, payload)
  else await userApi.update(userId.value, payload)
  ElMessage.success(`已${action}`)
  await load()
}

async function onToggleBlock() {
  const next = !profile.isBlocked
  const action = next ? '加入黑名单' : '解除黑名单'
  try {
    const { value: reason } = await ElMessageBox.prompt(
      next
        ? '加入黑名单后该账号将无法登录，refresh token 下次刷新时自动失效。'
        : '解除后可恢复正常登录。',
      action,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入原因(可选)',
        inputType: 'textarea'
      }
    )
    await userApi.setBlocked(userId.value, next, reason || '')
    ElMessage.success(`已${action}`)
    await load()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e?.response?.data?.message || `${action}失败`)
  }
}

async function onRemoveFromOrg({ password }) {
  try {
    await userApi.remove(userId.value, { password })
    ElMessage.success('已移出机构')
    router.push('/users')
  } catch (e) {
    // 预检通过后又被新数据挡住 (竞态) 时, 从 err 里还原挡板说明
    await handleRemoveError(e, '无法移出 · 中风险', `用户 ${profile.realName || profile.mobile}`)
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
.account__mobile { margin-top: 2px; color: #909399; font-size: 13px; }
.account__actions { display: flex; flex-direction: column; gap: 8px; }
/* 竖排: 抹掉 EP 给相邻按钮加的 margin-left; DestructiveConfirm 包着的那个按钮
   不会自动撑满, 统一拉宽保持一列对齐 */
.account__actions :deep(.el-button) { width: 100%; margin-left: 0; }
.account__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #606266;
  padding: 2px 0;
}
.account__self-tip {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  color: #e6a23c;
}

.kpi-row { margin-bottom: 4px; }
.detail-tabs :deep(.el-tabs__content) { padding-top: 8px; }
.dlg-hint { margin: 0 0 12px; color: #909399; font-size: 13px; }
</style>
