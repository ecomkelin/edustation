<template>
  <div class="page">
    <div class="page__header">
      <h2>任务模板</h2>
      <el-button v-if="canWrite" type="primary" :icon="Plus" @click="$router.push('/tasks/templates/new')">新建模板</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column label="标题" min-width="200">
        <template #default="{ row }">
          <a class="link" @click="$router.push(`/tasks/templates/${row._id}`)">{{ row.title }}</a>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ typeLabels[row.type] || row.type }}</template>
      </el-table-column>
      <el-table-column label="周期" width="160">
        <template #default="{ row }">
          <el-tag size="small" :type="row.isActive ? 'success' : 'info'">
            {{ row.isActive ? '启用' : '暂停' }}
          </el-tag>
          <span style="margin-left: 6px">{{ scheduleLabel(row.schedule) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="下次生成" width="170">
        <template #default="{ row }">{{ formatDate(row.nextRunAt) }}</template>
      </el-table-column>
      <el-table-column label="上次生成" width="170">
        <template #default="{ row }">{{ formatDate(row.lastRunAt) }}</template>
      </el-table-column>
      <el-table-column label="创建人" width="100">
        <template #default="{ row }">{{ row.createdBy && (row.createdBy.realName || row.createdBy.name) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link @click="$router.push(`/tasks/templates/${row._id}`)">编辑</el-button>
          <el-button v-if="row.isActive && canWrite" size="small" link @click="onPause(row)">暂停</el-button>
          <el-button v-else-if="canWrite" size="small" link type="success" @click="onResume(row)">恢复</el-button>
          <el-button v-if="canWrite" size="small" link type="warning" @click="onRunNow(row)">立即跑</el-button>
          <el-button v-if="canDelete" size="small" link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import { TASK_TYPE_LABELS } from '@shared/enums.mjs'

const auth = useAuthStore()
const typeLabels = TASK_TYPE_LABELS

const canWrite = computed(() => hasPermInOrg(auth, 'task.write'))
const canDelete = computed(() => hasPermInOrg(auth, 'task.delete'))

const rows = ref([])
const loading = ref(false)

function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleString('zh-CN') }
function scheduleLabel(s) {
  if (!s) return '—'
  if (s.kind === 'daily') return `每天 ${(s.hour || [9]).join('/')}时`
  if (s.kind === 'weekly') {
    const wd = ['日', '一', '二', '三', '四', '五', '六']
    return `每${(s.weekdays || []).map((i) => '周' + wd[i]).join('/')} ${(s.hour || [9]).join('/')}时`
  }
  if (s.kind === 'monthly') return `每月${(s.daysOfMonth || []).join('/')}日 ${(s.hour || [9]).join('/')}时`
  return s.cron || s.kind
}

async function reload() {
  loading.value = true
  try {
    const r = await taskApi.templateList({ page: 1, pageSize: 100 })
    rows.value = r.data?.items || []
  } finally {
    loading.value = false
  }
}

async function onPause(row) {
  await taskApi.templatePause(row._id)
  ElMessage.success('已暂停')
  await reload()
}
async function onResume(row) {
  await taskApi.templateResume(row._id)
  ElMessage.success('已恢复')
  await reload()
}
async function onRunNow(row) {
  await ElMessageBox.confirm(`立即按模板「${row.title}」生成一个任务,确认?`, '立即跑一次', { type: 'warning' })
  try {
    await taskApi.templateRunNow(row._id)
    ElMessage.success('已生成')
    await reload()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '生成失败')
  }
}
async function onDelete(row) {
  await ElMessageBox.confirm(`确认删除模板「${row.title}」? 已有任务不受影响`, '提示', { type: 'warning' })
  try {
    await taskApi.templateRemove(row._id)
    ElMessage.success('已删除')
    await reload()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

onMounted(reload)
</script>

<style scoped>
.page { padding: 16px; }
.page__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.link { color: #409eff; cursor: pointer; }
</style>