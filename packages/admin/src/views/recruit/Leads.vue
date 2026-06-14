<template>
  <div class="leads-page">
    <!-- 顶部筛选 -->
    <el-card class="filter-card" shadow="never">
      <div class="filter-row">
        <el-input
          v-model="filters.keyword"
          placeholder="姓名/备注"
          clearable
          style="width: 200px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <el-input
          v-model="filters.phone"
          placeholder="手机号"
          clearable
          style="width: 180px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 130px" @change="onSearch">
          <el-option
            v-for="(label, value) in LEAD_STATUS_LABEL"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
        <el-button type="primary" :icon="Search" @click="onSearch">搜索</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>

        <div class="spacer" />

        <el-button type="primary" :icon="Plus" @click="openCreate">新建潜客</el-button>
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
        <el-table-column label="孩子姓名" prop="name" min-width="100" />
        <el-table-column label="联系电话" prop="phone" width="130" />
        <el-table-column label="性别/年龄" width="90">
          <template #default="{ row }">
            {{ genderLabel(row.gender) }} / {{ row.age ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column label="学校" min-width="140">
          <template #default="{ row }">
            <span v-if="row.school?.name">{{ row.school.name }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="年级/班级" width="120">
          <template #default="{ row }">
            {{ row.grade || '-' }} / {{ row.className || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="试听科目" min-width="100">
          <template #default="{ row }">
            <span v-if="row.trialSubject?.name">{{ row.trialSubject.name }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="LEAD_STATUS_TAG_TYPE[row.status]" size="small">
              {{ LEAD_STATUS_LABEL[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近试听" min-width="160">
          <template #default="{ row }">
            <span v-if="row.latestBooking">
              <el-tag size="small" :type="TRIAL_BOOKING_STATUS_TAG_TYPE[row.latestBooking.status]">
                {{ TRIAL_BOOKING_STATUS_LABEL[row.latestBooking.status] }}
              </el-tag>
              <span class="muted ml">第 {{ row.latestBooking.attemptNo }} 次</span>
            </span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="录入" width="120">
          <template #default="{ row }">
            <span v-if="row.createdBy?.realName">{{ row.createdBy.realName }}</span>
            <span v-else>{{ row.createdBy?.mobile || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="录入时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button size="small" link type="primary" @click="openEdit(row)">编辑</el-button>
            <DestructiveConfirm
              v-if="isPlatformAdmin"
              :target="`潜客 ${row.name}`"
              warning="高风险"
              :precheck-notes="['该潜客有触点日志将被一并删除', '该潜客的试听记录将被一并删除']"
              :precheck="() => leadApi.removableCheck(row._id || row.id).then((r) => r.data)"
              @confirm="(p) => onRemoveConfirm(row, p)"
            >
              <el-button size="small" link type="danger">删除</el-button>
            </DestructiveConfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[20, 50, 100, 200]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="load"
        @current-change="load"
      />
    </el-card>

    <!-- 编辑 dialog -->
    <LeadEditDialog
      v-model:visible="editDialog.visible"
      :lead="editDialog.lead"
      @saved="onSaved"
      @open-existing="(l) => openDetail(l)"
    />

    <!-- 详情 dialog -->
    <LeadDetailDialog
      v-model:visible="detailDialog.visible"
      :lead-id="detailDialog.leadId"
      @updated="onSaved"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import { leadApi } from '@/api/lead'
import { useAuthStore } from '@/stores/auth'
import { handleRemoveError } from '@/utils/removable'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import LeadEditDialog from './LeadEditDialog.vue'
import LeadDetailDialog from './LeadDetailDialog.vue'
import {
  LEAD_STATUS_LABEL, LEAD_STATUS_TAG_TYPE,
  TRIAL_BOOKING_STATUS_LABEL, TRIAL_BOOKING_STATUS_TAG_TYPE
} from '@/utils/constants'
import { GENDER_LABEL } from '@/utils/constants'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => auth.isPlatformAdmin)

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const filters = reactive({ keyword: '', phone: '', status: '' })
const pagination = reactive({ page: 1, pageSize: 20 })

const editDialog = reactive({ visible: false, lead: null })
const detailDialog = reactive({ visible: false, leadId: null })

onMounted(load)

async function load() {
  loading.value = true
  try {
    const r = await leadApi.list({
      keyword: filters.keyword || undefined,
      phone: filters.phone || undefined,
      status: filters.status || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize
    })
    rows.value = r.data?.items || []
    total.value = r.data?.total || 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  pagination.page = 1
  load()
}

function onReset() {
  filters.keyword = ''
  filters.phone = ''
  filters.status = ''
  onSearch()
}

function openCreate() {
  editDialog.lead = null
  editDialog.visible = true
}

function openEdit(row) {
  editDialog.lead = row
  editDialog.visible = true
}

function openDetail(row) {
  detailDialog.leadId = row._id || row.id
  detailDialog.visible = true
}

function onSaved() {
  load()
}

async function onRemoveConfirm(row, { password }) {
  try {
    await leadApi.remove(row._id || row.id, { password })
    ElMessage.success('已删除')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 高风险', `潜客 ${row.name}`)
  }
}

function genderLabel(g) {
  return GENDER_LABEL[g] || '-'
}
function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}
</script>

<style scoped>
.leads-page {
  padding: 16px;
}
.filter-card {
  margin-bottom: 16px;
}
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.filter-row .spacer {
  flex: 1;
}
.list-card {
  margin-bottom: 16px;
}
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
.muted {
  color: #909399;
  font-size: 12px;
}
.ml {
  margin-left: 8px;
}
</style>
