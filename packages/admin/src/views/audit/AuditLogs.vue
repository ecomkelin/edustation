<template>
  <div class="page">
    <h2>操作留痕</h2>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="什么是操作留痕？"
      description="系统自动记录每一次写操作（POST/PUT/PATCH/DELETE）和敏感 GET 请求的访问痕迹。仅平台超管可见，保留 180 天。"
      style="margin-bottom: 12px"
    />

    <el-form class="filters" inline @submit.prevent>
      <el-form-item label="时间段">
        <el-date-picker
          v-model="dateRange"
          type="datetimerange"
          range-separator="-"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
          :default-time="[new Date(2000, 0, 1, 0, 0, 0), new Date(2000, 0, 1, 23, 59, 59)]"
          style="width: 360px"
        />
      </el-form-item>
      <el-form-item label="操作者">
        <el-select
          v-model="filters.userId"
          placeholder="全部操作者"
          clearable
          filterable
          style="width: 180px"
        >
          <el-option
            v-for="u in userOptions"
            :key="u.id"
            :label="u.name || u.id"
            :value="u.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="HTTP 方法">
        <el-select
          v-model="filters.method"
          placeholder="全部"
          clearable
          style="width: 130px"
        >
          <el-option
            v-for="m in methodOptions"
            :key="m"
            :label="m"
            :value="m"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="API 路径">
        <el-select
          v-model="filters.path"
          placeholder="全部路径"
          clearable
          filterable
          style="width: 280px"
        >
          <el-option
            v-for="p in pathOptions"
            :key="p"
            :label="p"
            :value="p"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态码">
        <el-select
          v-model="filters.statusCode"
          placeholder="全部"
          clearable
          filterable
          style="width: 140px"
        >
          <el-option-group label="按桶">
            <el-option label="2xx 成功 (200-299)" value="2xx" />
            <el-option label="4xx 客户端错 (400-499)" value="4xx" />
            <el-option label="5xx 服务端错 (500-599)" value="5xx" />
          </el-option-group>
          <el-option-group v-if="statusCodeOptions.length" label="精确码 (历史出现)">
            <el-option
              v-for="c in statusCodeOptions"
              :key="c"
              :label="`${c} ${statusCodeHint(c)}`"
              :value="String(c)"
            />
          </el-option-group>
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="reload">搜索</el-button>
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="success" @click="onExport">导出 CSV</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="list" v-loading="loading" border @row-click="openDetail" style="cursor: pointer">
      <el-table-column label="时间" width="170">
        <template #default="{ row }">
          <span style="color: #666">{{ formatDate(row.createdAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作者" width="120">
        <template #default="{ row }">
          <span v-if="row.actor">{{ row.actor.name || row.actor.mobile || '—' }}</span>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="方法" width="90">
        <template #default="{ row }">
          <el-tag :type="methodTagType(row.method)" size="small">{{ row.method }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="API 路径" min-width="280" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="path-cell">{{ row.path }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.statusCode)" size="small">{{ row.statusCode }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="耗时" width="80" align="right">
        <template #default="{ row }">
          <span style="color: #999">{{ row.durationMs }}ms</span>
        </template>
      </el-table-column>
      <el-table-column label="机构" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.org">{{ row.org.name || '—' }}</span>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="IP" width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span style="color: #999; font-family: monospace; font-size: 12px">{{ row.ip || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="70" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click.stop="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="!loading && list.length === 0" class="empty-tip">
      <el-empty description="暂无审计记录" :image-size="100" />
    </div>

    <el-pagination
      v-if="total > 0"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100, 200]"
      layout="total, sizes, prev, pager, next"
      style="margin-top: 16px"
      @current-change="load"
      @size-change="reload"
    />

    <el-drawer
      v-model="detailDrawer"
      title="审计详情"
      direction="rtl"
      size="640px"
      :destroy-on-close="true"
    >
      <div v-if="detail" class="detail-pane">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="时间">
            {{ formatDate(detail.createdAt, 'YYYY-MM-DD HH:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item label="方法">
            <el-tag :type="methodTagType(detail.method)" size="small">{{ detail.method }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="路径">{{ detail.path }}</el-descriptions-item>
          <el-descriptions-item label="Query">
            <pre class="json-block">{{ stringifyOrEmpty(detail.query) }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="Params">
            <pre class="json-block">{{ stringifyOrEmpty(detail.params) }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="Body">
            <pre class="json-block">{{ stringifyOrEmpty(detail.body) }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="状态码">
            <el-tag :type="statusTagType(detail.statusCode)" size="small">{{ detail.statusCode }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="耗时">{{ detail.durationMs }}ms</el-descriptions-item>
          <el-descriptions-item label="操作者">
            <span v-if="detail.actor">
              {{ detail.actor.name || '—' }} ({{ detail.actor.mobile }})
            </span>
            <span v-else style="color: #999">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="机构">
            <span v-if="detail.org">{{ detail.org.name }}</span>
            <span v-else style="color: #999">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="IP">
            <span style="font-family: monospace">{{ detail.ip || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="User-Agent">
            <span style="font-family: monospace; font-size: 12px; color: #666">{{ detail.userAgent || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Request ID">
            <span style="font-family: monospace; font-size: 12px; color: #666">{{ detail.requestId || '—' }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import auditApi from '@/api/audit'
import { formatDate } from '@/utils/format'

const auth = useAuthStore()

// 筛选
const dateRange = ref([]) // [from, to] ISO 字符串
const filters = ref({
  userId: '',
  method: '',
  path: '',
  statusCode: ''
})

// 下拉 options
const userOptions = ref([])
const methodOptions = ref([])
const pathOptions = ref([])
const statusCodeOptions = ref([])

// 列表
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)

// 详情
const detail = ref(null)
const detailDrawer = ref(false)

function methodTagType(m) {
  if (m === 'GET') return 'info'
  if (m === 'POST') return 'success'
  if (m === 'PUT' || m === 'PATCH') return 'warning'
  if (m === 'DELETE') return 'danger'
  return ''
}

function statusTagType(code) {
  if (code >= 500) return 'danger'
  if (code >= 400) return 'warning'
  if (code >= 300) return 'info'
  if (code >= 200) return 'success'
  return ''
}

// 状态码右侧文字提示 (精确码下拉里展示用)
function statusCodeHint(code) {
  const map = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable',
    500: 'Server Error',
    502: 'Bad Gateway',
    503: 'Unavailable'
  }
  return map[code] || ''
}

function stringifyOrEmpty(v) {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  // 防御: 万一调用方把整包 { success, data: {...} } 传进来, 解到内层
  if (v && typeof v === 'object' && v.success === true && 'data' in v) {
    return stringifyOrEmpty(v.data)
  }
  try {
    return JSON.stringify(v, null, 2)
  } catch (_) {
    return String(v)
  }
}

function buildParams() {
  const params = { page: page.value, pageSize: pageSize.value }
  if (filters.value.userId) params.userId = filters.value.userId
  if (filters.value.method) params.method = filters.value.method
  if (filters.value.path) params.path = filters.value.path
  if (filters.value.statusCode) params.statusCode = filters.value.statusCode
  if (dateRange.value && dateRange.value.length === 2) {
    params.from = dateRange.value[0]
    params.to = dateRange.value[1]
  }
  return params
}

async function load() {
  loading.value = true
  try {
    const res = await auditApi.list(buildParams())
    // 拦截器只解 success 分支, 实际 res 仍是 { success, data: { items, total, page, pageSize } }
    // 业务数据在 res.data
    const payload = res?.data || res
    list.value = payload.items || []
    total.value = payload.total || 0
  } catch (e) {
    // 401/403 已被拦截器处理, 这里只兜底业务错误
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function resetFilters() {
  dateRange.value = []
  filters.value = { userId: '', method: '', path: '', statusCode: '' }
  reload()
}

async function loadOptions() {
  try {
    const res = await auditApi.options()
    const payload = res?.data || res
    methodOptions.value = payload.methods || []
    pathOptions.value = payload.paths || []
    userOptions.value = payload.users || []
    statusCodeOptions.value = (payload.statusCodes || []).slice().sort((a, b) => a - b)
  } catch (_) {
    // options 失败不阻塞列表, 静默
  }
}

async function openDetail(row) {
  try {
    const res = await auditApi.detail(row._id)
    detail.value = res?.data || res
    detailDrawer.value = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载详情失败')
  }
}

function onExport() {
  // 直接走浏览器下载 (后端返回 BOM + ; 分隔, Excel 友好)
  const params = buildParams()
  delete params.page
  delete params.pageSize
  const qs = new URLSearchParams(params).toString()
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  // 用 fetch + token 头拿 blob, 避免 axios 拦截器污染下载
  fetch(`${baseURL}/audit-logs/export.csv?${qs}`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    credentials: 'include'
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
    .catch((e) => {
      ElMessage.error('导出失败: ' + e.message)
    })
}

onMounted(() => {
  loadOptions()
  load()
})
</script>

<style scoped>
.page {
  padding: 16px;
}
.path-cell {
  font-family: monospace;
  font-size: 12px;
  color: #303133;
}
.json-block {
  background: #f5f7fa;
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow: auto;
}
.empty-tip {
  padding: 40px 0;
  text-align: center;
}
.detail-pane {
  padding: 0 16px 16px;
}
</style>
