<template>
  <div class="page" v-loading="loading">
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
        <el-button v-if="canDelete" type="danger" @click="onDelete">删除</el-button>
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
            <div v-for="it in items" :key="it._id" class="items__row">
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
          <template #header><b>标签</b></template>
          <div>
            <el-tag v-for="t in (task.tags || [])" :key="t" size="small" style="margin-right: 4px">{{ t }}</el-tag>
            <span v-if="!task.tags || task.tags.length === 0" class="empty">—</span>
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

    <DestructiveConfirm ref="dcRef" entity-label="任务" @confirm="doDelete" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import {
  TASK_STATUS_LABELS, TASK_TYPE_LABELS, TASK_PRIORITY_LABELS,
  TASK_ASSIGNEE_STATUS_LABELS, TASK_REVIEW_RESULT_LABELS
} from '@shared/enums.mjs'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'

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
const cancelSaving = ref(false)

const dcRef = ref(null)

// 权限
const myId = computed(() => String(auth.user?.id || ''))
const isCreator = computed(() => String(task.value.creator?._id || task.value.creator) === myId.value)
const isAssignee = computed(() => (task.value.assignees || []).some((a) => String(a.user?._id || a.user) === myId.value))
const isSupervisor = computed(() => (task.value.supervisors || []).some((s) => String(s._id || s) === myId.value))
const isFinal = computed(() => ['approved', 'cancelled', 'expired'].includes(task.value.status))

const canSubmit = computed(() => isAssignee.value && !isFinal.value && task.value.status !== 'submitted')
const canReview = computed(() => isSupervisor.value && task.value.status === 'submitted')
const canCancel = computed(() => (isCreator.value || hasPermInOrg(auth, 'task.write')) && !isFinal.value)
const canDelete = computed(() => hasPermInOrg(auth, 'task.delete'))
const canEdit = computed(() => (isCreator.value || hasPermInOrg(auth, 'task.write')) && !isFinal.value)

function priorityTagType(p) { return { urgent: 'danger', high: 'warning', normal: 'primary', low: 'info' }[p] || '' }
function statusTagType(s) {
  return {
    draft: 'info', assigned: 'primary', in_progress: 'warning', partial_submitted: 'warning',
    submitted: 'success', approved: 'success', rejected: 'danger', expired: 'danger', cancelled: 'info'
  }[s] || ''
}
function reviewType(r) { return { approved: 'success', rejected: 'danger', requested_changes: 'warning' }[r] || '' }
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

async function loadDetail() {
  loading.value = true
  try {
    const r = await taskApi.detail(route.params.id)
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

async function onDelete() {
  const check = await taskApi.removableCheck(route.params.id)
  if (!check.canRemove) {
    ElMessage.warning(check.blockers.map((b) => b.hint).join('；'))
    return
  }
  dcRef.value.open({ _id: route.params.id })
}
async function doDelete({ password }) {
  await taskApi.remove(route.params.id, { password })
  ElMessage.success('已删除')
  router.replace('/tasks')
}

onMounted(loadDetail)
</script>

<style scoped>
.page { padding: 16px; }
.page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.meta { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.meta__item { color: #909399; font-size: 13px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.block { margin-bottom: 12px; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.desc { white-space: pre-wrap; color: #303133; }
.items { display: flex; flex-direction: column; gap: 8px; }
.items__row { display: flex; gap: 8px; align-items: center; }
.items__row span.done { text-decoration: line-through; color: #909399; }
.items__meta { font-size: 12px; color: #909399; }
.items__empty { color: #c0c4cc; padding: 8px; }
.items__progress { margin-top: 12px; }
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