<template>
  <div class="page">
    <h2>游离用户</h2>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="什么是游离用户？"
      description="不属于任何机构的账号。常见来源: 用户被所有机构解绑、家长转化失败回滚、首登未激活的家长等。仅平台超管可见。"
      style="margin-bottom: 12px"
    />

    <el-form class="filters" inline @submit.prevent>
      <el-form-item label="关键字">
        <el-input
          v-model="filters.keyword"
          placeholder="姓名/手机号/身份证"
          clearable
          style="width: 220px"
          @keyup.enter="reload"
          @clear="reload"
        />
      </el-form-item>
      <el-form-item label="账号类型">
        <el-select v-model="filters.isPlatformAdmin" style="width: 130px" @change="reload">
          <el-option label="全部" value="all" />
          <el-option label="普通账号" value="false" />
          <el-option label="平台超管" value="true" />
        </el-select>
      </el-form-item>
      <el-form-item label="启用">
        <el-select v-model="filters.isActive" style="width: 110px" @change="reload">
          <el-option label="全部" value="all" />
          <el-option label="是" value="true" />
          <el-option label="否" value="false" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button @click="reload">搜索</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="realName" label="姓名" width="120">
        <template #default="{ row }">
          <span>{{ row.realName || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="mobile" label="手机号" width="140" />
      <el-table-column label="身份证号" width="200">
        <template #default="{ row }">
          <span>{{ maskIdCard(row.idCard) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="地区" width="160">
        <template #default="{ row }">
          <span v-if="row.region">{{ row.region.name }}</span>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="账号标记" width="180">
        <template #default="{ row }">
          <el-tag v-if="row.isPlatformAdmin" type="warning" size="small" style="margin-right: 4px">
            平台超管
          </el-tag>
          <el-tag v-if="row.requirePasswordChange" type="info" size="small" style="margin-right: 4px">
            待改密
          </el-tag>
          <span v-if="!row.isPlatformAdmin && !row.requirePasswordChange" style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="黑名单" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.isBlocked" type="danger" size="small">禁用</el-tag>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          <span style="color: #666">{{ formatDate(row.createdAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="warning" @click="openReset(row)">重置密码</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="!loading && list.length === 0" class="empty-tip">
      <el-empty description="暂无游离用户" :image-size="100" />
    </div>

    <el-pagination
      v-if="total > 0"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      style="margin-top: 16px"
      @current-change="load"
      @size-change="reload"
    />

    <el-dialog v-model="dialog" title="编辑游离用户" width="480px" @close="resetForm">
      <el-alert
        v-if="form.isSelf"
        type="warning"
        :closable="false"
        show-icon
        title="你正在编辑自己的账号"
        description="不要禁用自己 (isActive), 否则会立即失去登录能力"
        style="margin-bottom: 12px"
      />
      <el-alert
        v-if="form.isPlatformAdmin && !form.isSelf"
        type="warning"
        :closable="false"
        show-icon
        title="该用户是平台超管"
        description="修改其信息不影响其超管身份 (该字段本页面不允许改), 但请谨慎评估影响范围"
        style="margin-bottom: 12px"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="姓名" prop="realName">
          <el-input v-model="form.realName" maxlength="50" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input :model-value="form.mobile" disabled />
        </el-form-item>
        <el-form-item label="身份证号" prop="idCard">
          <el-input v-model="form.idCard" placeholder="选填, 15 或 18 位" maxlength="18" />
        </el-form-item>
        <el-form-item label="现居地" prop="region">
          <el-cascader
            v-model="formRegion"
            :options="regionTree"
            :props="{ value: 'id', label: 'name', children: 'children', checkStrictly: true, emitPath: false }"
            placeholder="请选择"
            style="width: 100%"
            clearable
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" :disabled="form.isSelf" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetDialog" title="重置密码" width="380px">
      <p style="margin: 0 0 12px; color: #909399; font-size: 13px">
        将重置账号「{{ resetTarget?.realName || resetTarget?.mobile }}」的登录密码
      </p>
      <el-input v-model="newPassword" placeholder="新密码 (6-64)" show-password maxlength="64" />
      <template #footer>
        <el-button @click="resetDialog = false">取消</el-button>
        <el-button type="primary" :loading="resetSaving" @click="doReset">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { userApi } from '@/api/user'
import { regionApi } from '@/api/region'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const list = ref([])
const regionTree = ref([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const resetDialog = ref(false)
const resetSaving = ref(false)
const newPassword = ref('')
let resetTarget = null

const filters = reactive({
  keyword: '',
  isActive: 'all',
  isPlatformAdmin: 'all'
})
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const formRef = ref()
const form = reactive({
  id: '',
  realName: '',
  mobile: '',
  idCard: '',
  region: null,
  isActive: true,
  isPlatformAdmin: false,
  isSelf: false
})
const formRegion = ref(null)

const rules = {
  realName: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  idCard: [
    {
      validator: (rule, value, cb) => {
        if (!value) return cb()
        if (!/^\d{15}(\d{2}[\dXx])?$/.test(value)) return cb(new Error('身份证号格式不正确'))
        cb()
      },
      trigger: 'blur'
    }
  ]
}

function maskIdCard(v) {
  if (!v) return '—'
  if (v.length <= 8) return v
  return v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4)
}

function formatDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

async function load() {
  loading.value = true
  try {
    const params = {
      keyword: filters.keyword || undefined,
      isActive: filters.isActive,
      isPlatformAdmin: filters.isPlatformAdmin,
      page: page.value,
      pageSize: pageSize.value
    }
    const r = await userApi.listUnaffiliated(params)
    list.value = r.data.items
    total.value = r.data.total
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

async function loadRegions() {
  const r = await regionApi.tree()
  regionTree.value = r.data || []
}

function resetForm() {
  formRef.value?.resetFields()
  Object.assign(form, {
    id: '',
    realName: '',
    mobile: '',
    idCard: '',
    region: null,
    isActive: true,
    isPlatformAdmin: false,
    isSelf: false
  })
  formRegion.value = null
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id,
    realName: row.realName || '',
    mobile: row.mobile,
    idCard: row.idCard || '',
    region: row.region ? row.region.id : null,
    isActive: row.isActive !== false,
    isPlatformAdmin: !!row.isPlatformAdmin,
    isSelf: row.id === auth.user?.id
  })
  formRegion.value = row.region ? row.region.id : null
  dialog.value = true
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
    await userApi.updateUnaffiliated(form.id, {
      realName: form.realName,
      idCard: form.idCard || null,
      region: formRegion.value || null,
      isActive: form.isActive
    })
    ElMessage.success('已更新')
    dialog.value = false
    await load()
  } finally {
    saving.value = false
  }
}

function openReset(row) {
  resetTarget = row
  newPassword.value = ''
  resetDialog.value = true
}

async function doReset() {
  if (!newPassword.value || newPassword.value.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  resetSaving.value = true
  try {
    await userApi.resetPasswordUnaffiliated(resetTarget.id, newPassword.value)
    ElMessage.success('密码已重置')
    resetDialog.value = false
  } finally {
    resetSaving.value = false
  }
}

onMounted(async () => {
  await loadRegions()
  await load()
})
</script>

<style scoped>
.page {
  max-width: 100%;
}
.empty-tip {
  padding: 24px 0;
}
</style>
