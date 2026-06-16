<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="880px"
    top="5vh"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="(v) => $emit('update:modelValue', v)"
    @open="onOpen"
    @close="onClose"
  >
    <!-- 过滤栏 -->
    <el-form :inline="true" :model="filter" class="picker-filter" @submit.prevent>
      <el-form-item label="业务域">
        <el-select v-model="filter.scope" clearable placeholder="全部" style="width: 160px" @change="onFilterChange">
          <el-option v-for="opt in scopeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="文件名">
        <el-input v-model="filter.originalName" placeholder="模糊搜索" clearable style="width: 200px"
                  @keyup.enter="onSearch" @clear="onSearch" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 缩略图网格 -->
    <div v-loading="loading" class="picker-grid-wrap">
      <div v-if="visibleItems.length" class="picker-grid">
        <div
          v-for="f in visibleItems"
          :key="f._id"
          class="picker-card"
          :class="{ 'is-selected': isSelected(f._id) }"
          @click="onCardClick(f)"
        >
          <!-- 选中标记：多选始终显示、单选仅在已选时显示 -->
          <div v-if="isSelected(f._id)" class="picker-card-check">
            <el-icon :size="14" color="#fff"><Check /></el-icon>
          </div>

          <!-- 缩略图 -->
          <div class="picker-card-thumb">
            <el-image
              v-if="isImage(f.mime)"
              :src="f.url"
              fit="cover"
              :preview-src-list="[]"
              style="width:100%;height:100%"
              @click.stop
            >
              <template #error>
                <el-icon :size="28"><Picture /></el-icon>
              </template>
            </el-image>
            <video v-else-if="isVideo(f.mime)" :src="f.url" muted style="width:100%;height:100%;object-fit:cover" />
            <div v-else-if="isAudio(f.mime)" class="picker-card-icon">
              <el-icon :size="36"><Headset /></el-icon>
            </div>
            <div v-else-if="f.mime === 'application/pdf'" class="picker-card-icon">
              <el-icon :size="36"><Document /></el-icon>
            </div>
            <div v-else class="picker-card-icon">
              <el-icon :size="36"><Files /></el-icon>
            </div>
          </div>

          <!-- 名称 + meta -->
          <div class="picker-card-meta">
            <div class="picker-card-name" :title="f.originalName || f.key">{{ f.originalName || f.key }}</div>
            <div class="picker-card-sub">
              <el-tag size="small" :type="scopeTagType(f.scope)">{{ scopeLabel(f.scope) }}</el-tag>
              <!-- 孤儿时把"引用 N"换成红色"孤儿"标签，提醒用户这张图还不在用 -->
              <el-tag v-if="f.isOrphan" size="small" type="danger" style="margin-left: 4px">孤儿</el-tag>
              <span v-else class="text-muted text-12" style="margin-left: 4px">引用 {{ f.refCount || 0 }}</span>
            </div>
          </div>
        </div>
      </div>
      <el-empty v-else-if="!loading" description="未找到匹配文件" />
    </div>

    <!-- 分页 -->
    <el-pagination
      v-if="total > filter.pageSize"
      v-model:current-page="filter.page"
      :page-size="filter.pageSize"
      :total="total"
      layout="prev, pager, next"
      small
      @current-change="load"
    />

    <template #footer>
      <div class="picker-footer">
        <span class="text-muted text-12">共 {{ total }} 个{{ multiple ? ` · 已选 ${selectedMap.size}` : '' }}</span>
        <div>
          <el-button @click="onCancel">取消</el-button>
          <el-button
            v-if="multiple"
            type="primary"
            :disabled="!selectedMap.size"
            @click="onConfirmMulti"
          >
            确认{{ selectedMap.size ? ` (${selectedMap.size})` : '' }}
          </el-button>
          <el-button
            v-else
            type="primary"
            :disabled="!singlePicked"
            @click="onConfirmSingle"
          >
            确认
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Search,
  Refresh,
  Check,
  Picture,
  Document,
  Headset,
  Files
} from '@element-plus/icons-vue'
import { storageApi } from '@/api/storage'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  multiple: { type: Boolean, default: false },
  scope: { type: String, default: '' },
  mimePrefix: { type: String, default: '' },
  title: { type: String, default: '从文件库选择' },
  // 是否包含孤儿文件（refCount=0）。
  // host 自己决定：logo/头像/作品/课件 picker 通常需要"看孤儿"，因为用户经常
  // 是先在 picker 里看到一个刚上传未保存的图、再点"确认"——这时该图就是孤儿。
  includeOrphan: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue', 'select'])

// 业务域下拉选项 —— 与后端 File.model SCOPE 保持一致
// 教学体系新增的 3 个 scope:
//   - subjectSyllabus:          学科上的「宣传海报 / 宣传视频」
//   - subjectLessonMaterial:    学科上的「每堂课课件」
//   - courseInstanceLessonMaterial: 开班上的「快照课件 / 特例课件」
const scopeOptions = [
  { value: 'avatar', label: '头像' },
  { value: 'work', label: '学生作品' },
  { value: 'lessonMaterial', label: '备课资料' },
  { value: 'courseAttachment', label: '课程附件' },
  { value: 'pet', label: '宠物' },
  { value: 'org', label: '机构' },
  { value: 'general', label: '通用' },
  { value: 'subjectSyllabus', label: '学科 · 海报/视频' },
  { value: 'subjectLessonMaterial', label: '学科 · 每堂课课件' },
  { value: 'courseInstanceLessonMaterial', label: '开班 · 课件' }
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
    general: 'info',
    subjectSyllabus: 'success',
    subjectLessonMaterial: 'warning',
    courseInstanceLessonMaterial: 'warning'
  }[s] || ''
}

function isImage(mime) { return mime && mime.startsWith('image/') }
function isVideo(mime) { return mime && mime.startsWith('video/') }
function isAudio(mime) { return mime && mime.startsWith('audio/') }

const filter = reactive({
  scope: '',
  originalName: '',
  page: 1,
  pageSize: 24
})

const loading = ref(false)
const items = ref([])
const total = ref(0)

// 多选跨页保留：Map<id, File>
const selectedMap = reactive(new Map())
// 单选暂存：选中的 file 对象（点击卡片暂存，按"确认"才 emit）
const singlePicked = ref(null)

const visibleItems = computed(() => {
  if (!props.mimePrefix) return items.value
  return items.value.filter((f) => f.mime && f.mime.startsWith(props.mimePrefix))
})

function isSelected(id) {
  if (props.multiple) return selectedMap.has(String(id))
  return singlePicked.value && String(singlePicked.value._id) === String(id)
}

function onOpen() {
  // 打开时重置：scope 默认 props.scope，第一页，清空选中
  filter.scope = props.scope || ''
  filter.originalName = ''
  filter.page = 1
  selectedMap.clear()
  singlePicked.value = null
  load()
}

function onClose() {
  // 弹窗关闭时清空选中（防止下次打开时还残留）
  selectedMap.clear()
  singlePicked.value = null
}

function onFilterChange() {
  // 切换 scope 时清空已选（语义不连续）
  selectedMap.clear()
  singlePicked.value = null
  filter.page = 1
  load()
}

function onSearch() {
  filter.page = 1
  load()
}

function onReset() {
  filter.scope = props.scope || ''
  filter.originalName = ''
  filter.page = 1
  selectedMap.clear()
  singlePicked.value = null
  load()
}

async function load() {
  loading.value = true
  try {
    const params = {
      page: filter.page,
      pageSize: filter.pageSize
    }
    // 是否过滤孤儿，由 host 决定（prop.includeOrphan）。
    // host 默认 includeOrphan=true —— 因为 host 经常需要从"刚上传未保存"的孤儿里挑。
    // 比如：用户在弹窗里上传 logo → File 文档建立但还没绑业务实体（孤儿）→ 用户关掉
    // 弹窗没提交 → 下次再开 picker 还得能找到这张图。
    if (!props.includeOrphan) params.isOrphan = 'false'
    if (filter.scope) params.scope = filter.scope
    if (filter.originalName) params.originalName = filter.originalName
    const { data } = await storageApi.list(params)
    items.value = data.items
    total.value = data.total
  } catch (e) {
    // axios 拦截器已 toast
  } finally {
    loading.value = false
  }
}

function onCardClick(f) {
  if (props.multiple) {
    const id = String(f._id)
    if (selectedMap.has(id)) {
      selectedMap.delete(id)
    } else {
      selectedMap.set(id, f)
    }
  } else {
    // 单选：点击卡片只暂存，按"确认"才 emit
    singlePicked.value = f
  }
}

function onConfirmMulti() {
  const picked = [...selectedMap.values()]
  emit('select', picked)
  emit('update:modelValue', false)
}

function onConfirmSingle() {
  if (!singlePicked.value) return
  emit('select', singlePicked.value)
  emit('update:modelValue', false)
}

function onCancel() {
  emit('update:modelValue', false)
}

// 监听 modelValue 关闭时（v-model:false）清空选中态
watch(
  () => props.modelValue,
  (v) => {
    if (!v) {
      selectedMap.clear()
      singlePicked.value = null
    }
  }
)
</script>

<style scoped>
.picker-filter {
  margin-bottom: 12px;
}

.picker-grid-wrap {
  min-height: 200px;
  max-height: 56vh;
  overflow-y: auto;
  padding: 4px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.picker-card {
  position: relative;
  width: 100%;
  height: 180px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.picker-card:hover {
  border-color: #c0c4cc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.picker-card.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.25);
}

.picker-card-check {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.picker-card-thumb {
  width: 100%;
  height: 120px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #c0c4cc;
}

.picker-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.picker-card-meta {
  flex: 1;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 0;
}

.picker-card-name {
  font-size: 12px;
  line-height: 1.4;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-card-sub {
  display: flex;
  align-items: center;
  font-size: 12px;
  line-height: 1.2;
}

.picker-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
</style>
