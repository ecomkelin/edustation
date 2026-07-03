<!--
  科普文章管理 (admin 端)
  R-3602 list / R-3603 create / R-3604 update / R-3605 soft delete
-->
<template>
  <div class="page">
    <h2>科普文章</h2>
    <p class="subtitle">
      平台超管统一发布, 跨机构对所有 C 端家长可见。在 <code>/pages/tabbar/explore</code> 探索 Tab 的「趣味科普」section 展示。
    </p>

    <el-card class="card">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索标题..."
          style="width: 240px"
          clearable
          @keyup.enter="load"
        />
        <el-select v-model="filter" placeholder="上下架" clearable style="width: 140px" @change="load">
          <el-option label="已发布" value="true" />
          <el-option label="草稿" value="false" />
        </el-select>
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="openCreate">+ 新建文章</el-button>
      </div>

      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column prop="category" label="分类" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.category" size="small">{{ row.category }}</el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="emoji封面" width="100">
          <template #default="{ row }">
            <text style="font-size: 24px;">{{ row.meta?.coverEmoji || '—' }}</text>
          </template>
        </el-table-column>
        <el-table-column label="浏览" width="100" align="center">
          <template #default="{ row }">{{ row.viewCount || 0 }}</template>
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
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="disable(row)">下架</el-button>
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
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { articleApi } from '@/api/article'
import ContentArticleEditDialog from './ContentArticleEditDialog.vue'

const items = ref([])
const loading = ref(false)
const keyword = ref('')
const filter = ref('')
const dialogVisible = ref(false)
const editingDoc = ref(null)

function formatTime(t) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '—'
}

async function load() {
  loading.value = true
  try {
    const params = { pageSize: 50 }
    if (keyword.value) params.keyword = keyword.value
    if (filter.value) params.isPublished = filter.value
    const res = await articleApi.adminList(params)
    // admin http.js 拦截器 return body = {success, code, message, data:{items,...}}
    // 取 res.data?.items; [memory: http-interceptor-actually-unpacked]
    items.value = res.data?.items || []
  } catch (e) {
    console.warn('[ContentArticles.load]', e)
    items.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingDoc.value = null
  dialogVisible.value = true
}

function openEdit(row) {
  editingDoc.value = row
  dialogVisible.value = true
}

async function disable(row) {
  try {
    await ElMessageBox.confirm(`下架「${row.title}」后, C 端将看不到这篇文章, 但数据库保留以备恢复。确认下架?`, '提示', { type: 'warning' })
  } catch { return }
  try {
    await articleApi.remove(row._id)
    ElMessage.success('已下架')
    load()
  } catch (e) {
    ElMessage.error(e.message || '下架失败')
  }
}

function onSaved() {
  dialogVisible.value = false
  load()
}

onMounted(load)
</script>

<style lang="scss" scoped>
.page { padding: 16px; }
.subtitle { color: #666; font-size: 13px; margin: 4px 0 16px; }
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.empty { padding: 60px; text-align: center; color: #999; }
.muted { color: #bbb; font-size: 12px; }
</style>
