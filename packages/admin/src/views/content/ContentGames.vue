<!--
  小游戏管理 (admin 端)
  R-3703 list / R-3704 create / R-3705 update / R-3706 delete
-->
<template>
  <div class="page">
    <h2>平台小游戏</h2>
    <p class="subtitle">
      平台超管统一发布, C 端用户在 <code>/pages/tabbar/explore</code> 「趣味小游戏」section 看到, 点击走 web-view 启动 H5。
    </p>

    <el-card class="card">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="搜索名称..." style="width: 240px" clearable @keyup.enter="load" />
        <el-select v-model="filter" placeholder="上下架" clearable style="width: 140px" @change="load">
          <el-option label="已发布" value="true" />
          <el-option label="草稿" value="false" />
        </el-select>
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="openCreate">+ 新建游戏</el-button>
      </div>

      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column label="emoji" width="80">
          <template #default="{ row }">
            <text style="font-size: 24px;">{{ row.meta?.coverEmoji || '🎮' }}</text>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="intro" label="简介" min-width="220" show-overflow-tooltip />
        <el-table-column label="难度" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.difficulty" size="small" :type="difficultyType(row.difficulty)">
              {{ difficultyLabel(row.difficulty) }}
            </el-tag>
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
        <el-table-column label="启动次数" width="100" align="center">
          <template #default="{ row }">{{ row.playCount || 0 }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.isPublished" size="small" type="success">已发布</el-tag>
            <el-tag v-else size="small" type="info">草稿</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="disable(row)">下架</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!items.length && !loading" class="empty">
        还没有游戏, 点右上「+ 新建游戏」开始
      </div>
    </el-card>

    <ContentGameEditDialog v-model="dialogVisible" :initial-data="editingDoc" @saved="onSaved" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { gameApi } from '@/api/game'
import ContentGameEditDialog from './ContentGameEditDialog.vue'

const items = ref([])
const loading = ref(false)
const keyword = ref('')
const filter = ref('')
const dialogVisible = ref(false)
const editingDoc = ref(null)

const DIFFICULTY = {
  easy: { label: '简单', type: 'success' },
  medium: { label: '中等', type: 'warning' },
  hard: { label: '困难', type: 'danger' }
}
function difficultyLabel(d) { return DIFFICULTY[d]?.label || d }
function difficultyType(d) { return DIFFICULTY[d]?.type || 'info' }

async function load() {
  loading.value = true
  try {
    const params = { pageSize: 50 }
    if (keyword.value) params.keyword = keyword.value
    if (filter.value) params.isPublished = filter.value
    const res = await gameApi.adminList(params)
    // admin http.js 拦截器 return body = {success, code, message, data:{items,...}}
    // 取 res.data?.items; [memory: http-interceptor-actually-unpacked]
    items.value = res.data?.items || []
  } catch (e) {
    console.warn('[ContentGames.load]', e)
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
    await ElMessageBox.confirm(`下架「${row.name}」后, C 端将看不到这款游戏, 但数据库保留以备恢复。确认下架?`, '提示', { type: 'warning' })
  } catch { return }
  try {
    await gameApi.remove(row._id)
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
