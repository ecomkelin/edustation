<!--
  科普文章管理 (admin 端)
  R-3602 list / R-3603 create / R-3604 update / R-3605 soft delete (前端 2026-07-04 已删除「下架」按钮)
  R-3606 adminStats + R-3607 adminRowStats 顶部 KPI bar + 每行 stats
-->
<template>
  <div class="page">
    <h2>科普文章</h2>
    <p class="subtitle">
      本机构发布的科普文章, C 端家长在「探索」Tab 阅读。草稿/发布切换在编辑弹窗中操作。
    </p>

    <!-- 顶部 KPI Bar (2026-07-04) -->
    <el-row :gutter="12" class="kpi-row" v-loading="statsLoading">
      <el-col :xs="12" :sm="6">
        <KpiCard label="事件总数" :value="fmtNumber(stats.totalEvents)" extra="累计浏览+activeStudent 去重事件" unit="次" accent="blue" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="独立孩子观众" :value="fmtNumber(stats.uniqueStudents)" extra="按 activeStudentId 去重" unit="人" accent="green" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="时间窗" :value="rangeLabel" :extra="rangeExtra" />
      </el-col>
    </el-row>

    <el-card class="card">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索标题..."
          style="width: 240px"
          clearable
          @keyup.enter="loadAll"
        />
        <el-select v-model="filter" placeholder="上下架" clearable style="width: 140px" @change="loadAll">
          <el-option label="已发布" value="true" />
          <el-option label="草稿" value="false" />
        </el-select>
        <!-- 时间范围 (2026-07-04 复用 report.range) -->
        <el-select v-model="range" placeholder="时间范围" style="width: 140px" @change="loadAll">
          <el-option label="今天" value="today" />
          <el-option label="近 7 天" value="week" />
          <el-option label="本月" value="month" />
        </el-select>
        <el-button @click="loadAll">刷新</el-button>
        <el-button type="primary" @click="openCreate">+ 新建文章</el-button>
      </div>

      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column label="emoji封面" width="80" fixed="left">
          <template #default="{ row }">
            <text style="font-size: 24px;">{{ row.meta?.coverEmoji || '📖' }}</text>
          </template>
        </el-table-column>
        <!-- 2026-07-04: emoji + 标题 一起固定在左边; 未发布(草稿) 标题灰色 -->
        <el-table-column label="标题" min-width="200" fixed="left">
          <template #default="{ row }">
            <span :class="{ 'name-draft': !row.isPublished }">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.category" size="small">{{ row.category }}</el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="浏览" width="100" align="center">
          <template #default="{ row }">{{ fmtNumber(row.viewCount || 0) }}</template>
        </el-table-column>
        <!-- 2026-07-04 新增: 独立孩子观众列 -->
        <el-table-column label="独立观众" width="100" align="center">
          <template #default="{ row }">
            <span :class="{ 'kpi-zero': !row._stats?.uniqueStudents }">
              {{ fmtNumber(row._stats?.uniqueStudents || 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.isPublished" size="small" type="success">已发布</el-tag>
            <el-tag v-else size="small" type="info">草稿</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="170">
          <template #default="{ row }">{{ formatTime(row.publishedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <DestructiveConfirm
              v-if="isPlatformAdmin"
              :target="`科普文章 ${row.title}`"
              warning="高风险"
              :precheck-notes="['无 C 端用户行为事件 (文章访问/阅读记录) 引用']"
              :precheck="() => articleApi.removableCheck(row._id).then((r) => r.data)"
              @confirm="(p) => onRemoveConfirm(row, p)"
            >
              <el-button size="small" type="danger" link>误操删除</el-button>
            </DestructiveConfirm>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!items.length && !loading" class="empty">
        还没有文章, 点右上「+ 新建文章」开始
      </div>
    </el-card>

    <ContentArticleEditDialog
      v-model="dialogVisible"
      :initial-data="editingDoc"
      @saved="onSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { articleApi } from '@/api/article'
import KpiCard from '@/components/KpiCard.vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { useAuthStore } from '@/stores/auth'
import { handleRemoveError } from '@/utils/removable'
import ContentArticleEditDialog from './ContentArticleEditDialog.vue'
import { fmtNumber } from '@/utils/format'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const items = ref([])
const loading = ref(false)
const statsLoading = ref(false)
const keyword = ref('')
const filter = ref('')
const range = ref('month')   // 默认本月
const dialogVisible = ref(false)
const editingDoc = ref(null)
const stats = ref({ totalEvents: 0, uniqueStudents: 0 })

const rangeLabel = computed(() => {
  if (range.value === 'today') return '今天'
  if (range.value === 'week') return '近 7 天'
  if (range.value === 'month') return '本月'
  return '全部'
})
const rangeExtra = computed(() => 'KPI 累计 + 独立观众')

function formatTime(t) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '—'
}

async function loadStats() {
  statsLoading.value = true
  try {
    const res = await articleApi.adminStats({ range: range.value })
    if (res?.data) Object.assign(stats.value, res.data)
  } catch (e) {
    console.warn('[ContentArticles.loadStats]', e)
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
    const res = await articleApi.adminList(params)
    const list = res.data?.items || []
    const rowStatsRes = await articleApi.adminRowStats({ range: range.value })
    const rowStats = rowStatsRes?.data || {}
    items.value = list.map(it => ({
      ...it,
      _stats: rowStats[it._id] || { totalEvents: 0, uniqueStudents: 0, totalMs: 0 }
    }))
  } catch (e) {
    console.warn('[ContentArticles.loadList]', e)
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

// 2026-07-04: 列表接口 (adminList) 投影剔除了 contentMarkdown + contentHtml 省带宽;
//   编辑弹窗需拿完整正文回填, 所以先单独调一次 adminDetail (R-3612) 再开 dialog.
//   失败 fallback: 仍开 dialog (其它字段正常, 用户不能编辑正文但不影响其它)
//   (draft 已发布文章都返详情; 失败场景罕见, 不弹错避免打扰)
async function openEdit(row) {
  try {
    const res = await articleApi.adminDetail(row._id)
    editingDoc.value = res?.data || row
  } catch (_) {
    editingDoc.value = row
  }
  dialogVisible.value = true
}

function onSaved() {
  dialogVisible.value = false
  loadAll()
}

// 2026-07-04: 超管专属物理删除 (走 DestructiveConfirm + 后端 requirePlatformPassword 中间件)
async function onRemoveConfirm(row, { password }) {
  try {
    await articleApi.purge(row._id, { password })
    ElMessage.success('已删除')
    loadAll()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 高风险', `科普文章 ${row.title}`)
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
