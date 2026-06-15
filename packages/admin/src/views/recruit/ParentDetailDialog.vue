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
            重算 lifecycle
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
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="openChildEdit(row)">编辑</el-button>
            <el-button size="small" link @click="openChildDetail(row)">详情</el-button>
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

      <!-- 触点时间线 (聚合该家长下所有孩子的触点) -->
      <el-divider content-position="left">
        <span>触点时间线 ({{ parent.activities?.length || 0 }})</span>
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
        </el-timeline-item>
      </el-timeline>
    </div>

    <!-- 加孩子子 dialog -->
    <ChildLeadEditDialog
      v-model:visible="addChildDialog.visible"
      :parent="parent"
      @saved="onChildAdded"
    />

    <!-- 编辑单个孩子子 dialog -->
    <ChildLeadEditDialog
      v-model:visible="editChildDialog.visible"
      :parent="parent"
      :child-lead="editChildDialog.childLead"
      @saved="onChildEdited"
    />

    <!-- 编辑家长档案子 dialog -->
    <ParentEditDialog
      v-model:visible="editParentDialog.visible"
      :parent="parent"
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
          <div class="tag-section-title">可选标签 (LeadTag 字典)</div>
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
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
    ElMessage.success(`lifecycle = ${r.data?.lifecycle || ''}`)
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
  editChildDialog.childLead = child
  editChildDialog.visible = true
}

async function onChildEdited() {
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
</style>
