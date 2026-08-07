<template>
  <div class="page">
    <h2>机构管理（仅平台超管）</h2>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filters" @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="机构全称 / 简称 / 内部编码 / 信用代码"
            clearable
            style="width: 280px"
            @keyup.enter="reload"
            @clear="reload"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.type" placeholder="全部" clearable style="width: 160px" @change="reload">
            <el-option
              v-for="opt in ORG_TYPE_OPTIONS"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="地区">
          <el-cascader
            v-model="regionCascader"
            :options="regionTree"
            :props="{ value: 'id', label: 'name', children: 'children', checkStrictly: true, emitPath: false }"
            placeholder="全部"
            clearable
            style="width: 220px"
            @change="onRegionChange"
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-select v-model="filters.isActive" style="width: 110px" @change="reload">
            <el-option label="全部" value="" />
            <el-option label="启用" value="true" />
            <el-option label="停用" value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="reload">搜索</el-button>
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="primary" plain @click="openCreate" v-if="isPlatformAdmin">新建机构</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table :data="list" v-loading="loading" border style="margin-top: 12px">
      <el-table-column label="Logo" width="64">
        <template #default="{ row }">
          <el-avatar :size="32" :src="row.logo || ''" shape="square">
            <el-icon :size="16"><Picture /></el-icon>
          </el-avatar>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="全称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="nameAbbreviation" label="简称" min-width="140" show-overflow-tooltip />
      <el-table-column prop="unicode" label="内部编码" min-width="120" show-overflow-tooltip />
      <el-table-column prop="socialCreditCode" label="社会信用代码" min-width="180" show-overflow-tooltip />
      <el-table-column label="类型" min-width="120">
        <template #default="{ row }">{{ orgTypeLabel(row.type) }}</template>
      </el-table-column>
      <el-table-column label="地区" min-width="140">
        <template #default="{ row }">{{ row.region && row.region.name ? row.region.name : '-' }}</template>
      </el-table-column>
      <el-table-column label="负责人" min-width="120">
        <template #default="{ row }">
          <span v-if="row.principal">
            {{ row.principal.realName || row.principal.mobile }}
          </span>
          <span v-else class="muted">未指定</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="380" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">详情</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="primary" plain @click="openPromotion(row)">推广信息</el-button>
          <el-button
            v-if="row.isActive"
            size="small"
            type="warning"
            @click="askToggle(row, false)"
          >停用</el-button>
          <el-button
            v-else
            size="small"
            type="success"
            @click="askToggle(row, true)"
          >启用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      style="margin-top: 16px"
      @current-change="load"
      @size-change="reload"
    />

    <!-- 编辑 / 新建 (2026-08-07 抽到 OrgFormDialog, 与详情页共用) -->
    <OrgFormDialog v-model="formDialog" :org="editingOrg" @saved="load" />

    <!-- 推广信息 (2026-08-07 从「切机构 + 跳 /org/promotion」改成右侧抽屉) -->
    <OrgPromotionDrawer
      v-model="promotionDrawer"
      :org-id="promotionTarget ? String(promotionTarget.id) : ''"
      :org-name="promotionTarget ? promotionTarget.name : ''"
    />

    <!-- 启用 / 停用 二次确认 -->
    <PasswordConfirmDialog
      v-model="pwdDialog"
      :title="pwdTitle"
      :message="pwdMessage"
      @confirm="onPwdConfirm"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import { orgApi } from '@/api/org'
import { regionApi } from '@/api/region'
import { useAuthStore } from '@/stores/auth'
import { ORG_TYPES, ORG_TYPE_LABELS } from '@shared/enums.mjs'
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog.vue'
import OrgFormDialog from './OrgFormDialog.vue'
import OrgPromotionDrawer from './OrgPromotionDrawer.vue'

const auth = useAuthStore()
const router = useRouter()
const isPlatformAdmin = computed(() => auth.isPlatformAdmin)

// 2026-06: Org.type 是 String enum (10 种), 硬编码选项, 无需拉后端字典
const ORG_TYPE_OPTIONS = ORG_TYPES.map((v) => ({ value: v, label: ORG_TYPE_LABELS[v] || v }))
function orgTypeLabel(v) {
  return v ? (ORG_TYPE_LABELS[v] || v) : '-'
}

const list = ref([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filters = reactive({ keyword: '', type: '', region: '', isActive: 'true' })
const regionCascader = ref(null)
const regionTree = ref([])

// 新建 / 编辑弹窗 (表单本体在 OrgFormDialog.vue)
const formDialog = ref(false)
const editingOrg = ref(null)

// 推广信息抽屉
const promotionDrawer = ref(false)
const promotionTarget = ref(null)

const pwdDialog = ref(false)
const pwdTitle = ref('')
const pwdMessage = ref('')
const pwdTarget = ref(null) // { row, next }

async function loadRegionTree() {
  const r = await regionApi.tree()
  regionTree.value = (r.data || []).map((n) => ({
    ...n,
    id: n.id || n._id,
    children: n.children || []
  }))
}

function onRegionChange(v) {
  filters.region = v || ''
  reload()
}

async function load() {
  loading.value = true
  try {
    const r = await orgApi.list({
      keyword: filters.keyword,
      type: filters.type,
      region: filters.region,
      isActive: filters.isActive,
      page: page.value,
      pageSize: pageSize.value
    })
    list.value = (r.data.items || []).map((o) => ({ ...o, id: o.id || o._id }))
    total.value = r.data.total
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function resetFilters() {
  filters.keyword = ''
  filters.type = ''
  filters.region = ''
  filters.isActive = 'true'
  regionCascader.value = null
  reload()
}

function openCreate() {
  editingOrg.value = null
  formDialog.value = true
}

function openEdit(row) {
  editingOrg.value = row
  formDialog.value = true
}

// 2026-08-07: 详情从弹窗改独立页 (可深链 + 承载 编辑/推广/停用 动作)
function openDetail(row) {
  router.push(`/orgs/${row.id}`)
}

// 2026-08-07: 推广信息改右侧抽屉，不再 auth.setOrg + 跳 /org/promotion。
// 抽屉自己在打开期间切 org 上下文、关闭时切回（图片上传/文件库按 x-org-id 分租户，
// 详见 OrgPromotionDrawer.vue 头注释）。
function openPromotion(row) {
  promotionTarget.value = row
  promotionDrawer.value = true
}

function askToggle(row, next) {
  pwdTarget.value = { row, next }
  pwdTitle.value = next ? '启用机构' : '停用机构'
  pwdMessage.value = next
    ? `确认启用「${row.name}」？该操作不可撤销。\n请输入您的登录密码以继续：`
    : `确认停用「${row.name}」？停用后该机构相关业务将不可用。\n请输入您的登录密码以继续：`
  pwdDialog.value = true
}

async function onPwdConfirm(password) {
  const target = pwdTarget.value
  if (!target) {
    pwdDialog.value = false
    return
  }
  try {
    await orgApi.toggleActive(target.row.id, password)
    ElMessage.success(target.next ? '已启用' : '已停用')
    pwdDialog.value = false
    pwdTarget.value = null
    load()
  } catch (_) {
    // 错误已由 http.js 弹窗；保持对话框打开以便用户重试
  }
}

// 机构不允许物理删除——已移除 remove()，业务方请走 askToggle() 做启用/停用。

onMounted(async () => {
  // 2026-06 整改: Org.type 改成 String enum, 选项硬编码本地, 不再 loadOrgTypes()
  await loadRegionTree()
  load()
})
</script>

<style scoped>
.page {
  max-width: 100%;
}
.filter-card {
  margin-bottom: 4px;
}
.muted {
  color: #c0c4cc;
}
</style>
