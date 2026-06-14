<template>
  <div class="files-page">
    <el-card class="header-card">
      <div class="header-row">
        <div>
          <div class="page-title">文件管理</div>
          <div class="page-subtitle">
            统一管理本机构上传的所有文件（头像 / 作品 / 课程附件 / 备课资料 / 机构 logo / 宠物头像 / 通用附件）。
            被业务实体引用的文件不能直接删除，请先解除引用。
          </div>
        </div>
        <div class="header-actions">
          <el-upload
            :show-file-list="false"
            :auto-upload="true"
            :http-request="customUpload"
            :before-upload="beforeUpload"
            accept="image/*,video/*,audio/*,application/pdf"
          >
            <el-button type="primary" :icon="Upload">上传文件</el-button>
          </el-upload>
        </div>
      </div>
    </el-card>

    <el-card class="filter-card">
      <el-form :inline="true" :model="filter" class="filter-form">
        <el-form-item label="业务域">
          <el-select v-model="filter.scope" clearable placeholder="全部" style="width: 160px">
            <el-option v-for="opt in scopeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件名">
          <el-input v-model="filter.originalName" placeholder="模糊搜索" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="孤儿">
          <el-switch v-model="filter.isOrphan" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
          <el-button :icon="Refresh" @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column label="文件" min-width="220">
          <template #default="{ row }">
            <div class="file-cell">
              <div class="file-thumb">
                <el-image
                  v-if="isImage(row.mime)"
                  :src="row.url"
                  :preview-src-list="[row.url]"
                  fit="cover"
                  preview-teleported
                />
                <el-icon v-else :size="24"><Document /></el-icon>
              </div>
              <div class="file-meta">
                <div class="file-name" :title="row.originalName">{{ row.originalName || row.key }}</div>
                <div class="file-sub text-muted text-12">{{ row.mime }} · {{ humanSize(row.size) }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="业务域" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="scopeTagType(row.scope)">{{ scopeLabel(row.scope) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上传者" width="160">
          <template #default="{ row }">
            <span v-if="row.uploader">{{ row.uploader.realName || row.uploader.mobile }}</span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="引用数" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.refCount > 0" type="warning" size="small">{{ row.refCount }}</el-tag>
            <el-tag v-else-if="row.isOrphan" type="info" size="small">孤儿</el-tag>
            <span v-else class="text-muted">0</span>
          </template>
        </el-table-column>
        <el-table-column label="上传时间" width="170">
          <template #default="{ row }">
            <span class="text-12">{{ formatDate(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openRefs(row)">查看引用 ({{ row.refCount }})</el-button>
            <el-button link type="primary" size="small" @click="openPreview(row)">预览</el-button>
            <DestructiveConfirm
              :target="row.originalName || row.key"
              warning="中风险"
              reason="该操作会从存储中物理删除文件，删除后无法恢复。如有引用，请先解除。"
              :precheck="() => storageApi.removableCheck(row._id).then((r) => r.data)"
              @confirm="onRemoveConfirm(row, $event)"
            >
              <el-button link type="danger" size="small">删除</el-button>
            </DestructiveConfirm>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-row">
        <el-pagination
          v-model:current-page="filter.page"
          v-model:page-size="filter.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="load"
          @current-change="load"
        />
      </div>
    </el-card>

    <!-- 引用详情弹窗 -->
    <el-dialog v-model="refsVisible" :title="`引用详情 - ${refsTarget?.originalName || ''}`" width="600px">
      <div v-if="refsTarget">
        <div class="refs-summary">
          <el-tag v-if="refsTarget.refCount > 0" type="warning">{{ refsTarget.refCount }} 处引用</el-tag>
          <el-tag v-else type="info">孤儿（无引用）</el-tag>
        </div>
        <el-table v-if="refsTarget.refs && refsTarget.refs.length" :data="refsTarget.refs" class="refs-table">
          <el-table-column label="业务实体">
            <template #default="{ row }">{{ row.label || row.entity }}</template>
          </el-table-column>
          <el-table-column label="字段" prop="field" />
          <el-table-column label="ID" width="200">
            <template #default="{ row }">
              <span class="text-12 text-muted">{{ row.entityId }}</span>
            </template>
          </el-table-column>
          <el-table-column label="绑定时间" width="160">
            <template #default="{ row }">
              <span class="text-12">{{ formatDate(row.boundAt) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="该文件未被任何业务实体引用，可安全删除" />
      </div>
    </el-dialog>

    <!-- 预览弹窗（图片/视频/音频/PDF） -->
    <el-dialog v-model="previewVisible" :title="previewTitle" width="80%" top="5vh" destroy-on-close>
      <div v-if="previewTarget" class="preview-body">
        <el-image v-if="isImage(previewTarget.mime)" :src="previewTarget.url" fit="contain" style="width:100%" />
        <video v-else-if="isVideo(previewTarget.mime)" :src="previewTarget.url" controls style="width:100%">
          您的浏览器不支持 video 标签。
        </video>
        <audio v-else-if="isAudio(previewTarget.mime)" :src="previewTarget.url" controls style="width:100%">
          您的浏览器不支持 audio 标签。
        </audio>
        <iframe v-else-if="previewTarget.mime === 'application/pdf'" :src="previewTarget.url" class="pdf-frame" />
        <div v-else>
          <el-link :href="previewTarget.url" target="_blank" type="primary">在新窗口打开</el-link>
          <div class="text-muted text-12" style="margin-top: 8px">该类型不支持在线预览</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Search, Refresh, Upload } from '@element-plus/icons-vue'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { storageApi } from '@/api/storage'
import { handleRemoveError } from '@/utils/removable'
import { formatDate } from '@/utils/format'

const loading = ref(false)
const items = ref([])
const total = ref(0)

const filter = reactive({
  scope: '',
  originalName: '',
  isOrphan: false,
  page: 1,
  pageSize: 20
})

const scopeOptions = [
  { value: 'avatar', label: '头像' },
  { value: 'work', label: '学生作品' },
  { value: 'lessonMaterial', label: '备课资料' },
  { value: 'courseAttachment', label: '课程附件' },
  { value: 'pet', label: '宠物' },
  { value: 'org', label: '机构' },
  { value: 'general', label: '通用' }
]

function scopeLabel(s) {
  const f = scopeOptions.find((x) => x.value === s)
  return f ? f.label : s
}

function scopeTagType(s) {
  return {
    avatar: 'primary',
    work: 'success',
    lessonMaterial: 'warning',
    courseAttachment: 'info',
    pet: '',
    org: 'danger',
    general: 'info'
  }[s] || ''
}

function isImage(mime) { return mime && mime.startsWith('image/') }
function isVideo(mime) { return mime && mime.startsWith('video/') }
function isAudio(mime) { return mime && mime.startsWith('audio/') }

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

async function load() {
  loading.value = true
  try {
    const params = {
      page: filter.page,
      pageSize: filter.pageSize
    }
    if (filter.scope) params.scope = filter.scope
    if (filter.originalName) params.originalName = filter.originalName
    if (filter.isOrphan) params.isOrphan = 'true'
    const { data } = await storageApi.list(params)
    items.value = data.items
    total.value = data.total
  } catch (e) {
    // axios 拦截器已 toast
  } finally {
    loading.value = false
  }
}

function onSearch() {
  filter.page = 1
  load()
}

function onReset() {
  filter.scope = ''
  filter.originalName = ''
  filter.isOrphan = false
  filter.page = 1
  load()
}

function beforeUpload(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('文件超过 20MB 限制')
    return false
  }
  return true
}

async function customUpload(req) {
  try {
    await storageApi.upload({ file: req.file, scope: 'general' })
    ElMessage.success(`已上传: ${req.file.name}`)
    load()
  } catch (e) {
    // axios 拦截器已 toast
  }
}

// 引用弹窗
const refsVisible = ref(false)
const refsTarget = ref(null)
async function openRefs(row) {
  try {
    const { data } = await storageApi.detail(row._id)
    refsTarget.value = data
    refsVisible.value = true
  } catch (e) { /* toast by interceptor */ }
}

// 预览弹窗
const previewVisible = ref(false)
const previewTarget = ref(null)
const previewTitle = computed(() => previewTarget.value?.originalName || '预览')
function openPreview(row) {
  previewTarget.value = row
  previewVisible.value = true
}

async function onRemoveConfirm(row, { password }) {
  try {
    await storageApi.remove(row._id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险', row.originalName || row.key)
  }
}

onMounted(load)
</script>

<style scoped>
.files-page { display: flex; flex-direction: column; gap: 12px; }
.header-card .header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.page-title { font-size: 18px; font-weight: 600; }
.page-subtitle { color: #909399; font-size: 12px; margin-top: 4px; max-width: 720px; }
.filter-card { padding-bottom: 0; }
.filter-form { margin-bottom: 0; }
.file-cell { display: flex; align-items: center; gap: 10px; }
.file-thumb { width: 40px; height: 40px; border-radius: 4px; background: #f5f7fa; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; color: #909399; }
.file-thumb :deep(.el-image) { width: 100%; height: 100%; }
.file-meta { min-width: 0; }
.file-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.pagination-row { display: flex; justify-content: flex-end; padding-top: 12px; }
.refs-summary { margin-bottom: 12px; }
.refs-table { font-size: 12px; }
.preview-body { min-height: 200px; display: flex; align-items: center; justify-content: center; }
.pdf-frame { width: 100%; height: 70vh; border: none; }
.text-12 { font-size: 12px; }
.text-muted { color: #909399; }
</style>
