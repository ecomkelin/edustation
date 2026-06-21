<template>
  <div class="points-summary">
    <div class="points-summary-row">
      <div class="points-summary-label">当前积分</div>
      <div class="points-summary-value">
        <span v-if="loading" class="muted">加载中…</span>
        <span v-else-if="error" class="error">—</span>
        <span v-else class="big">{{ formatNumber(account.balance) }}</span>
        <span class="unit">分</span>
      </div>
      <div class="points-summary-meta">
        <span v-if="account.lastTransactionAt">
          最近活跃: {{ formatDate(account.lastTransactionAt) }}
        </span>
        <span v-else class="muted">尚无流水</span>
      </div>
      <div class="points-summary-actions">
        <el-button size="small" @click="goToList">查看流水</el-button>
        <el-button
          v-if="canWrite"
          size="small"
          type="primary"
          :loading="adjusting"
          @click="onAdjust"
        >调整积分</el-button>
      </div>
    </div>
    <PointsAdjustDialog
      v-if="student && student.id"
      v-model:visible="adjustDialogVisible"
      :student="student"
      @saved="onAdjustSaved"
    />
  </div>
</template>

<script setup>
/**
 * 学生积分摘要 (2026-06-21 新增)
 *
 * 用于嵌入学生画像 dialog 顶部：
 *   - 显示当前积分余额 + 最近活跃时间
 *   - "查看流水" 按钮 → 跳 /points?studentId=<id> 主页
 *   - "调整积分" 按钮 → 打开 PointsAdjustDialog（仅当用户有 points.write）
 *
 * 数据懒加载：visible=true 后才请求积分账户，节省无关场景的请求。
 */
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { pointsAdminApi } from '@/api/pointsAdmin'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import PointsAdjustDialog from '@/views/points/PointsAdjustDialog.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  student: { type: Object, default: null }
})
const emit = defineEmits(['updated'])

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const error = ref(false)
const adjusting = ref(false)
const adjustDialogVisible = ref(false)
const account = reactive({
  balance: 0,
  totalEarned: 0,
  totalSpent: 0,
  lastTransactionAt: null
})

const canWrite = computed(() => hasPermInOrg(auth, 'points.write'))

function formatNumber(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN')
}

function formatDate(t) {
  if (!t) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load() {
  if (!props.student || !props.student.id) return
  loading.value = true
  error.value = false
  try {
    const r = await pointsAdminApi.getAccount(props.student.id)
    Object.assign(account, {
      balance: r.data.account?.balance || 0,
      totalEarned: r.data.account?.totalEarned || 0,
      totalSpent: r.data.account?.totalSpent || 0,
      lastTransactionAt: r.data.account?.lastTransactionAt || null
    })
  } catch (e) {
    error.value = true
    // 错误已由 axios 拦截器弹
  } finally {
    loading.value = false
  }
}

function goToList() {
  if (!props.student || !props.student.id) return
  router.push({ path: '/points', query: { studentId: props.student.id, tab: 'transactions' } })
}

function onAdjust() {
  if (!canWrite.value) {
    ElMessage.warning('无 points.write 权限')
    return
  }
  adjustDialogVisible.value = true
}

async function onAdjustSaved() {
  await load()
  emit('updated')
}

watch(
  () => [props.visible, props.student?.id],
  async ([vis, id]) => {
    if (vis && id) await load()
  },
  { immediate: true }
)
</script>

<style scoped>
.points-summary {
  background: #f5f7fa;
  border-radius: 4px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.points-summary-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.points-summary-label {
  color: #999;
  font-size: 13px;
}
.points-summary-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.points-summary-value .big {
  font-size: 22px;
  font-weight: 700;
  color: #f56c6c;
}
.points-summary-value .unit {
  color: #999;
  font-size: 12px;
}
.points-summary-meta {
  color: #606266;
  font-size: 12px;
  flex: 1;
  min-width: 0;
}
.points-summary-actions {
  display: flex;
  gap: 8px;
}
.muted { color: #999; }
.error { color: #f56c6c; }
</style>
