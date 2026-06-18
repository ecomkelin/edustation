<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="900px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <div v-if="loading" v-loading="true" class="loading-block" />
    <div v-else-if="parent" class="detail-content">
      <!-- 头部: 状态 + 标签 + 操作 -->
      <div class="header">
        <el-tag :type="lifecycleTagType(parent.lifecycle)" size="large">
          {{ lifecycleLabel(parent.lifecycle) }}
        </el-tag>
        <el-tag
          v-for="tag in parent.tags"
          :key="tag._id || tag"
          :type="tag._id ? tagColor(tag) : ''"
          size="small"
          effect="plain"
          class="ml"
        >
          {{ tag.name || tag }}
        </el-tag>
        <span class="meta" v-if="parent.lastContactedAt">
          最近联系 {{ formatTime(parent.lastContactedAt) }}
        </span>
        <div class="header-actions">
          <el-button size="small" @click="onEditParent">
            编辑家长档案
          </el-button>
          <el-button size="small" :loading="acting" @click="onAddChild">
            + 加一个孩子
          </el-button>
          <el-button size="small" @click="onTagManager = true">
            管理标签
          </el-button>
          <el-button
            size="small"
            :loading="acting"
            @click="onRecompute"
          >
            同步状态(重算 lifecycle)
          </el-button>
          <DestructiveConfirm
            v-if="isPlatformAdmin"
            :target="`家长 ${parent.phone}`"
            :precheck="() => parentApi.removableCheck(parent._id).then((r) => r.data)"
            @confirm="(p) => onRemove(p)"
          >
            <el-button size="small" type="danger" link>删除</el-button>
          </DestructiveConfirm>
        </div>
      </div>

      <!-- 基础信息 -->
      <el-descriptions :column="3" border size="small" class="mb">
        <el-descriptions-item label="联系电话">{{ parent.phone }}</el-descriptions-item>
        <el-descriptions-item label="渠道">
          <span v-if="parent.source?.name || (parent.source && typeof parent.source === 'object')">
            {{ parent.source.name }}
          </span>
          <span v-else class="muted">-</span>
          <span class="muted" v-if="parent.sourceDetail"> / {{ parent.sourceDetail }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="推广人">
          {{ parent.promoteBy?.realName || parent.promoteBy?.mobile || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="咨询师">
          {{ parent.consultant?.realName || parent.consultant?.mobile || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="家长账号" v-if="parent.user">
          {{ parent.user.mobile }} (realName: {{ parent.user.realName }})
          <el-tag v-if="parent.user.requirePasswordChange" type="warning" size="small" class="ml">未改密</el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-else label="家长账号">
          <span class="muted">未转化 (尚无 User)</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(parent.createdAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="parent.remark" label="备注" :span="3">
          {{ parent.remark }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 孩子列表 -->
      <el-divider content-position="left">
        <span>孩子 ({{ parent.childLeads?.length || 0 }})</span>
      </el-divider>
      <el-table
        v-if="parent.childLeads && parent.childLeads.length > 0"
        :data="parent.childLeads"
        size="small"
        border
      >
        <el-table-column label="孩子姓名" min-width="100">
          <template #default="{ row }">
            {{ row.name }}
            <el-tag v-if="row.sameAs?.length" size="small" type="info" class="ml">跨年</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="性别" width="60">
          <template #default="{ row }">{{ genderLabel(row.gender) }}</template>
        </el-table-column>
        <el-table-column label="年龄" width="60" prop="age" />
        <el-table-column label="学校" min-width="100">
          <template #default="{ row }">
            {{ row.school?.name || row.school || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="试听科目" min-width="100">
          <template #default="{ row }">
            {{ row.trialSubject?.name || (row.trialSubjects?.[0]?.name) || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近试听" width="120">
          <template #default="{ row }">{{ row.latestBooking?.status || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="openChildEdit(row)">编辑</el-button>
            <el-button size="small" link @click="openChildDetail(row)">详情</el-button>
            <!-- 记录触点: 已流失/已转化的不显示 (业务上不在这两种状态下新加触点) -->
            <el-button
              v-if="!['converted', 'lost'].includes(row.status)"
              size="small"
              link
              type="primary"
              @click="openCreateActivity(row)"
            >+ 触点</el-button>
            <el-button
              v-if="row.status === 'converted'"
              size="small"
              link
              type="success"
              @click="onUnconvertChild(row)"
            >撤销</el-button>
            <!-- 误操删除: 仅超管可见, 走 requirePlatformPassword (超管+密码) + 互锁 (TrialBooking/LeadActivity) -->
            <DestructiveConfirm
              v-if="isPlatformAdmin"
              :target="`孩子 ${row.name}`"
              :precheck="() => childLeadApi.removableCheck(row._id).then((r) => r.data)"
              @confirm="(p) => onRemoveChild(row, p)"
            >
              <el-button size="small" link type="danger">删除</el-button>
            </DestructiveConfirm>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="empty">该家长下还没有孩子, 点击右上"+ 加一个孩子"</div>

      <!-- 家长沟通画像 (2026-06 新增) — 挂在 UserOrgRel 上, 跨机构独立 -->
      <el-divider content-position="left">
        <span>家长沟通画像</span>
      </el-divider>
      <el-descriptions
        v-if="parent.profile && hasAnyProfile"
        :column="2"
        border
        size="small"
      >
        <el-descriptions-item label="沟通偏好">{{ parent.profile.commStyle || '—' }}</el-descriptions-item>
        <el-descriptions-item label="家庭背景">{{ parent.profile.familyBg || '—' }}</el-descriptions-item>
        <el-descriptions-item label="孩子关注">{{ parent.profile.childFocus || '—' }}</el-descriptions-item>
        <el-descriptions-item label="跟进备忘" :span="2">
          <div style="white-space: pre-wrap">{{ parent.profile.followUp || '—' }}</div>
        </el-descriptions-item>
        <el-descriptions-item v-if="parent.profile.lastUpdatedAt" label="最后更新" :span="2">
          <span class="meta-text">
            {{ parent.profile.lastUpdatedBy?.realName || '系统' }} ·
            {{ formatTime(parent.profile.lastUpdatedAt) }}
          </span>
        </el-descriptions-item>
      </el-descriptions>
      <div v-else class="empty">
        尚未填写画像
        <el-button v-if="canEditProfile" size="small" type="primary" link @click="openProfileEdit">去填写</el-button>
      </div>
      <div v-if="canEditProfile" style="margin-top: 8px">
        <el-button size="small" type="primary" link @click="openProfileEdit">
          {{ hasAnyProfile ? '编辑画像' : '填写画像' }}
        </el-button>
      </div>

      <!-- 触点时间线 (聚合该家长下所有孩子的触点) -->
      <el-divider content-position="left">
        <span>触点时间线 ({{ parent.activities?.length || 0 }})</span>
        <span class="divider-actions">
          <!--
            触点添加入口: 之前只藏在孩子行的"+ 触点"按钮里, 触点时间线区本身没入口, 用户找不到
            单孩: 直接打开该孩子的触点 dialog
            多孩: el-popover 弹孩子列表
            仅 recruit.write 权限 + 至少 1 个非 converted/lost 孩子可见
          -->
          <el-popover
            v-if="canAddActivity"
            placement="bottom-start"
            :width="240"
            trigger="click"
            popper-class="add-activity-popover"
          >
            <template #reference>
              <el-button
                size="small"
                type="primary"
                link
              >+ 添加触点</el-button>
            </template>
            <div class="add-activity-content">
              <div class="add-activity-title">选择孩子</div>
              <div
                v-for="c in addableChildren"
                :key="c._id"
                class="add-activity-item"
                @click="onPickChildForActivity(c)"
              >
                <span>{{ c.name }}</span>
                <el-tag size="small" :type="statusTagType(c.status)" effect="plain">
                  {{ statusLabel(c.status) }}
                </el-tag>
              </div>
              <div v-if="addableChildren.length === 0" class="add-activity-empty">
                暂无可加触点的孩子 (都已转化或流失)
              </div>
            </div>
          </el-popover>
        </span>
      </el-divider>
      <div v-if="!parent.activities || parent.activities.length === 0" class="empty">暂无触点</div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="a in parent.activities.slice(0, 30)"
          :key="a._id"
          :timestamp="formatTime(a.at)"
          placement="top"
        >
          <el-tag size="small">{{ activityTypeLabel(a.type) }}</el-tag>
          <span class="ml">{{ a.remark || '(无备注)' }}</span>
          <span class="meta ml">by {{ a.byUser?.realName || a.byUser?.mobile || '-' }}</span>
          <el-tag v-if="a.lead?.name" size="small" type="info" class="ml">孩: {{ a.lead.name }}</el-tag>
          <!-- hover 才显示的操作条 -->
          <span class="activity-actions">
            <el-button
              v-if="canEditActivity(a)"
              size="small"
              link
              type="primary"
              @click="openEditActivity(a)"
            >编辑</el-button>
            <!-- 删除 = 超管 + 密码门控 (无软删) -->
            <DestructiveConfirm
              v-if="isPlatformAdmin"
              :target="`触点 ${activityTypeLabel(a.type)} (${formatTime(a.at)})`"
              @confirm="(p) => onRemoveActivity(a, p)"
            >
              <el-button size="small" link type="danger">删除</el-button>
            </DestructiveConfirm>
          </span>
        </el-timeline-item>
      </el-timeline>
    </div>

    <!-- 加孩子子 dialog (append-to-body: 必须, 否则被父 dialog mask 遮挡, 看不见) -->
    <ChildLeadEditDialog
      v-model:visible="addChildDialog.visible"
      :parent="parent"
      append-to-body
      @saved="onChildAdded"
    />

    <!-- 编辑单个孩子子 dialog (append-to-body: 必须) -->
    <ChildLeadEditDialog
      v-model:visible="editChildDialog.visible"
      :parent="parent"
      :child-lead="editChildDialog.childLead"
      append-to-body
      @saved="onChildEdited"
    />

    <!-- 编辑家长档案子 dialog (append-to-body: 必须) -->
    <ParentEditDialog
      v-model:visible="editParentDialog.visible"
      :parent="parent"
      append-to-body
      @saved="onParentEdited"
    />

    <!-- 标签管理子 dialog -->
    <el-dialog
      v-model="onTagManager"
      title="管理标签"
      width="500px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div class="tag-manager">
        <div class="tag-section">
          <div class="tag-section-title">已加标签</div>
          <el-tag
            v-for="tag in parent.tags"
            :key="tag._id || tag"
            closable
            class="ml"
            :type="tag._id ? tagColor(tag) : ''"
            @close="onRemoveTag(tag)"
          >
            {{ tag.name || tag }}
          </el-tag>
          <span v-if="!parent.tags?.length" class="muted">暂未加任何标签</span>
        </div>
        <el-divider />
        <div class="tag-section">
          <div class="tag-section-title">
            可选标签 (类别字典 - 家长标签)
            <el-tooltip
              content="如需新增/编辑/停用标签, 请到「基础数据 → 类别字典 → 家长标签」管理"
              placement="top"
            >
              <el-icon class="tag-hint-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <el-tag
            v-for="t in availableTags"
            :key="t._id"
            class="ml mb"
            :type="parent.tags?.some((p) => (p._id || p) === t._id) ? 'info' : ''"
            @click="onAddTag(t)"
          >
            + {{ t.name }}
          </el-tag>
        </div>
      </div>
    </el-dialog>

    <!-- 编辑触点子 dialog (append-to-body: 必须) -->
    <ActivityEditDialog
      v-model:visible="editActivityDialog.visible"
      :child-lead-id="editActivityDialog.childLeadId"
      :activity="editActivityDialog.activity"
      append-to-body
      @saved="onActivityEdited"
    />

    <!-- 添加触点子 dialog (append-to-body: 必须) -->
    <ActivityCreateDialog
      v-model:visible="createActivityDialog.visible"
      :child-lead-id="createActivityDialog.childLeadId"
      :child-name="createActivityDialog.childName"
      append-to-body
      @saved="onActivityCreated"
    />

    <!-- 家长沟通画像 (2026-06 新增) — 详情内编辑入口 (append-to-body: 必须) -->
    <ParentProfileDialog
      v-model:visible="profileDialog.visible"
      :parent="profileDialog.parent"
      append-to-body
      @saved="onProfileSaved"
    />
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { parentApi } from '@/api/parent'
import { childLeadApi } from '@/api/childLead'
import { categoryApi } from '@/api/category'
import { useAuthStore } from '@/stores/auth'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { handleRemoveError } from '@/utils/removable'
import {
  PARENT_LIFECYCLE_LABEL, PARENT_LIFECYCLE_TAG_TYPE,
  CHILD_LEAD_STATUS_LABEL, CHILD_LEAD_STATUS_TAG_TYPE,
  LEAD_ACTIVITY_TYPE_LABEL, GENDER_LABEL
} from '@/utils/constants'
import ChildLeadEditDialog from './ChildLeadEditDialog.vue'
import ParentEditDialog from './ParentEditDialog.vue'
import ActivityEditDialog from './ActivityEditDialog.vue'
import ActivityCreateDialog from './ActivityCreateDialog.vue'
import ParentProfileDialog from '@/components/Profile/ParentProfileDialog.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  parentId: { type: String, required: true }
})
const emit = defineEmits(['update:visible', 'updated', 'open-child-detail', 'open-existing'])

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => !!authStore.user?.isPlatformAdmin)

const loading = ref(false)
const acting = ref(false)
const parent = ref(null)
const onTagManager = ref(false)
const availableTags = ref([])
const addChildDialog = reactive({ visible: false })
const editParentDialog = reactive({ visible: false })
const editChildDialog = reactive({ visible: false, childLead: null })
const editActivityDialog = reactive({ visible: false, childLeadId: null, activity: null })
const createActivityDialog = reactive({ visible: false, childLeadId: null, childName: '' })

// === 家长沟通画像 (2026-06 新增) ===
const profileDialog = reactive({ visible: false, parent: null })
const hasAnyProfile = computed(() => {
  const p = parent.value?.profile
  if (!p) return false
  return !!(p.commStyle || p.familyBg || p.childFocus || p.followUp)
})
// 权限检查: 复刻 Dashboard.vue 的 hasPerm 模式 (auth store 没有这个方法)
function hasPerm(code) {
  if (authStore.user?.isPlatformAdmin) return true
  const org = authStore.orgs.find((o) => o.id === authStore.currentOrgId)
  if (!org) return false
  const perms = new Set()
  for (const p of org.positions || []) {
    for (const c of p.permissions || []) perms.add(c)
  }
  return perms.has(code)
}
const canEditProfile = computed(() => hasPerm('recruit.write'))
// 触点添加入口: 需要 recruit.write + 至少一个非 converted/lost 的孩子
const canAddActivity = computed(() => {
  if (!hasPerm('recruit.write')) return false
  const list = parent.value?.childLeads || []
  return list.some((c) => !['converted', 'lost'].includes(c.status))
})
// 可加触点的孩子列表 (排除已转化/已流失)
const addableChildren = computed(() => {
  const list = parent.value?.childLeads || []
  return list.filter((c) => !['converted', 'lost'].includes(c.status))
})
// 选完孩子 → 关闭 popover (由 popover 自身 click outside 关闭) → 打开触点 dialog
function onPickChildForActivity(child) {
  if (!child) return
  openCreateActivity(child)
}
function openProfileEdit() {
  // 详情 dialog 内的 parent 含 id/_id + profile 字段, 直接传
  const p = parent.value
  if (!p) return
  profileDialog.parent = { ...p, id: p.id || p._id }
  profileDialog.visible = true
}
async function onProfileSaved(updated) {
  // 用后端返回的最新 profile 直接覆盖, 不重 load 整个详情 (避免闪烁)
  if (parent.value) parent.value.profile = updated
}
const currentUserId = computed(() => authStore.user?._id || authStore.user?.id || null)

const dialogTitle = computed(() => parent.value ? `家长账户 - ${parent.value.phone}` : '家长账户')

watch(() => props.visible, async (v) => {
  if (v && props.parentId) {
    await load()
    await loadTags()
  }
}, { immediate: true })

async function load() {
  loading.value = true
  try {
    const r = await parentApi.detail(props.parentId)
    parent.value = r.data
  } finally {
    loading.value = false
  }
}

async function loadTags() {
  try {
    const r = await categoryApi.list({ model: 'LeadTag', pageSize: 100 })
    availableTags.value = r.data?.items || (Array.isArray(r.data) ? r.data : [])
  } catch (e) { availableTags.value = [] }
}

function lifecycleLabel(s) { return PARENT_LIFECYCLE_LABEL[s] || s }
function lifecycleTagType(s) { return PARENT_LIFECYCLE_TAG_TYPE[s] || '' }
function statusLabel(s) { return CHILD_LEAD_STATUS_LABEL[s] || s }
function statusTagType(s) { return CHILD_LEAD_STATUS_TAG_TYPE[s] || '' }
function activityTypeLabel(t) { return LEAD_ACTIVITY_TYPE_LABEL[t] || t }
function genderLabel(g) { return GENDER_LABEL[g] || g }
function tagColor(tag) {
  if (!tag?.name) return 'info'
  if (tag.name === '已流失') return 'danger'
  if (tag.name === '高意向') return 'success'
  return 'info'
}
function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}

function onAddChild() {
  addChildDialog.visible = true
}

function onEditParent() {
  editParentDialog.visible = true
}

async function onParentEdited() {
  await load()
  emit('updated')
}

async function onChildAdded() {
  await load()
  emit('updated')
}

async function onAddTag(t) {
  if (parent.value.tags?.some((p) => (p._id || p) === t._id)) {
    ElMessage.info('已加过该标签')
    return
  }
  acting.value = true
  try {
    await parentApi.addTag(parent.value._id, t._id)
    ElMessage.success(`已加标签: ${t.name}`)
    await load()
  } finally {
    acting.value = false
  }
}

async function onRemoveTag(t) {
  acting.value = true
  try {
    await parentApi.removeTag(parent.value._id, t._id || t)
    ElMessage.success('已删标签')
    await load()
  } finally {
    acting.value = false
  }
}

async function onRecompute() {
  acting.value = true
  try {
    const r = await parentApi.recomputeLifecycle(parent.value._id)
    ElMessage.success(`状态已同步: ${lifecycleLabel(r.data?.lifecycle) || '-'}`)
    await load()
  } finally {
    acting.value = false
  }
}

async function onUnconvertChild(child) {
  const ok = await ElMessageBox.confirm(
    `撤销 ${child.name} 的转化? (5 分钟内有效)`,
    '撤销转化',
    { type: 'warning' }
  ).catch(() => null)
  if (!ok) return
  acting.value = true
  try {
    await childLeadApi.unconvert(child._id)
    ElMessage.success('已撤销')
    await load()
    emit('updated')
  } finally {
    acting.value = false
  }
}

/* ─── 触点编辑 / 物理删 (2026-06-15) ────── */

// 24h 窗口, 与后端 ACTIVITY_EDIT_WINDOW_MS 一致
const ACTIVITY_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000
// 判断当前用户能不能编辑这条触点:
//   - 超管 → 任何时候都行
//   - 自己创建 + 24h 内 → 行
//   - 否则 → 不显示编辑按钮 (后端会再卡一次, 双保险)
// 删除一律走超管 + 密码 (无软删)
function canEditActivity(a) {
  if (isPlatformAdmin.value) return true
  if (!currentUserId.value) return false
  const ownerId = a.byUser?._id || a.byUser
  if (String(ownerId) !== String(currentUserId.value)) return false
  const ts = new Date(a.at || a.createdAt).getTime()
  return (Date.now() - ts) <= ACTIVITY_EDIT_WINDOW_MS
}

function openEditActivity(a) {
  // 触点属于哪个孩子: a.lead 已被 populate 为 { _id, name }
  const childLeadId = a.lead?._id || a.lead
  if (!childLeadId) {
    ElMessage.error('该触点未关联孩子, 无法编辑')
    return
  }
  editActivityDialog.childLeadId = childLeadId
  editActivityDialog.activity = a
  editActivityDialog.visible = true
}

async function onActivityEdited() {
  await load()
  emit('updated')
}

// 删除触点: 超管 + 密码 (DestructiveConfirm 弹挡板后弹密码框)
async function onRemoveActivity(a, { password }) {
  const childLeadId = a.lead?._id || a.lead
  if (!childLeadId) {
    ElMessage.error('该触点未关联孩子, 无法删除')
    return
  }
  acting.value = true
  try {
    await childLeadApi.removeActivity(childLeadId, a._id, { password })
    ElMessage.success('已删除触点')
    await load()
    emit('updated')
  } catch (e) {
    await handleRemoveError(e, '无法删除触点', `触点 ${activityTypeLabel(a.type)} (${formatTime(a.at)})`)
  } finally {
    acting.value = false
  }
}

/**
 * 误操删除孩子 (潜客)
 *   - 仅 isPlatformAdmin 可见 (按钮 v-if 控制)
 *   - DestructiveConfirm: 先调 removable-check 拿挡板,再弹"输密码"两次确认
 *   - 后端 requirePlatformPassword: 非超管 403 / 密码错 401 / 缺密码 400
 *   - 后端 assertUnused: TrialBooking/LeadActivity 引用挡板 422 + data.blockers
 *   - handleRemoveError 422 路径可达 (http.js interceptor 已修)
 */
async function onRemoveChild(child, { password }) {
  acting.value = true
  try {
    await childLeadApi.remove(child._id, { password })
    ElMessage.success(`已删除孩子「${child.name}」`)
    await load()
    emit('updated')
  } catch (e) {
    await handleRemoveError(e, '无法删除孩子', `孩子 ${child.name}`)
  } finally {
    acting.value = false
  }
}

function openChildDetail(child) {
  // 复用 childLead 详情逻辑 — 此处可后续扩展独立 childLead 详情 dialog
  ElMessageBox.alert(
    `孩子详情: ${child.name}\n状态: ${statusLabel(child.status)}\n转化备注: ${child.convertedRemark || '-'}`,
    '孩子详情',
    { confirmButtonText: '关闭' }
  )
}

function openChildEdit(child) {
  if (!child) return
  editChildDialog.childLead = child
  editChildDialog.visible = true
}

async function onChildEdited() {
  await load()
  emit('updated')
}

function openCreateActivity(row) {
  createActivityDialog.childLeadId = row._id
  createActivityDialog.childName = row.name
  createActivityDialog.visible = true
}

async function onActivityCreated() {
  await load()
  emit('updated')
}

async function onRemove({ password }) {
  acting.value = true
  try {
    await parentApi.remove(parent.value._id, { password })
    ElMessage.success('已删除')
    emit('updated')
    emit('update:visible', false)
  } catch (e) {
    await handleRemoveError(e, '无法删除家长账户', `家长 ${parent.value?.phone}`)
  } finally {
    acting.value = false
  }
}
</script>

<style scoped>
.loading-block { height: 200px; }
.detail-content { padding: 0 4px; }
.header {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.ml { margin-left: 8px; }
.mb { margin-bottom: 12px; }
.header-actions { margin-left: auto; display: flex; gap: 8px; }
.meta { color: #909399; font-size: 12px; }
.muted { color: #909399; font-size: 12px; }
.empty { padding: 20px; text-align: center; color: #909399; }
.tag-manager { padding: 0 8px; }
.tag-section-title { font-weight: 500; margin-bottom: 8px; }
.tag-hint-icon {
  margin-left: 4px;
  color: #909399;
  cursor: help;
  font-size: 14px;
  vertical-align: middle;
}
.tag-hint-icon:hover { color: #409eff; }

/* 触点卡片 hover 时才显示操作条 (编辑/删除/永久删除) */
.el-timeline-item .activity-actions {
  display: inline-block;
  margin-left: 8px;
  opacity: 0;
  transition: opacity 0.15s;
}
.el-timeline-item:hover .activity-actions { opacity: 1; }

/* 触点时间线 divider 旁的内联操作 (eg. + 添加触点) */
.divider-actions {
  margin-left: 12px;
  display: inline-flex;
  gap: 8px;
  vertical-align: middle;
}

/* + 添加触点 popover 内容 */
.add-activity-content { padding: 4px 0; }
.add-activity-title {
  font-size: 12px;
  color: #909399;
  padding: 0 8px 6px;
}
.add-activity-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.add-activity-item:hover { background: #f5f7fa; }
.add-activity-empty {
  padding: 12px 8px;
  text-align: center;
  color: #909399;
  font-size: 12px;
}
</style>
