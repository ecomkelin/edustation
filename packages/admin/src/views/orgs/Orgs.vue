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

    <!-- 编辑 / 新建 -->
    <el-dialog
      v-model="dialog"
      :title="form.id ? '编辑机构' : '新建机构'"
      width="640px"
      :close-on-click-modal="false"
      @close="onDialogClose"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="机构 Logo">
          <div class="logo-uploader">
            <el-avatar :size="64" :src="form.logo || ''" shape="square">
              <el-icon :size="28"><Picture /></el-icon>
            </el-avatar>
            <div class="logo-uploader-actions">
              <el-upload
                :show-file-list="false"
                :auto-upload="true"
                :http-request="uploadLogo"
                :before-upload="beforeLogoUpload"
                accept="image/*"
              >
                <el-button size="small" :icon="Upload">上传新 Logo</el-button>
              </el-upload>
              <el-button v-if="form.logo" size="small" link type="danger" @click="clearLogo">
                清除
              </el-button>
              <el-button size="small" link @click="logoPicker = true">从文件库选</el-button>
            </div>
            <span class="form-tip">支持 jpg/png/webp/gif/svg，≤ 20MB。建议正方形</span>
          </div>
        </el-form-item>
        <el-form-item label="社会信用代码">
          <el-input v-model="form.socialCreditCode" maxlength="64" placeholder="18 位统一社会信用代码" />
        </el-form-item>
        <el-form-item label="法人代表">
          <el-input v-model="form.legalPerson" maxlength="50" />
        </el-form-item>
        <el-form-item label="办学许可证号">
          <el-input v-model="form.licenseNumber" maxlength="64" />
        </el-form-item>
        <el-form-item label="内部编码" prop="unicode">
          <el-input v-model="form.unicode" :disabled="!!form.id" maxlength="64" placeholder="内部统一编码" />
          <span v-if="form.id" class="form-tip">内部编码创建后不可修改</span>
        </el-form-item>
        <el-form-item label="机构全称" prop="name">
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="机构简称" prop="nameAbbreviation">
          <el-input v-model="form.nameAbbreviation" maxlength="50" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择" style="width: 100%" filterable>
            <el-option v-for="opt in ORG_TYPE_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
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
            placeholder="请选择"
            style="width: 100%"
          />
          <span class="form-tip">2026-06 起，开设时间可由平台超管修改</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-dialog v-model="detailDialog" title="机构详情" width="560px">
      <div v-if="detail" class="detail-logo">
        <el-avatar :size="56" :src="detail.logo || ''" shape="square">
          <el-icon :size="24"><Picture /></el-icon>
        </el-avatar>
      </div>
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="内部编码">{{ detail.unicode }}</el-descriptions-item>
        <el-descriptions-item label="社会信用代码">{{ detail.socialCreditCode || '-' }}</el-descriptions-item>
        <el-descriptions-item label="简称">{{ detail.nameAbbreviation }}</el-descriptions-item>
        <el-descriptions-item label="法人代表">{{ detail.legalPerson || '-' }}</el-descriptions-item>
        <el-descriptions-item label="办学许可证号" :span="2">{{ detail.licenseNumber || '-' }}</el-descriptions-item>
        <el-descriptions-item label="全称" :span="2">{{ detail.name }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ orgTypeLabel(detail.type) }}</el-descriptions-item>
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

    <!-- 从文件库选 logo -->
    <FilePicker
      v-model="logoPicker"
      scope="org"
      mime-prefix="image/"
      title="选择机构 Logo"
      @select="onPickLogo"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture, Upload, Folder } from '@element-plus/icons-vue'
import { orgApi } from '@/api/org'
import { regionApi } from '@/api/region'
import { storageApi } from '@/api/storage'
import { useAuthStore } from '@/stores/auth'
import { ORG_TYPES, ORG_TYPE_LABELS } from '@shared/enums.mjs'
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog.vue'
import FilePicker from '@/components/FilePicker.vue'

const auth = useAuthStore()
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

const dialog = ref(false)
const saving = ref(false)
const formRef = ref()
const form = reactive(emptyForm())
const formRegion = ref(null)
const principalOptions = ref([])
const principalsLoading = ref(false)

// 本次编辑会话内"已上传但 form 最终没采用"的 Logo 文件 id 列表。
// 弹窗关闭时清理这些"未绑定的孤儿"，避免磁盘残留 + Files.vue 列表里冒出 refCount=0 的项。
// 注意：保存成功的那张走 org.service 的 diffSingle 处理，**不**进此栈。
const stagedLogoIds = ref([])

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
    socialCreditCode: '',
    legalPerson: '',
    licenseNumber: '',
    name: '',
    nameAbbreviation: '',
    type: '',
    region: null,
    principal: null,
    contactPerson: '',
    contactPhone: '',
    address: '',
    establishedDate: '',
    logo: ''
  }
}

const rules = {
  unicode: [{ required: true, message: '请输入内部编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入机构全称', trigger: 'blur' }],
  nameAbbreviation: [{ required: true, message: '请输入机构简称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  region: [{ required: true, message: '请选择地区', trigger: 'change' }]
}

watch(formRegion, (v) => {
  form.region = v || null
})

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
  // 打开前先清掉上次的暂存孤儿
  cleanupStagedLogos()
  Object.assign(form, emptyForm())
  formRegion.value = null
  principalOptions.value = []
  dialog.value = true
}

function openEdit(row) {
  // 打开前先清掉上次的暂存孤儿
  cleanupStagedLogos()
  Object.assign(form, {
    id: row.id,
    unicode: row.unicode || '',
    socialCreditCode: row.socialCreditCode || '',
    legalPerson: row.legalPerson || '',
    licenseNumber: row.licenseNumber || '',
    name: row.name || '',
    nameAbbreviation: row.nameAbbreviation || '',
    // 2026-06: type 是 String enum, 直接取 row.type
    type: row.type || '',
    region: row.region ? row.region.id || row.region._id : null,
    principal: row.principal ? row.principal.id || row.principal._id : null,
    contactPerson: row.contactPerson || '',
    contactPhone: row.contactPhone || '',
    address: row.address || '',
    establishedDate: row.establishedDate ? String(row.establishedDate).slice(0, 10) : '',
    logo: row.logo || ''
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

// 平台超管: 跳到 /org/promotion, 需先切到目标 org
// 流程: 切 currentOrgId (auth.setOrg) → 跳路由 → OrgPromotion.vue 用 auth.currentOrgId 加载
const router = useRouter()
function openPromotion(row) {
  auth.setOrg(row.id)
  router.push('/org/promotion')
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
      socialCreditCode: form.socialCreditCode,
      legalPerson: form.legalPerson,
      licenseNumber: form.licenseNumber,
      name: form.name,
      nameAbbreviation: form.nameAbbreviation,
      type: form.type || null,
      region: form.region || null,
      principal: form.principal || null,
      contactPerson: form.contactPerson,
      contactPhone: form.contactPhone,
      address: form.address,
      logo: form.logo || ''
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
    // 提交成功：保存的那张 logo 走 org.service 的 diffSingle 绑定，**不**进暂存栈。
    // dialog 关闭时清理掉栈中其余被替换/被丢弃的孤儿。
    dialog.value = false
    formLogoFileId.value = null
    load()
  } finally {
    saving.value = false
  }
}

function onDialogClose() {
  // 关闭时清掉所有"未保存"logo 的孤儿文件。
  //  - 取消 / 点 X：栈里有几张清几张
  //  - 保存成功：栈里只有"被替换掉的"上一张（不是最终那一张），也会被清
  cleanupStagedLogos()
  formLogoFileId.value = null
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

// ===== Logo 上传 =====
// 当前 form.logo 对应的 fileId。null 表示 form.logo 来自"历史数据"（数据库里原有的 logo，
// 不是本会话内上传），不要把它加进暂存栈。
// 注意：打开弹窗后用户首次上传前 form.logo 可能已经有值（编辑场景 row.logo），
// 此时旧 logo 的 fileId 是 null —— 弹窗关闭清理时不会去动它，留给后端 diffSingle 处理。
const formLogoFileId = ref(null)

function beforeLogoUpload(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('Logo 文件超过 20MB 限制')
    return false
  }
  if (!file.type.startsWith('image/')) {
    ElMessage.error('仅支持图片格式')
    return false
  }
  return true
}

async function uploadLogo(req) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'org' })
    // 把"被替换掉的上一张"压栈，等弹窗关闭时清理（孤儿）
    if (formLogoFileId.value) {
      stagedLogoIds.value.push(formLogoFileId.value)
    }
    form.logo = data.url
    formLogoFileId.value = data.id
    ElMessage.success('Logo 已上传，点击"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function clearLogo() {
  if (formLogoFileId.value) {
    stagedLogoIds.value.push(formLogoFileId.value)
  }
  form.logo = ''
  formLogoFileId.value = null
}

async function cleanupStagedLogos() {
  const ids = stagedLogoIds.value
  if (!ids.length) return
  stagedLogoIds.value = []
  for (const id of ids) {
    try {
      await storageApi.remove(id)
    } catch (_) {
      // 清理失败不阻塞主流程（可能已被业务引用；可后续在文件管理页手动处理）
    }
  }
}

// 从文件库选 logo —— 与 uploadLogo 同样的"暂存栈"语义。
// 选出来的 file 来自其他会话，可能已绑定别的 entity —— 但后端 diffSingle 走
// "老 url 绑过的 entity 全部 unbind + 新 url 绑当前 entity"，跨引用无副作用。
const logoPicker = ref(false)
function onPickLogo(file) {
  if (formLogoFileId.value) {
    stagedLogoIds.value.push(formLogoFileId.value)
  }
  form.logo = file.url
  formLogoFileId.value = file._id
  ElMessage.success('已选择 Logo，点"确定"生效')
}

function fmtTime(t) {
  if (!t) return '-'
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.muted {
  color: #c0c4cc;
}
.logo-uploader {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.logo-uploader-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}
</style>
