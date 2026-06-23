<template>
  <div class="parents-page">
    <!-- 顶部筛选 -->
    <el-card class="filter-card" shadow="never">
      <div class="filter-row">
        <el-select
          v-model="filters.lifecycle"
          placeholder="家长状态 (多选, 默认全部)"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          style="width: 220px"
          @change="load"
        >
          <el-option
            v-for="(label, value) in PARENT_LIFECYCLE_LABEL"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
        <el-select
          v-model="filters.range"
          placeholder="时间范围"
          style="width: 140px"
          @change="load"
        >
          <el-option label="近 7 天" value="7d" />
          <el-option label="近 1 月" value="1m" />
          <el-option label="近 3 月" value="3m" />
          <el-option label="全部" value="all" />
        </el-select>
        <el-select
          v-model="filters.tag"
          placeholder="标签"
          clearable
          filterable
          style="width: 140px"
          @change="load"
        >
          <el-option
            v-for="t in tagOptions"
            :key="t._id"
            :label="t.name"
            :value="t._id"
          />
        </el-select>
        <el-select
          v-model="filters.source"
          placeholder="渠道"
          clearable
          filterable
          style="width: 140px"
          @change="load"
        >
          <el-option
            v-for="c in channelOptions"
            :key="c._id"
            :label="c.name"
            :value="c._id"
          />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="备注关键词"
          clearable
          style="width: 180px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-input
          v-model="filters.phone"
          placeholder="手机号"
          clearable
          maxlength="11"
          style="width: 160px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
        <div class="spacer" />
        <el-button type="primary" @click="openCreate">
          + 新建家长
        </el-button>
      </div>
    </el-card>

    <!-- 列表 -->
    <el-card class="list-card" shadow="never">
      <el-table
        v-loading="loading"
        :data="rows"
        border
        stripe
        :empty-text="loading ? '加载中' : '暂无数据'"
      >
        <el-table-column label="联系电话" width="130" prop="phone" />
        <el-table-column label="家长状态" width="100">
          <template #default="{ row }">
            <el-tag :type="lifecycleTagType(row.lifecycle)" size="small">
              {{ lifecycleLabel(row.lifecycle) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="孩子" min-width="160">
          <template #default="{ row }">
            <div v-if="!row.children || row.children.length === 0" class="muted">-</div>
            <div v-else class="child-cell">
              <el-tooltip
                v-if="row.children.length > 3"
                placement="top"
                :content="childNamesTooltip(row.children)"
              >
                <span class="child-names">
                  <span
                    v-for="(c, i) in row.children.slice(0, 3)"
                    :key="i"
                    class="child-name"
                    :class="{ 'is-converted': c.status === 'converted', 'is-lost': c.status === 'lost' }"
                  >
                    {{ c.name }}<span v-if="i < Math.min(2, row.children.length - 1)">、</span>
                  </span>
                  <span class="child-more">+{{ row.children.length - 3 }}</span>
                </span>
              </el-tooltip>
              <span v-else class="child-names">
                <span
                  v-for="(c, i) in row.children"
                  :key="i"
                  class="child-name"
                  :class="{ 'is-converted': c.status === 'converted', 'is-lost': c.status === 'lost' }"
                >
                  {{ c.name }}<span v-if="i < row.children.length - 1">、</span>
                </span>
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="已转化" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="success">{{ row.convertedCount || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="活跃孩子" width="80" align="center">
          <template #default="{ row }">
            <span :class="{ muted: !row.activeChildCount }">{{ row.activeChildCount || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道" min-width="100">
          <template #default="{ row }">
            <span v-if="row.source?.name || (row.source && typeof row.source === 'object')">
              {{ row.source.name }}
            </span>
            <span v-else class="muted">-</span>
            <span class="muted" v-if="row.sourceDetail">/ {{ row.sourceDetail }}</span>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="140">
          <template #default="{ row }">
            <el-tag
              v-for="t in (row.tags || []).slice(0, 3)"
              :key="t._id || t"
              size="small"
              effect="plain"
              :type="tagColor(t)"
              class="ml"
            >
              {{ t.name || t }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="推广人" min-width="90">
          <template #default="{ row }">
            {{ row.promoteBy?.realName || row.promoteBy?.mobile || '-' }}
          </template>
        </el-table-column>
        <!-- 2026-06-21: 删"咨询师"列 — Parent.consultant 字段下线, 谈单老师挂到 TrialBooking -->
        <el-table-column label="最近联系" width="160">
          <template #default="{ row }">{{ formatTime(row.lastContactedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="openDetail(row)">详情</el-button>
            <el-button
              size="small"
              link
              :type="row.hasProfile ? 'primary' : ''"
              @click="openProfile(row)"
            >画像{{ row.hasProfile ? '✓' : '' }}</el-button>
            <el-button size="small" link type="primary" @click="openAddChild(row)">+ 加孩子</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="load"
        @current-change="load"
      />
    </el-card>

    <!-- 新建家长 (= ChildLeadEditDialog, parent=null 走 withChild) -->
    <ChildLeadEditDialog
      v-model:visible="editDialog.visible"
      :parent="null"
      @saved="onSaved"
      @open-existing="onOpenExisting"
    />

    <!-- 同家长加孩 -->
    <ChildLeadEditDialog
      v-model:visible="addChildDialog.visible"
      :parent="addChildDialog.parent"
      @saved="onSaved"
    />

    <!-- 家长详情 -->
    <ParentDetailDialog
      v-model:visible="detailDialog.visible"
      :parent-id="detailDialog.parentId"
      @updated="load"
      @open-existing="onOpenExisting"
    />

    <!-- 家长沟通画像 (2026-06 新增) -->
    <ParentProfileDialog
      v-model:visible="profileDialog.visible"
      :parent="profileDialog.parent"
      @saved="onProfileSaved"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { parentApi } from '@/api/parent'
import { categoryApi } from '@/api/category'
import {
  PARENT_LIFECYCLE_LABEL, PARENT_LIFECYCLE_TAG_TYPE
} from '@/utils/constants'
import ChildLeadEditDialog from './ChildLeadEditDialog.vue'
import ParentDetailDialog from './ParentDetailDialog.vue'
import ParentProfileDialog from '@/components/Profile/ParentProfileDialog.vue'

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const tagOptions = ref([])
const channelOptions = ref([])
const filters = reactive({
  // 2026-06-16: 默认空 (全部), 不再预选 'new' (业务上想看全状态)
  lifecycle: [],
  // 2026-06-16: 时间段默认 '3m' (近 3 月); 后端按 updatedAt 过滤 + 排序
  range: '3m',
  tag: '',
  source: '',
  keyword: '',
  phone: ''
})

/**
 * 把 range 预设 ('7d' / '1m' / '3m' / 'all') 翻译成 from (Date, ISO)
 *  - 'all' → 不传 from (后端不过滤时间)
 *  - 其他 → now - 区间
 * 后端按 updatedAt 过滤 (parent.service.js)
 */
function rangeToFrom(range) {
  if (!range || range === 'all') return null
  const now = new Date()
  const d = new Date(now)
  if (range === '7d') d.setDate(d.getDate() - 7)
  else if (range === '1m') d.setMonth(d.getMonth() - 1)
  else if (range === '3m') d.setMonth(d.getMonth() - 3)
  else return null
  return d.toISOString()
}
const pagination = reactive({ page: 1, pageSize: 20 })

const editDialog = reactive({ visible: false })
const addChildDialog = reactive({ visible: false, parent: null })
const detailDialog = reactive({ visible: false, parentId: null })

onMounted(async () => {
  await loadTags()
  await loadChannels()
  load()
})

async function loadTags() {
  try {
    const r = await categoryApi.list({ model: 'LeadTag', pageSize: 100 })
    tagOptions.value = r.data?.items || (Array.isArray(r.data) ? r.data : [])
  } catch (e) { tagOptions.value = [] }
}

async function loadChannels() {
  try {
    const r = await categoryApi.list({ model: 'Channel', pageSize: 100 })
    channelOptions.value = r.data?.items || (Array.isArray(r.data) ? r.data : [])
  } catch (e) { channelOptions.value = [] }
}

async function load() {
  loading.value = true
  try {
    const params = { ...filters, page: pagination.page, pageSize: pagination.pageSize }
    // lifecycle 是多选数组, 后端走逗号分隔 (parent.service.js#list 已支持 $in)
    if (Array.isArray(params.lifecycle)) {
      if (params.lifecycle.length === 0) {
        // 默认空 = 全部, 不传 lifecycle 给后端, 避免 'new,partial,...' 拼字符串
        delete params.lifecycle
      } else {
        params.lifecycle = params.lifecycle.join(',')
      }
    }
    // range → from (ISO 字符串)
    const from = rangeToFrom(params.range)
    if (from) params.from = from
    else delete params.from
    delete params.range
    Object.keys(params).forEach((k) => { if (params[k] === '' || params[k] == null) delete params[k] })
    const r = await parentApi.list(params)
    rows.value = r.data?.items || []
    total.value = r.data?.total || 0
  } finally {
    loading.value = false
  }
}

function onReset() {
  filters.lifecycle = []
  filters.range = '3m'
  filters.tag = ''
  filters.source = ''
  filters.keyword = ''
  filters.phone = ''
  pagination.page = 1
  load()
}

function openCreate() {
  editDialog.visible = true
}

function openAddChild(row) {
  addChildDialog.parent = row
  addChildDialog.visible = true
}

function openDetail(row) {
  detailDialog.parentId = row._id
  detailDialog.visible = true
}

const profileDialog = reactive({ visible: false, parent: null })
function openProfile(row) {
  // 列表项的 _id 即 Parent._id; 但 dialog 内的 parentApi 用 id
  profileDialog.parent = { ...row, id: row._id }
  profileDialog.visible = true
}
function onProfileSaved() {
  load()
}

function onSaved() {
  ElMessage.success('已保存')
  load()
}

function onOpenExisting(parent) {
  // 切换到详情模式
  detailDialog.parentId = parent._id
  detailDialog.visible = true
}

function lifecycleLabel(s) { return PARENT_LIFECYCLE_LABEL[s] || s }
function lifecycleTagType(s) { return PARENT_LIFECYCLE_TAG_TYPE[s] || 'info' }
function tagColor(tag) {
  const name = tag?.name
  if (name === '已流失') return 'danger'
  if (name === '高意向') return 'success'
  return 'info'
}
function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}
function childNamesTooltip(children) {
  return (children || []).map((c) => {
    const mark = c.status === 'converted' ? '✓ ' : (c.status === 'lost' ? '✗ ' : '')
    return `${mark}${c.name}`
  }).join('\n')
}
</script>

<style scoped>
.parents-page { padding: 16px; }
.filter-card { margin-bottom: 16px; }
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.filter-row .spacer { flex: 1; }
.list-card { margin-bottom: 16px; }
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
.ml { margin-left: 4px; }
.muted { color: #909399; font-size: 12px; }
.child-cell { line-height: 22px; }
.child-names { white-space: nowrap; }
.child-name.is-converted { color: #67c23a; font-weight: 500; }
.child-name.is-lost { color: #909399; text-decoration: line-through; }
.child-more { color: #409eff; margin-left: 4px; font-size: 12px; }
</style>
