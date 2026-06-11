<template>
  <div class="page">
    <h2>机构管理（仅平台超管）</h2>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filters" @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="机构全称 / 简称 / 信用代码"
            clearable
            style="width: 240px"
            @keyup.enter="reload"
            @clear="reload"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.type" placeholder="全部" clearable style="width: 160px" @change="reload">
            <el-option
              v-for="c in orgTypeOptions"
              :key="c.id"
              :value="c.id"
              :label="c.name"
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
      <el-table-column prop="name" label="全称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="nameAbbreviation" label="简称" min-width="140" show-overflow-tooltip />
      <el-table-column prop="unicode" label="信用代码" min-width="160" show-overflow-tooltip />
      <el-table-column label="类型" min-width="120">
        <template #default="{ row }">{{ row.type && row.type.name ? row.type.name : '-' }}</template>
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
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">详情</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
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
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
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

    <!-- 编辑 / 新建 -->
    <el-dialog v-model="dialog" :title="form.id ? '编辑机构' : '新建机构'" width="640px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="社会信用代码" prop="unicode">
          <el-input v-model="form.unicode" :disabled="!!form.id" maxlength="64" placeholder="18 位统一社会信用代码" />
          <span v-if="form.id" class="form-tip">信用代码创建后不可修改</span>
        </el-form-item>
        <el-form-item label="机构全称" prop="name">
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="机构简称" prop="nameAbbreviation">
          <el-input v-model="form.nameAbbreviation" maxlength="50" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择" style="width: 100%" filterable>
            <el-option v-for="c in orgTypeOptions" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="地区" prop="region">
          <el-cascader
            v-model="formRegion"
            :options="regionTree"
            :props="{ value: 'id', label: 'name', children: 'children', checkStrictly: true, emitPath: false }"
            placeholder="请选择"
            style="width: 100%"
            @change="(v) => (form.region = v || null)"
          />
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="form.principal"
            placeholder="请选择本机构下的用户"
            style="width: 100%"
            filterable
            clearable
            :loading="principalsLoading"
            :disabled="!form.id"
          >
            <el-option
              v-for="u in principalOptions"
              :key="u.id"
              :value="u.id"
              :label="`${u.realName || u.mobile}${u.isMain ? '（主）' : ''}`"
            />
          </el-select>
          <span v-if="!form.id" class="form-tip">先保存机构后再指定负责人</span>
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contactPerson" maxlength="50" placeholder="对外展示的联系人姓名" />
        </el-form-item>
        <el-form-item label="联系方式">
          <el-input v-model="form.contactPhone" maxlength="50" placeholder="对外展示的电话 / 邮箱" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" maxlength="200" />
        </el-form-item>
        <el-form-item label="开设时间">
          <el-date-picker
            v-model="form.establishedDate"
            type="date"
            value-format="YYYY-MM-DD"
            :disabled="!!form.id && !!form.establishedDate"
            placeholder="请选择"
            style="width: 100%"
          />
          <span v-if="form.id && form.establishedDate" class="form-tip">已设置，开设时间不可修改</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-dialog v-model="detailDialog" title="机构详情" width="560px">
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="社会信用代码">{{ detail.unicode }}</el-descriptions-item>
        <el-descriptions-item label="简称">{{ detail.nameAbbreviation }}</el-descriptions-item>
        <el-descriptions-item label="全称" :span="2">{{ detail.name }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ detail.type ? detail.type.name : '-' }}</el-descriptions-item>
        <el-descriptions-item label="地区">{{ detail.region ? detail.region.name : '-' }}</el-descriptions-item>
        <el-descriptions-item label="负责人">
          {{ detail.principal ? (detail.principal.realName || detail.principal.mobile) : '未指定' }}
        </el-descriptions-item>
        <el-descriptions-item label="启用">
          <el-tag :type="detail.isActive ? 'success' : 'info'">{{ detail.isActive ? '是' : '否' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="联系人">{{ detail.contactPerson || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系方式">{{ detail.contactPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ detail.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="开设时间">{{ detail.establishedDate ? String(detail.establishedDate).slice(0, 10) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ fmtTime(detail.createdAt) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

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
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { orgApi } from '@/api/org'
import { categoryApi } from '@/api/category'
import { regionApi } from '@/api/region'
import { useAuthStore } from '@/stores/auth'
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog.vue'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => auth.isPlatformAdmin)

const list = ref([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filters = reactive({ keyword: '', type: '', region: '', isActive: 'true' })
const regionCascader = ref(null)
const regionTree = ref([])
const orgTypeOptions = ref([])

const dialog = ref(false)
const saving = ref(false)
const formRef = ref()
const form = reactive(emptyForm())
const formRegion = ref(null)

const principalOptions = ref([])
const principalsLoading = ref(false)

const detailDialog = ref(false)
const detail = ref(null)

const pwdDialog = ref(false)
const pwdTitle = ref('')
const pwdMessage = ref('')
const pwdTarget = ref(null) // { row, next }

function emptyForm() {
  return {
    id: '',
    unicode: '',
    name: '',
    nameAbbreviation: '',
    type: '',
    region: null,
    principal: null,
    contactPerson: '',
    contactPhone: '',
    address: '',
    establishedDate: ''
  }
}

const rules = {
  unicode: [{ required: true, message: '请输入社会信用代码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入机构全称', trigger: 'blur' }],
  nameAbbreviation: [{ required: true, message: '请输入机构简称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  region: [{ required: true, message: '请选择地区', trigger: 'change' }]
}

watch(formRegion, (v) => {
  form.region = v || null
})

async function loadOrgTypes() {
  const r = await categoryApi.list({ model: 'Org', isActive: 'true' })
  orgTypeOptions.value = (r.data || []).map((c) => ({ id: c.id || c._id, name: c.name }))
}

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
  Object.assign(form, emptyForm())
  formRegion.value = null
  principalOptions.value = []
  dialog.value = true
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id,
    unicode: row.unicode || '',
    name: row.name || '',
    nameAbbreviation: row.nameAbbreviation || '',
    type: row.type ? row.type.id || row.type._id : '',
    region: row.region ? row.region.id || row.region._id : null,
    principal: row.principal ? row.principal.id || row.principal._id : null,
    contactPerson: row.contactPerson || '',
    contactPhone: row.contactPhone || '',
    address: row.address || '',
    establishedDate: row.establishedDate ? String(row.establishedDate).slice(0, 10) : ''
  })
  formRegion.value = form.region
  loadPrincipals(row.id)
  dialog.value = true
}

async function loadPrincipals(orgId) {
  if (!orgId) {
    principalOptions.value = []
    return
  }
  principalsLoading.value = true
  try {
    const r = await orgApi.candidatePrincipals(orgId)
    principalOptions.value = (r.data || []).map((u) => ({ ...u, id: u.id || u._id }))
  } finally {
    principalsLoading.value = false
  }
}

async function openDetail(row) {
  const r = await orgApi.detail(row.id)
  detail.value = r.data
  detailDialog.value = true
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  saving.value = true
  try {
    const payload = {
      unicode: form.unicode,
      name: form.name,
      nameAbbreviation: form.nameAbbreviation,
      type: form.type || null,
      region: form.region || null,
      principal: form.principal || null,
      contactPerson: form.contactPerson,
      contactPhone: form.contactPhone,
      address: form.address
    }
    if (form.establishedDate) {
      payload.establishedDate = new Date(form.establishedDate).toISOString()
    }
    if (form.id) {
      await orgApi.update(form.id, payload)
      ElMessage.success('已更新')
    } else {
      await orgApi.create(payload)
      ElMessage.success('已创建')
    }
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
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

async function remove(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除机构「${row.name}」吗？\n该机构将被停用，业务数据保留。`,
      '请确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch (_) {
    return
  }
  await orgApi.remove(row.id)
  ElMessage.success('已删除（停用）')
  load()
}

function fmtTime(t) {
  if (!t) return '-'
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(async () => {
  await Promise.all([loadOrgTypes(), loadRegionTree()])
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
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.muted {
  color: #c0c4cc;
}
</style>
