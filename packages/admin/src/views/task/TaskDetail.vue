<template>
  <div class="page" v-loading="loading">
    <!-- 2026-07-08: 归档态顶部 banner 提醒, 操作按钮全禁用 -->
    <el-alert v-if="task.archived" type="warning" show-icon :closable="false" class="archive-banner"
      title="该任务已归档"
      description="所有写操作 (编辑/提交/审批/取消/勾选/评论) 已被后端拦截, 如需修改请先「取消归档」。">
    </el-alert>
    <div class="page__header">
      <div>
        <h2>{{ task.title }}</h2>
        <div class="meta">
          <el-tag :type="priorityTagType(task.priority)" size="small">{{ priorityLabels[task.priority] }}</el-tag>
          <el-tag :type="statusTagType(task.status)" size="small">{{ statusLabels[task.status] }}</el-tag>
          <span class="meta__item">类型: {{ typeLabels[task.type] || task.type }}</span>
          <span class="meta__item">到期: <span :class="{ overdue: isOverdue() }">{{ formatDate(task.dueAt) }}</span></span>
          <span class="meta__item">创建: {{ formatDate(task.createdAt) }}</span>
        </div>
      </div>
      <div class="actions">
        <el-button v-if="canSubmit" type="primary" @click="onSubmit">提交完成</el-button>
        <el-button v-if="canReview" type="success" @click="openReview('approved')">通过</el-button>
        <el-button v-if="canReview" type="warning" @click="openReview('rejected')">打回</el-button>
        <el-button v-if="canCancel" @click="openCancel">取消任务</el-button>
        <!-- 2026-07-08: 归档按钮 (task.delete 权限) -->
        <el-button v-if="canDelete && !task.archived" type="warning" plain @click="onArchive">归档</el-button>
        <el-button v-if="canDelete && task.archived" plain @click="onUnarchive">取消归档</el-button>
        <!-- 物理删除 — 走 DestructiveConfirm slot 范式 (组件内自带 precheck + 输密码) -->
        <DestructiveConfirm
          v-if="canDelete"
          target="任务"
          warning="中风险"
          :precheck-notes="['任务下 checklist 已清空', '无外部业务引用']"
          :precheck="() => taskApi.removableCheck(route.params.id).then((r) => r.data)"
          @confirm="doDelete"
        >
          <el-button type="danger">删除</el-button>
        </DestructiveConfirm>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="16">
        <!-- 描述 -->
        <el-card class="block">
          <template #header><b>描述</b></template>
          <div class="desc">{{ task.description || '—' }}</div>
        </el-card>

        <!-- Checklist -->
        <el-card class="block">
          <template #header>
            <div class="card-head">
              <b>checklist ({{ items.filter(i => i.done).length }}/{{ items.length }})</b>
              <el-button v-if="canEdit" size="small" :icon="Plus" @click="openAddItem">添加条目</el-button>
            </div>
          </template>
          <div class="items">
            <div v-for="it in items" :key="it._id" class="items__block">
              <div class="items__row">
                <el-checkbox
                  :model-value="it.done"
                  :disabled="!canToggleItem(it)"
                  @change="(v) => onToggleItem(it, v)" />
                <span :class="{ done: it.done }">{{ it.title }}</span>
                <el-tag size="small" effect="plain">
                  {{ userName(it.assignee) }}
                </el-tag>
                <span v-if="it.done && it.doneBy" class="items__meta">
                  ✓ {{ userName(it.doneBy) }} · {{ formatDate(it.doneAt) }}
                </span>
                <el-button
                  v-if="canRemoveItem(it)"
                  size="small"
                  type="danger"
                  link
                  :icon="Delete"
                  :loading="itemRemovingId === it._id"
                  @click="onRemoveItem(it)" />
              </div>
              <!--
                2026-07-09: 子任务备注 (规则 3b) — 执行人对自己负责的条目在执行中仍可加备注
                  仅展示给本条目执行人 + task.write 持有者; 输入框紧跟条目下方,
                  既不抢占主表横向空间, 也不打断 checklist 的勾选节奏
              -->
              <div class="items__remarks">
                <div v-for="r in (it.remarks || [])" :key="r._id" class="items__remark">
                  <b>{{ userName(r.author) }}</b>
                  <span class="items__remark-time">{{ formatDate(r.createdAt) }}</span>
                  <div class="items__remark-body">{{ r.content }}</div>
                </div>
                <div v-if="canAddItemRemark(it)" class="items__remark-input">
                  <el-input
                    v-model="remarkDrafts[it._id]"
                    type="textarea"
                    :rows="1"
                    maxlength="2000"
                    show-word-limit
                    placeholder="加备注 (例: 进度 50%, 还差 2 个文件)"
                    @keydown.enter.exact.prevent="onAddItemRemark(it)" />
                  <el-button
                    size="small"
                    type="primary"
                    :loading="remarkSavingId === it._id"
                    :disabled="!(remarkDrafts[it._id] && remarkDrafts[it._id].trim())"
                    @click="onAddItemRemark(it)"
                  >保存备注</el-button>
                </div>
              </div>
            </div>
            <div v-if="items.length === 0" class="items__empty">暂无条目</div>
          </div>
          <el-progress :percentage="task.progress || 0" :stroke-width="6" class="items__progress" />
        </el-card>

        <!-- 核查历史 -->
        <el-card class="block">
          <template #header><b>核查历史</b></template>
          <el-timeline v-if="reviews.length > 0">
            <el-timeline-item v-for="r in reviews" :key="r._id"
              :timestamp="formatDate(r.reviewedAt)" :type="reviewType(r.result)">
              <b>{{ reviewLabel(r.result) }}</b>
              <span v-if="r.reviewer"> — {{ userName(r.reviewer) }}</span>
              <div v-if="r.comment" class="review-comment">{{ r.comment }}</div>
            </el-timeline-item>
          </el-timeline>
          <div v-else class="empty">暂无核查记录</div>
        </el-card>

        <!-- 评论 -->
        <el-card class="block">
          <template #header><b>评论 ({{ comments.length }})</b></template>
          <div class="comments">
            <div v-for="c in comments" :key="c._id" class="comment">
              <div class="comment__head">
                <b>{{ userName(c.author) }}</b>
                <span class="comment__time">{{ formatDate(c.createdAt) }}</span>
              </div>
              <div class="comment__body">{{ c.content }}</div>
            </div>
            <div v-if="comments.length === 0" class="empty">暂无评论</div>
          </div>
          <div class="comment-input">
            <el-input v-model="newComment" type="textarea" :rows="2" maxlength="2000" placeholder="说点什么..." />
            <el-button type="primary" :loading="commentSaving" @click="onAddComment" style="margin-top: 8px">发送</el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <!-- 元信息 -->
        <el-card class="block">
          <template #header><b>人员</b></template>
          <div class="info">
            <div class="info__row">
              <span class="info__label">发起人</span>
              <span>{{ userName(task.creator) }}</span>
            </div>
            <div class="info__row">
              <span class="info__label">执行人</span>
              <div class="info__value">
                <el-tag v-for="a in task.assignees" :key="a.user._id || a.user"
                  size="small" :type="a.status === 'submitted' ? 'success' : (a.status === 'in_progress' ? 'warning' : 'info')"
                  effect="plain">
                  {{ userName(a.user) }} ({{ assigneeStatusLabel(a.status) }})
                </el-tag>
              </div>
            </div>
            <div class="info__row">
              <span class="info__label">监督人</span>
              <div class="info__value">
                <el-tag v-for="s in task.supervisors" :key="s._id || s" size="small">
                  {{ userName(s) }}
                </el-tag>
              </div>
            </div>
            <div v-if="task.fromTemplate" class="info__row">
              <span class="info__label">来源</span>
              <el-tag size="small" type="info">周期模板</el-tag>
            </div>
          </div>
        </el-card>

        <el-card class="block">
          <template #header>
            <div class="card-header">
              <b>标签</b>
              <!-- 2026-08-06: tags 编辑入口 (P0.1) — 复用 TaskCreate 的 TagEditor; canEdit 已含 !isFinal -->
              <span v-if="canEdit && !tagEditing">
                <el-button link type="primary" size="small" @click="startEditTags">编辑</el-button>
              </span>
              <span v-else-if="tagEditing" class="tag-edit-actions">
                <el-button link type="primary" size="small" :loading="tagSaving" @click="saveTags">保存</el-button>
                <el-button link size="small" :disabled="tagSaving" @click="cancelEditTags">取消</el-button>
              </span>
            </div>
          </template>
          <!-- 只读模式 -->
          <div v-if="!tagEditing">
            <el-tag v-for="t in (task.tags || [])" :key="t" size="small" style="margin-right: 4px">{{ t }}</el-tag>
            <span v-if="!task.tags || task.tags.length === 0" class="empty">—</span>
          </div>
          <!-- 编辑模式 -->
          <div v-else>
            <TagEditor v-model="tagDraft" :max="30" :suggestions="tagOptions"
              placeholder="按 Enter 添加标签 (历史标签联想 + 后端统一清洗)" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 加条目对话框 -->
    <el-dialog v-model="addItemVisible" title="添加 checklist 条目" width="500px">
      <el-form :model="newItem" label-width="80px">
        <el-form-item label="内容" required>
          <el-input v-model="newItem.title" maxlength="200" />
        </el-form-item>
        <el-form-item label="分配给" required>
          <el-select v-model="newItem.assignee" style="width: 100%">
            <el-option v-for="a in task.assignees" :key="a.user._id || a.user"
              :label="userName(a.user)" :value="a.user._id || a.user" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addItemVisible = false">取消</el-button>
        <el-button type="primary" :loading="addItemSaving" @click="onAddItem">添加</el-button>
      </template>
    </el-dialog>

    <!-- 审批对话框 -->
    <el-dialog v-model="reviewVisible" :title="reviewResult === 'approved' ? '审批通过' : '打回任务'" width="500px">
      <el-form :model="reviewForm" label-width="80px">
        <el-form-item label="评语">
          <el-input v-model="reviewForm.comment" type="textarea" :rows="3" maxlength="2000" />
        </el-form-item>
        <el-form-item label="评分">
          <el-rate v-model="reviewForm.score" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button type="primary" :loading="reviewSaving" @click="onReview">确定</el-button>
      </template>
    </el-dialog>

    <!-- 取消对话框 -->
    <el-dialog v-model="cancelVisible" title="取消任务" width="400px">
      <el-form :model="cancelForm" label-width="80px">
        <el-form-item label="原因">
          <el-input v-model="cancelForm.reason" type="textarea" :rows="2" maxlength="500" placeholder="(可选)会作为评论留痕" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelVisible = false">不取消</el-button>
        <el-button type="primary" :loading="cancelSaving" @click="onCancel">确认取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import {
  TASK_STATUS_LABELS, TASK_TYPE_LABELS, TASK_PRIORITY_LABELS,
  TASK_ASSIGNEE_STATUS_LABELS, TASK_REVIEW_RESULT_LABELS
} from '@shared/enums.mjs'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import TagEditor from '@/components/TagEditor.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const statusLabels = TASK_STATUS_LABELS
const typeLabels = TASK_TYPE_LABELS
const priorityLabels = TASK_PRIORITY_LABELS

const task = ref({})
const items = ref([])
const reviews = ref([])
const comments = ref([])
const loading = ref(false)

const newComment = ref('')
const commentSaving = ref(false)

const addItemVisible = ref(false)
const newItem = ref({ title: '', assignee: '' })
const addItemSaving = ref(false)

const reviewVisible = ref(false)
const reviewResult = ref('approved')
const reviewForm = ref({ comment: '', score: 0 })
const reviewSaving = ref(false)

const cancelVisible = ref(false)
const cancelForm = ref({ reason: '' })

// 2026-08-06: tags 编辑状态 (P0.1) — 详情页内联编辑, 保存走 taskApi.update
const tagEditing = ref(false)
const tagDraft = ref([])
const tagSaving = ref(false)
// 2026-08-06 P1.2: 历史标签联想 (R-3925 /tasks/distinct-tags)
const tagOptions = ref([])

function startEditTags() {
  tagDraft.value = [...(task.value.tags || [])]
  tagEditing.value = true
}

function cancelEditTags() {
  tagEditing.value = false
  tagDraft.value = []
}

async function saveTags() {
  if (tagSaving.value) return
  tagSaving.value = true
  try {
    await taskApi.update(task.value._id, { tags: tagDraft.value })
    ElMessage.success('标签已保存')
    tagEditing.value = false
    await loadDetail()    // reload 拿到后端清洗后的最终值
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '保存失败')
  } finally {
    tagSaving.value = false
  }
}
const cancelSaving = ref(false)

// 权限
const myId = computed(() => String(auth.user?.id || ''))
const isCreator = computed(() => String(task.value.creator?._id || task.value.creator) === myId.value)
const isAssignee = computed(() => (task.value.assignees || []).some((a) => String(a.user?._id || a.user) === myId.value))
const isSupervisor = computed(() => (task.value.supervisors || []).some((s) => String(s._id || s) === myId.value))
const isFinal = computed(() => ['approved', 'cancelled', 'expired'].includes(task.value.status))

const canSubmit = computed(() => isAssignee.value && !isFinal.value && task.value.status !== 'submitted')
const canReview = computed(() => isSupervisor.value && task.value.status === 'submitted')
// 2026-07-11: 取消/归档/取消归档/物理删除 全部仅 platform admin 或 task creator
//   原 canCancel 用 task.write 兜底 → 老师持 task.write 也能取消别人任务, 是 bug
//   原 canDelete 用 task.delete → 任何持有者都能归档/删除别人的任务, 是 bug
const canCancel = computed(() => (isCreator.value || auth.isPlatformAdmin) && !isFinal.value)
const canDelete = computed(() => isCreator.value || auth.isPlatformAdmin)
const canEdit = computed(() => (isCreator.value || hasPermInOrg(auth, 'task.write')) && !isFinal.value)

function priorityTagType(p) { return { urgent: 'danger', high: 'warning', normal: 'primary', low: 'info' }[p] }
function statusTagType(s) {
  return {
    draft: 'info', assigned: 'primary', in_progress: 'warning', partial_submitted: 'warning',
    submitted: 'success', approved: 'success', rejected: 'danger', expired: 'danger', cancelled: 'info'
  }[s]
}
function reviewType(r) { return { approved: 'success', rejected: 'danger', requested_changes: 'warning' }[r] }
function reviewLabel(r) { return TASK_REVIEW_RESULT_LABELS[r] }
function assigneeStatusLabel(s) { return TASK_ASSIGNEE_STATUS_LABELS[s] || s }
function isOverdue() { return task.value.dueAt && new Date(task.value.dueAt) < new Date() && !isFinal.value }
function formatDate(d) { if (!d) return ''; return new Date(d).toLocaleString('zh-CN') }
function userName(u) {
  if (!u) return ''
  if (typeof u === 'string') return u.slice(-6)
  return u.realName || u.name || u.id || u._id || ''
}

function canToggleItem(it) {
  if (isFinal.value) return false
  // 条目本人 或 持有 task.write
  return String(it.assignee?._id || it.assignee) === myId.value || hasPermInOrg(auth, 'task.write')
}

// 2026-07-08: 允许删除条目的条件 — 与 service.removeItem 对齐
//   条目 assignee 本人 / 任务 creator / 平台超管 / task.write / task.delete 任一即可
//   (解死锁: creator 想删整个任务, 必先能清空它的 checklist; 已归档任务也得能删条目, 否则死锁)
//   2026-07-08 二改: 移除 `task.value.archived` guard — 已归档 + 终态任务的物理删除路径需要清空 checklist
function canRemoveItem(it) {
  if (isFinal.value) return false
  if (isCreator.value) return true
  if (String(it.assignee?._id || it.assignee) === myId.value) return true
  if (hasPermInOrg(auth, 'task.write')) return true
  if (hasPermInOrg(auth, 'task.delete')) return true
  return false
}

const itemRemovingId = ref(null)
async function onRemoveItem(it) {
  if (!confirm(`确认删除 checklist 条目「${it.title}」?`)) return
  itemRemovingId.value = it._id
  try {
    await taskApi.removeItem(route.params.id, it._id)
    ElMessage.success('已删除条目')
    await loadDetail()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '删除失败')
  } finally {
    itemRemovingId.value = null
  }
}

// ─── 子任务备注 (2026-07-09, 规则 3b) ─────────────────────
//   与 service.addItemRemark 权限对齐: 本条目 assignee 本人 OR task.write 持有者
//   不受"任务执行中"锁约束 — 这是规则 3b 的豁免口子
const remarkDrafts = reactive({})      // { [itemId]: string }
const remarkSavingId = ref(null)
function canAddItemRemark(it) {
  if (task.value.archived) return false
  if (isFinal.value) return false
  // 跟 canToggleItem 同语义 — 本条目 assignee 本人 / task.write
  return String(it.assignee?._id || it.assignee) === myId.value || hasPermInOrg(auth, 'task.write')
}
async function onAddItemRemark(it) {
  const content = (remarkDrafts[it._id] || '').trim()
  if (!content) return
  if (remarkSavingId.value) return
  remarkSavingId.value = it._id
  try {
    const r = await taskApi.addItemRemark(route.params.id, it._id, { content, mentions: [] })
    // 后端只回 _id + content + author + mentions + createdAt (无 populated author), 直接 push 进 item.remarks
    // items 是 ref([]) 深度响应式, 直接 push 触发响应式
    const saved = r.data || {}
    it.remarks = (it.remarks || []).concat([{
      _id: saved._id,
      author: auth.user?.id, // 即时显示, 详情重新 loadDetail 后会被 populate 替换
      content: saved.content,
      mentions: saved.mentions || [],
      createdAt: saved.createdAt
    }])
    remarkDrafts[it._id] = ''
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '备注失败')
  } finally {
    remarkSavingId.value = null
  }
}

async function loadDetail(opts = {}) {
  loading.value = true
  try {
    // 2026-07-08: includeArchived=true 当从归档 tab 跳过来时 query 上有, 否则不传 (默认 403 已归档)
    // 2026-07-11: opts.forceIncludeArchived 用于 onArchive/onUnarchive 后 reload, 此时任务已变更归档状态, 不带必 403
    const includeArchived = opts.forceIncludeArchived || route.query.includeArchived === 'true'
    const r = await taskApi.detail(route.params.id, { includeArchived })
    task.value = r.data || {}
    items.value = r.data?.items || []
    reviews.value = r.data?.reviews || []
    comments.value = r.data?.comments || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function onArchive() {
  await taskApi.archive(route.params.id)
  ElMessage.success('已归档')
  await loadDetail({ forceIncludeArchived: true })
}
async function onUnarchive() {
  await taskApi.unarchive(route.params.id)
  ElMessage.success('已取消归档')
  await loadDetail({ forceIncludeArchived: true })
}

async function onToggleItem(it, done) {
  try {
    await taskApi.toggleItem(route.params.id, it._id, { done })
    await loadDetail()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

async function onSubmit() {
  try {
    await taskApi.submit(route.params.id)
    ElMessage.success('已提交')
    await loadDetail()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '提交失败')
  }
}

function openReview(result) {
  reviewResult.value = result
  reviewForm.value = { comment: '', score: 0 }
  reviewVisible.value = true
}
async function onReview() {
  reviewSaving.value = true
  try {
    await taskApi.review(route.params.id, { result: reviewResult.value, ...reviewForm.value })
    ElMessage.success('已审批')
    reviewVisible.value = false
    await loadDetail()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '审批失败')
  } finally {
    reviewSaving.value = false
  }
}

function openCancel() { cancelForm.value = { reason: '' }; cancelVisible.value = true }
async function onCancel() {
  cancelSaving.value = true
  try {
    await taskApi.cancel(route.params.id, cancelForm.value)
    ElMessage.success('已取消')
    cancelVisible.value = false
    await loadDetail()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '取消失败')
  } finally {
    cancelSaving.value = false
  }
}

async function onAddComment() {
  if (!newComment.value.trim()) return
  commentSaving.value = true
  try {
    await taskApi.addComment(route.params.id, { content: newComment.value, mentions: [] })
    newComment.value = ''
    await loadDetail()
  } finally {
    commentSaving.value = false
  }
}

function openAddItem() {
  newItem.value = { title: '', assignee: task.value.assignees?.[0]?.user?._id || task.value.assignees?.[0]?.user || '' }
  addItemVisible.value = true
}
async function onAddItem() {
  if (!newItem.value.title || !newItem.value.assignee) {
    ElMessage.warning('请填写内容和分配人')
    return
  }
  addItemSaving.value = true
  try {
    await taskApi.addItem(route.params.id, newItem.value)
    addItemVisible.value = false
    await loadDetail()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '添加失败')
  } finally {
    addItemSaving.value = false
  }
}

// 物理删除 — DestructiveConfirm slot 自带 precheck + 输密码, 这里只接 confirm
//   走 R-3904 (requirePermission('task.delete') + requireBodyPassword + service 校验 creator/超管)
async function doDelete({ password }) {
  await taskApi.remove(route.params.id, { password })
  ElMessage.success('已删除')
  router.replace('/tasks')
}

onMounted(async () => {
  await loadDetail()
  // 2026-08-06 P1.2: 加载历史标签, 给 TagEditor suggestions 用 (编辑态联想)
  try {
    const r = await taskApi.distinctTags()
    tagOptions.value = Array.isArray(r.data) ? r.data : []
  } catch (_) { /* 静默 */ }
})
</script>

<style scoped>
.page { padding: 16px; }
.archive-banner { margin-bottom: 12px; }
.page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.meta { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.meta__item { color: #909399; font-size: 13px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.block { margin-bottom: 12px; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.desc { white-space: pre-wrap; color: #303133; }
.items { display: flex; flex-direction: column; gap: 12px; }
.items__block { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border-radius: 4px; }
.items__block:hover { background: #fafbfc; }
.items__row { display: flex; gap: 8px; align-items: center; }
.items__row span.done { text-decoration: line-through; color: #909399; }
.items__meta { font-size: 12px; color: #909399; }
.items__empty { color: #c0c4cc; padding: 8px; }
.items__progress { margin-top: 12px; }
/* 2026-07-09: 子任务备注 UI (规则 3b) */
.items__remarks { margin-left: 28px; display: flex; flex-direction: column; gap: 4px; }
.items__remark { font-size: 12px; color: #606266; padding: 2px 0; }
.items__remark-time { color: #909399; margin-left: 8px; }
.items__remark-body { white-space: pre-wrap; margin-top: 2px; }
.items__remark-input { display: flex; gap: 6px; align-items: flex-start; margin-top: 4px; }
.items__remark-input :deep(.el-textarea__inner) { min-height: 28px !important; padding: 4px 8px !important; font-size: 12px; }
.empty { color: #c0c4cc; padding: 8px; }
.overdue { color: #f56c6c; font-weight: 500; }
.info__row { margin-bottom: 8px; display: flex; align-items: flex-start; gap: 8px; }
.info__label { color: #909399; min-width: 60px; font-size: 13px; }
.info__value { display: flex; flex-wrap: wrap; gap: 4px; }
.comments { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
.comment__head { display: flex; justify-content: space-between; margin-bottom: 4px; }
.comment__time { color: #909399; font-size: 12px; }
.comment__body { color: #303133; }
.comment-input { margin-top: 8px; }
.review-comment { color: #606266; margin-top: 4px; }
</style>