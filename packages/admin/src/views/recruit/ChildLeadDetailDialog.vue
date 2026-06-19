<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="920px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <div v-if="loading" v-loading="true" class="loading-block" />
    <div v-else-if="child" class="detail-content">
      <!-- 头部: 状态 + 元信息 + 操作 -->
      <div class="header">
        <el-tag :type="statusTagType(child.status)" size="large">
          {{ statusLabel(child.status) }}
        </el-tag>
        <el-tag v-if="child.sameAs?.length" size="small" type="info" effect="plain" class="ml">跨年</el-tag>
        <el-tag v-if="child.sameParentCount > 1" size="small" effect="plain" class="ml">
          {{ child.sameParentRank }}/{{ child.sameParentCount }} 孩
        </el-tag>
        <span v-if="child.lastContactedAt" class="meta">
          最近联系 {{ formatTime(child.lastContactedAt) }}
        </span>
        <div class="header-actions">
          <el-button
            v-if="canAddActivity"
            size="small"
            type="primary"
            @click="openCreateActivity"
          >+ 触点</el-button>
          <el-button
            v-if="child.status === 'converted' && hasPerm('recruit.convert')"
            size="small"
            :loading="acting"
            @click="onUnconvert"
          >撤销转化</el-button>
          <el-button
            size="small"
            @click="emit('open-edit', child)"
          >编辑基础信息</el-button>
          <el-button
            v-if="canSchedule"
            size="small"
            type="warning"
            @click="openSchedule"
          >排一次试听</el-button>
          <!-- 误操删除: 仅超管可见 -->
          <DestructiveConfirm
            v-if="isPlatformAdmin"
            :target="`孩子 ${child.name}`"
            :precheck="() => childLeadApi.removableCheck(child._id).then((r) => r.data)"
            @confirm="(p) => onRemove(p)"
          >
            <el-button size="small" type="danger" link>删除</el-button>
          </DestructiveConfirm>
        </div>
      </div>

      <!-- 基础信息 -->
      <el-descriptions :column="3" border size="small" class="mb">
        <el-descriptions-item label="孩子姓名">{{ child.name }}</el-descriptions-item>
        <el-descriptions-item label="性别 / 年龄">
          {{ genderLabel(child.gender) }} / {{ child.age ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="学校">
          {{ typeof child.school === 'object' ? (child.school?.name || '-') : (child.school || '-') }}
        </el-descriptions-item>
        <el-descriptions-item label="年级 / 班级">
          {{ child.grade || '-' }} / {{ child.className || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="试听科目">
          <!-- 后端 detail 只 populate 第一个 trialSubject; 多余的 trialSubjects 数组不展开
               这里展示第一个名字 + 数量提示, 完整列表在编辑弹窗里看 -->
          <el-tag v-if="child.trialSubject?.name" size="small">{{ child.trialSubject.name }}</el-tag>
          <span
            v-if="(child.trialSubjects?.length || 0) > 1"
            class="muted ml"
          >+{{ child.trialSubjects.length - 1 }} (在编辑里查看全部)</span>
          <span v-if="!child.trialSubject?.name" class="muted">-</span>
        </el-descriptions-item>
        <el-descriptions-item label="试听缴费">{{ child.trialFee || 0 }} 元</el-descriptions-item>
        <el-descriptions-item label="所属家长">
          <el-link
            v-if="child.parent?.phone"
            type="primary"
            link
            @click="emit('open-parent', child.parent)"
          >{{ child.parent.phone }}</el-link>
          <span v-else class="muted">-</span>
          <el-tag
            v-if="child.parent?.lifecycle"
            :type="lifecycleTagType(child.parent.lifecycle)"
            size="small"
            class="ml"
          >{{ lifecycleLabel(child.parent.lifecycle) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="渠道">
          {{ child.source?.name || '-' }}
          <span v-if="child.sourceDetail" class="muted"> / {{ child.sourceDetail }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="邀约老师">
          {{ child.inviteTeacher?.realName || child.inviteTeacher?.mobile || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="录入人">
          {{ child.createdBy?.realName || child.createdBy?.mobile || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(child.createdAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="child.remark" label="备注" :span="3">
          <div style="white-space: pre-wrap">{{ child.remark }}</div>
        </el-descriptions-item>
        <!-- 已转化: 显示转化结果 -->
        <template v-if="child.status === 'converted'">
          <el-descriptions-item label="已转学员">
            {{ child.convertedStudent?.name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="转化时间">{{ formatTime(child.convertedAt) }}</el-descriptions-item>
          <el-descriptions-item v-if="child.convertedRemark" label="转化备注" :span="3">
            <div style="white-space: pre-wrap">{{ child.convertedRemark }}</div>
          </el-descriptions-item>
        </template>
        <!-- 已流失: 显示原因 -->
        <template v-if="child.status === 'lost' && child.lostReason">
          <el-descriptions-item label="流失原因" :span="3">{{ child.lostReason }}</el-descriptions-item>
        </template>
      </el-descriptions>

      <!-- 同家长下其他孩子 (siblings) -->
      <template v-if="siblings.length">
        <el-divider content-position="left">
          <span>同家长下的其他孩子 ({{ siblings.length }})</span>
        </el-divider>
        <div class="siblings">
          <el-tag
            v-for="s in siblings"
            :key="s._id"
            :type="statusTagType(s.status)"
            effect="plain"
            class="ml mb sib"
            @click="onOpenSibling(s)"
          >{{ s.name }} · {{ statusLabel(s.status) }}</el-tag>
        </div>
      </template>

      <!-- Tabs: 触点 / 试听 -->
      <el-tabs v-model="activeTab" class="timeline-tabs">
        <el-tab-pane name="activities" :label="`触点时间线 (${activities.length})`">
          <div v-if="!activities.length" class="empty">暂无触点</div>
          <el-timeline v-else>
            <el-timeline-item
              v-for="a in activities"
              :key="a._id"
              :timestamp="formatTime(a.at)"
              placement="top"
            >
              <el-tag size="small">{{ activityTypeLabel(a.type) }}</el-tag>
              <span class="ml">{{ a.remark || '(无备注)' }}</span>
              <span class="meta ml">by {{ a.byUser?.realName || a.byUser?.mobile || '-' }}</span>
              <span class="activity-actions">
                <el-button
                  v-if="canEditActivity(a)"
                  size="small"
                  link
                  type="primary"
                  @click="openEditActivity(a)"
                >编辑</el-button>
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
        </el-tab-pane>

        <el-tab-pane name="bookings" :label="`试听记录 (${bookings.length})`">
          <div v-if="!bookings.length" class="empty">
            暂无试听记录
            <span v-if="hasPerm('recruit.write')" class="muted">(可去"试听记录"页面创建或编辑)</span>
          </div>
          <el-table v-else :data="bookings" size="small" border>
            <el-table-column label="第几次" width="80">
              <template #default="{ row }">第 {{ row.attemptNo }} 次</template>
            </el-table-column>
            <el-table-column label="科目" min-width="100">
              <template #default="{ row }">
                {{ typeof row.subject === 'object' ? (row.subject?.name || '-') : (row.subject || '-') }}
              </template>
            </el-table-column>
            <el-table-column label="老师" min-width="90">
              <template #default="{ row }">
                {{ row.teacher?.realName || row.teacher?.mobile || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="时间" width="180">
              <template #default="{ row }">{{ formatTime(row.scheduledAt) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="TRIAL_BOOKING_STATUS_TAG_TYPE[row.status]" size="small">
                  {{ TRIAL_BOOKING_STATUS_LABEL[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="是否报名" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.result?.isEnrolled === true" type="success" size="small">已报名</el-tag>
                <el-tag v-else-if="row.result?.isEnrolled === false" type="info" size="small">未报名</el-tag>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="谈单老师" min-width="90">
              <template #default="{ row }">
                {{ row.consultant?.realName || row.result?.negotiateTeacher?.realName || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="(row.status === 'scheduled' || row.status === 'arrived' || (row.status === 'completed' && row.result?.isEnrolled === null)) && hasPerm('recruit.write')"
                  size="small"
                  link
                  type="primary"
                  @click="openSignIn(row)"
                >
                  {{ row.status === 'scheduled' ? '到店' : row.status === 'arrived' ? '完成' : '补填' }}
                </el-button>
                <el-button
                  v-if="row.status === 'completed' && row.result?.isEnrolled === true && !row.result?.enrolledAt && hasPerm('recruit.convert')"
                  size="small"
                  link
                  type="success"
                  @click="onConvert(row)"
                >转化</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 子 dialog (append-to-body: 必须, 否则被父 dialog mask 遮挡) -->
    <ActivityCreateDialog
      v-model:visible="createActivityDialog.visible"
      :child-lead-id="createActivityDialog.childLeadId"
      :child-name="createActivityDialog.childName"
      append-to-body
      @saved="onActivityChanged"
    />
    <ActivityEditDialog
      v-model:visible="editActivityDialog.visible"
      :child-lead-id="editActivityDialog.childLeadId"
      :activity="editActivityDialog.activity"
      append-to-body
      @saved="onActivityChanged"
    />
    <TrialBookingSignInDialog
      v-model:visible="signInDialog.visible"
      :booking="signInDialog.booking"
      append-to-body
      @updated="load"
    />
    <BatchScheduleDialog
      v-model:visible="scheduleDialog.visible"
      :bookings="scheduleDialog.bookings"
      :single-mode="true"
      append-to-body
      @scheduled="onScheduled"
    />
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { childLeadApi } from '@/api/childLead'
import { trialBookingApi } from '@/api/trialBooking'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import { handleRemoveError } from '@/utils/removable'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import {
  CHILD_LEAD_STATUS_LABEL, CHILD_LEAD_STATUS_TAG_TYPE,
  TRIAL_BOOKING_STATUS_LABEL, TRIAL_BOOKING_STATUS_TAG_TYPE,
  PARENT_LIFECYCLE_LABEL, PARENT_LIFECYCLE_TAG_TYPE,
  LEAD_ACTIVITY_TYPE_LABEL, GENDER_LABEL
} from '@/utils/constants'
import ActivityCreateDialog from './ActivityCreateDialog.vue'
import ActivityEditDialog from './ActivityEditDialog.vue'
import TrialBookingSignInDialog from './TrialBookingSignInDialog.vue'
import BatchScheduleDialog from './BatchScheduleDialog.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  childLeadId: { type: String, default: null }
})
const emit = defineEmits(['update:visible', 'updated', 'open-edit', 'open-parent', 'open-sibling'])

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => !!authStore.user?.isPlatformAdmin)
const hasPerm = (code) => hasPermInOrg(authStore, code)
const currentUserId = computed(() => authStore.user?._id || authStore.user?.id || null)

const loading = ref(false)
const acting = ref(false)
const child = ref(null)
const activities = ref([])
const bookings = ref([])
const activeTab = ref('activities')

const createActivityDialog = reactive({ visible: false, childLeadId: null, childName: '' })
const editActivityDialog = reactive({ visible: false, childLeadId: null, activity: null })
const signInDialog = reactive({ visible: false, booking: null })
const scheduleDialog = reactive({ visible: false, bookings: [] })

const dialogTitle = computed(() => child.value ? `孩子详情 - ${child.value.name}` : '孩子详情')

// 触点添加入口: recruit.write + 非 converted/lost
const canAddActivity = computed(() => {
  if (!hasPerm('recruit.write')) return false
  if (!child.value) return false
  return !['converted', 'lost'].includes(child.value.status)
})

// 排一次试听按钮: 仅当存在 awaiting_schedule 的预约
const canSchedule = computed(() => bookings.value.some((b) => b.status === 'awaiting_schedule'))

// 同家长下其他孩子 (排除自己; 用于 siblings 段, 点击切换到该孩子的详情)
const siblings = computed(() => {
  const arr = child.value?.siblings || []
  return arr.filter((s) => s._id !== child.value?._id)
})

// 24h 编辑窗口, 与后端 ACTIVITY_EDIT_WINDOW_MS 对齐
const ACTIVITY_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000
function canEditActivity(a) {
  if (isPlatformAdmin.value) return true
  if (!currentUserId.value) return false
  const ownerId = a.byUser?._id || a.byUser
  if (String(ownerId) !== String(currentUserId.value)) return false
  const ts = new Date(a.at || a.createdAt).getTime()
  return (Date.now() - ts) <= ACTIVITY_EDIT_WINDOW_MS
}

watch(() => props.visible, async (v) => {
  if (v && props.childLeadId) {
    activeTab.value = 'activities'
    await load()
  } else {
    // 关闭时清掉数据, 下次打开重新加载
    child.value = null
    activities.value = []
    bookings.value = []
  }
}, { immediate: true })

// 兄弟孩子切换: 父级直接更新 props.childLeadId, 这里响应后 reload
watch(() => props.childLeadId, async (newId, oldId) => {
  if (!props.visible) return
  if (!newId || newId === oldId) return
  await load()
})

async function load() {
  if (!props.childLeadId) return
  loading.value = true
  try {
    await Promise.all([loadChild(), loadActivities(), loadBookings()])
    // 如果外部打开时子 ID 已经切换 (sibling 点击), 不重复 emit
  } catch (e) {
    // 错误已由 axios 拦截器统一处理
  } finally {
    loading.value = false
  }
}

async function loadChild() {
  const r = await childLeadApi.detail(props.childLeadId)
  child.value = r.data
}

async function loadActivities() {
  const r = await childLeadApi.listActivities(props.childLeadId)
  activities.value = Array.isArray(r.data) ? r.data : (r.data?.items || [])
}

async function loadBookings() {
  // 用 trialBookingApi.list({ preStudent }) 拉该孩子的所有预约
  const r = await trialBookingApi.list({ preStudent: props.childLeadId, pageSize: 50 })
  bookings.value = r.data?.items || []
}

// === 标签 / 文本辅助 ===
function statusLabel(s) { return CHILD_LEAD_STATUS_LABEL[s] || s || '-' }
function statusTagType(s) { return CHILD_LEAD_STATUS_TAG_TYPE[s] || '' }
function lifecycleLabel(s) { return PARENT_LIFECYCLE_LABEL[s] || s || '-' }
function lifecycleTagType(s) { return PARENT_LIFECYCLE_TAG_TYPE[s] || '' }
function activityTypeLabel(t) { return LEAD_ACTIVITY_TYPE_LABEL[t] || t || '-' }
function genderLabel(g) { return GENDER_LABEL[g] || g || '-' }
function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}

// === 触点 ===
function openCreateActivity() {
  createActivityDialog.childLeadId = props.childLeadId
  createActivityDialog.childName = child.value?.name || ''
  createActivityDialog.visible = true
}
function openEditActivity(a) {
  editActivityDialog.childLeadId = props.childLeadId
  editActivityDialog.activity = a
  editActivityDialog.visible = true
}
async function onActivityChanged() {
  await load()
  emit('updated')
}
async function onRemoveActivity(a, { password }) {
  acting.value = true
  try {
    await childLeadApi.removeActivity(props.childLeadId, a._id, { password })
    ElMessage.success('已删除触点')
    await load()
    emit('updated')
  } catch (e) {
    await handleRemoveError(e, '无法删除触点', `触点 ${activityTypeLabel(a.type)} (${formatTime(a.at)})`)
  } finally {
    acting.value = false
  }
}

// === 撤销转化 ===
async function onUnconvert() {
  const ok = await ElMessageBox.confirm(
    `撤销 ${child.value?.name} 的转化? (5 分钟内有效)`,
    '撤销转化',
    { type: 'warning' }
  ).catch(() => null)
  if (!ok) return
  acting.value = true
  try {
    await childLeadApi.unconvert(props.childLeadId)
    ElMessage.success('已撤销')
    await load()
    emit('updated')
  } finally {
    acting.value = false
  }
}

// === 试听操作 ===
function openSignIn(row) {
  signInDialog.booking = row
  signInDialog.visible = true
}

async function onConvert(row) {
  // 转化两步式: 先 preview 拿提示/initialPassword, 再 confirm
  const ok = await ElMessageBox.confirm(
    `确认将 ${child.value?.name} 转为正式学员?\n将创建家长账号 (User) 和学员档案 (Student)。`,
    '试听转学员',
    { type: 'success' }
  ).catch(() => null)
  if (!ok) return
  acting.value = true
  try {
    await trialBookingApi.convert(row._id)
    ElMessage.success('已转化')
    await load()
    emit('updated')
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '转化失败'
    ElMessage.error(`转化失败: ${msg}`)
  } finally {
    acting.value = false
  }
}

function openSchedule() {
  // 仅传 awaiting_schedule 的预约; 后端 batchSchedule 接受 1 条也工作
  scheduleDialog.bookings = bookings.value.filter((b) => b.status === 'awaiting_schedule')
  scheduleDialog.visible = true
}

async function onScheduled() {
  // 排课后状态变为 scheduled, 重拉 bookings
  await loadBookings()
  emit('updated')
}

// === 删除孩子 (超管) ===
async function onRemove({ password }) {
  acting.value = true
  try {
    await childLeadApi.remove(props.childLeadId, { password })
    ElMessage.success(`已删除孩子「${child.value?.name}」`)
    emit('updated')
    emit('update:visible', false)
  } catch (e) {
    await handleRemoveError(e, '无法删除孩子', `孩子 ${child.value?.name}`)
  } finally {
    acting.value = false
  }
}

// === 同家长兄弟孩子切换 ===
// 父级需要 v-model:child-lead-id 才能响应 props.childLeadId 变化; 否则只是 navigate 到该孩子页面
// v1 简化: emit 让父级 (ChildLeads.vue) 切换 detailDialog.childLeadId, 触发 reload
function onOpenSibling(s) {
  if (!s?._id) return
  emit('open-sibling', s)
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
.header-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ml { margin-left: 8px; }
.mb { margin-bottom: 12px; }
.meta { color: #909399; font-size: 12px; }
.muted { color: #909399; font-size: 12px; }
.empty { padding: 20px; text-align: center; color: #909399; }

.siblings { line-height: 28px; }
.sib { cursor: pointer; }

/* 触点卡片 hover 时才显示操作条 */
.el-timeline-item .activity-actions {
  display: inline-block;
  margin-left: 8px;
  opacity: 0;
  transition: opacity 0.15s;
}
.el-timeline-item:hover .activity-actions { opacity: 1; }

.timeline-tabs { margin-top: 8px; }
</style>