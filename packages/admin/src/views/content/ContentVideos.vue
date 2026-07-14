<!--
  科普视频管理 (admin 端)
  R-3804 list / R-3805 create / R-3806 update / R-3807 soft delete (前端 2026-07-04 已删「下架」)
  R-3808 adminStats + R-3809 adminRowStats 顶部 KPI + 每行 stats
-->
<template>
  <div class="page">
    <h2>科普视频</h2>
    <p class="subtitle">
      平台科普视频 (2026-07-14 内容回退 platform-only), C 端家长在「探索」Tab 观看。仅平台超管可发布/编辑。草稿/发布切换在编辑弹窗中操作。
    </p>

    <!-- 顶部 KPI Bar (2026-07-04) -->
    <el-row :gutter="12" class="kpi-row" v-loading="statsLoading">
      <el-col :xs="12" :sm="6">
        <KpiCard label="事件总数" :value="fmtNumber(stats.totalEvents)" extra="视频播放次数 + durationMs 上报" unit="次" accent="blue" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="独立孩子观众" :value="fmtNumber(stats.uniqueStudents)" extra="按 activeStudentId 去重" unit="人" accent="green" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="累计观看时长" :value="fmtMsCompact(stats.totalMs)" accent="orange" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="时间窗" :value="rangeLabel" />
      </el-col>
    </el-row>

    <el-card class="card">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="搜索标题..." style="width: 240px" clearable @keyup.enter="loadAll" />
        <el-select v-model="filter" placeholder="上下架" clearable style="width: 140px" @change="loadAll">
          <el-option label="已发布" value="true" />
          <el-option label="草稿" value="false" />
        </el-select>
        <el-select v-model="range" placeholder="时间范围" style="width: 140px" @change="loadAll">
          <el-option label="今天" value="today" />
          <el-option label="近 7 天" value="week" />
          <el-option label="本月" value="month" />
        </el-select>
        <el-button @click="loadAll">刷新</el-button>
        <el-button type="primary" @click="openCreate">+ 新建视频</el-button>
      </div>

      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column label="emoji封面" width="80" fixed="left">
          <template #default="{ row }">
            <text style="font-size: 24px;">{{ row.meta?.coverEmoji || '🎬' }}</text>
          </template>
        </el-table-column>
        <!-- 2026-07-04: emoji + 标题 一起固定在左边; 未发布(草稿) 标题灰色 -->
        <el-table-column label="标题" min-width="180" fixed="left">
          <template #default="{ row }">
            <span :class="{ 'name-draft': !row.isPublished }">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="intro" label="简介" min-width="220" show-overflow-tooltip />
        <el-table-column label="分类" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.category" size="small">{{ row.category }}</el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="标签" width="220">
          <template #default="{ row }">
            <el-tag
              v-for="t in (row.tags || []).slice(0, 3)"
              :key="t"
              size="small"
              style="margin-right: 4px;"
            >
              {{ t }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时长" width="100" align="center">
          <template #default="{ row }">{{ formatDuration(row.durationSeconds) }}</template>
        </el-table-column>
        <el-table-column label="播放" width="100" align="center">
          <template #default="{ row }">{{ fmtNumber(row.viewCount || 0) }}</template>
        </el-table-column>
        <!-- 2026-07-04: per-row 两列 stats -->
        <el-table-column label="独立观众" width="100" align="center">
          <template #default="{ row }">
            <span :class="{ 'kpi-zero': !row._stats?.uniqueStudents }">
              {{ fmtNumber(row._stats?.uniqueStudents || 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="累计时长" width="120" align="center">
          <template #default="{ row }">
            {{ fmtMsCompact(row._stats?.totalMs || 0) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.isPublished" size="small" type="success">已发布</el-tag>
            <el-tag v-else size="small" type="info">草稿</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <DestructiveConfirm
              v-if="isPlatformAdmin"
              :target="`科普视频 ${row.title}`"
              warning="高风险"
              :precheck-notes="['无 C 端用户行为事件 (播放/观看时长记录) 引用']"
              :precheck="() => videoApi.removableCheck(row._id).then((r) => r.data)"
              @confirm="(p) => onRemoveConfirm(row, p)"
            >
              <el-button size="small" type="danger" link>误操删除</el-button>
            </DestructiveConfirm>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!items.length && !loading" class="empty">
        还没有视频, 点右上「+ 新建视频」开始
      </div>
    </el-card>

    <ContentVideoEditDialog v-model="dialogVisible" :initial-data="editingDoc" @saved="onSaved" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { videoApi } from '@/api/video'
import KpiCard from '@/components/KpiCard.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { useAuthStore } from '@/stores/auth'
import { handleRemoveError } from '@/utils/removable'
import ContentVideoEditDialog from './ContentVideoEditDialog.vue'
import { fmtNumber, fmtMsCompact } from '@/utils/format'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const items = ref([])
const loading = ref(false)
const statsLoading = ref(false)
const keyword = ref('')
const filter = ref('')
const range = ref('month')
const dialogVisible = ref(false)
const editingDoc = ref(null)
const stats = ref({ totalEvents: 0, uniqueStudents: 0, totalMs: 0 })

const rangeLabel = computed(() => {
  if (range.value === 'today') return '今天'
  if (range.value === 'week') return '近 7 天'
  if (range.value === 'month') return '本月'
  return '全部'
})

function formatDuration(s) {
  if (!s || s <= 0) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

async function loadStats() {
  statsLoading.value = true
  try {
    const res = await videoApi.adminStats({ range: range.value })
    if (res?.data) Object.assign(stats.value, res.data)
  } catch (e) {
    console.warn('[ContentVideos.loadStats]', e)
  } finally {
    statsLoading.value = false
  }
}

async function loadList() {
  loading.value = true
  try {
    const params = { pageSize: 50 }
    if (keyword.value) params.keyword = keyword.value
    if (filter.value) params.isPublished = filter.value
    const res = await videoApi.adminList(params)
    const list = res.data?.items || []
    const rowStatsRes = await videoApi.adminRowStats({ range: range.value })
    const rowStats = rowStatsRes?.data || {}
    items.value = list.map(it => ({
      ...it,
      _stats: rowStats[it._id] || { totalEvents: 0, uniqueStudents: 0, totalMs: 0 }
    }))
  } catch (e) {
    console.warn('[ContentVideos.loadList]', e)
    items.value = []
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  await Promise.all([loadList(), loadStats()])
}

function openCreate() {
  editingDoc.value = null
  dialogVisible.value = true
}
function openEdit(row) {
  editingDoc.value = row
  dialogVisible.value = true
}
function onSaved() {
  dialogVisible.value = false
  loadAll()
}

// 2026-07-04: 超管专属物理删除 (走 DestructiveConfirm + 后端 requirePlatformPassword)
async function onRemoveConfirm(row, { password }) {
  try {
    await videoApi.purge(row._id, { password })
    ElMessage.success('已删除')
    loadAll()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 高风险', `科普视频 ${row.title}`)
  }
}

onMounted(loadAll)
</script>

<style lang="scss" scoped>
.page { padding: 16px; }
.subtitle { color: #666; font-size: 13px; margin: 4px 0 16px; }
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.kpi-row { margin-bottom: 12px; }
.kpi-zero { color: #c0c4cc; }
.name-draft { color: #c0c4cc; }   // 草稿/下架 标题灰色
.empty { padding: 60px; text-align: center; color: #999; }
.muted { color: #bbb; font-size: 12px; }
</style>
