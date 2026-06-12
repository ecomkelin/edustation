<template>
  <div class="page">
    <h2>学生管理</h2>
    <el-space>
      <el-input v-model="keyword" placeholder="姓名" clearable @keyup.enter="load" />
      <el-select v-model="stateFilter" style="width: 130px" @change="load">
        <el-option label="全部" value="all" />
        <el-option label="在读" value="active" />
        <el-option label="已退学" value="inactive" />
        <el-option label="禁用" value="blocked" />
      </el-select>
      <el-button @click="load">搜索</el-button>
      <el-button type="primary" @click="openCreate">新建学生</el-button>
    </el-space>
    <el-table :data="list" v-loading="loading" style="margin-top: 16px">
      <el-table-column prop="name" label="姓名" width="120" />
      <el-table-column label="性别" width="80">
        <template #default="{ row }">{{ GENDER_LABEL[row.gender] || '-' }}</template>
      </el-table-column>
      <el-table-column prop="birthday" label="生日" width="140">
        <template #default="{ row }">{{ formatDate(row.birthday, 'YYYY-MM-DD') }}</template>
      </el-table-column>
      <el-table-column label="监护人">
        <template #default="{ row }">
          <span v-for="g in row.guardians" :key="g._id" style="margin-right: 6px">
            {{ g.realName || g.mobile }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="isActive" label="启用" width="80">
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
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            v-if="auth.isPlatformAdmin"
            size="small"
            :type="row.isBlocked ? 'success' : 'warning'"
            @click="toggleBlock(row)"
          >
            {{ row.isBlocked ? '解禁' : '禁用' }}
          </el-button>
          <!-- 「误操停用」:超管+密码+互锁(在册报名/未用完课包)预检 -->
          <DestructiveConfirm
            v-if="auth.isPlatformAdmin && row.isActive"
            :target="`学生 ${row.name}`"
            warning="中风险"
            :precheck-notes="['无在册报名', '无未用完课包']"
            :precheck="() => studentApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" type="danger">停用</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top: 16px"
      @current-change="load"
    />

    <el-dialog v-model="dialog" :title="form._id ? '编辑学生' : '新建学生'" width="520px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="姓名" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="性别">
          <el-select v-model="form.gender">
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="生日">
          <el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="监护人手机" v-if="!form._id">
          <el-input v-model="form.guardianMobile" placeholder="不存在的手机号将自动创建家长账号" />
        </el-form-item>
        <!-- 重绑监护人: 仅编辑模式 + 仅超管可见 -->
        <el-form-item v-if="form._id && auth.isPlatformAdmin" label="监护人">
          <el-select
            v-model="form.guardians"
            multiple
            filterable
            placeholder="选择本机构用户作为监护人"
            style="width: 100%"
          >
            <el-option
              v-for="u in orgUsers"
              :key="u.id"
              :label="u.realName || u.mobile"
              :value="u.id"
            />
          </el-select>
          <div class="hint" style="color: #999; font-size: 12px; margin-top: 4px">
            首位自动设为主监护人(guardianUser);保存后立即生效。
          </div>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.notes" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { studentApi } from '@/api/student'
import { handleRemoveError } from '@/utils/removable'
import { userApi } from '@/api/user'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/format'
import { GENDER_LABEL } from '@/utils/constants'

const auth = useAuthStore()
const list = ref([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const stateFilter = ref('active')
const orgUsers = ref([])
const form = reactive({
  _id: '',
  name: '',
  gender: 'male',
  birthday: '',
  guardianMobile: '',
  guardians: [],
  notes: ''
})

async function load() {
  loading.value = true
  try {
    const params = {
      keyword: keyword.value,
      page: page.value,
      pageSize: pageSize.value
    }
    if (stateFilter.value === 'active') {
      params.isActive = 'true'
      params.isBlocked = 'false'
    } else if (stateFilter.value === 'inactive') {
      params.isActive = 'false'
    } else if (stateFilter.value === 'blocked') {
      params.isBlocked = 'true'
    }
    const r = await studentApi.list(params)
    list.value = r.data.items
    total.value = r.data.total
  } finally {
    loading.value = false
  }
}

async function loadOrgUsers() {
  try {
    const r = await userApi.list({ pageSize: 500 })
    orgUsers.value = r.data.items || r.data || []
  } catch (e) {
    orgUsers.value = []
  }
}

function openCreate() {
  Object.assign(form, {
    _id: '',
    name: '',
    gender: 'male',
    birthday: '',
    guardianMobile: '',
    guardians: [],
    notes: ''
  })
  dialog.value = true
}

function openEdit(row) {
  Object.assign(form, {
    _id: row._id,
    name: row.name,
    gender: row.gender,
    birthday: row.birthday ? formatDate(row.birthday, 'YYYY-MM-DD') : '',
    guardians: (row.guardians || []).map((g) => (g._id ? String(g._id) : String(g))),
    notes: row.notes
  })
  dialog.value = true
}

async function submit() {
  if (!form.name) return ElMessage.warning('请填写姓名')
  saving.value = true
  try {
    if (form._id) {
      await studentApi.update(form._id, {
        name: form.name,
        gender: form.gender,
        birthday: form.birthday,
        notes: form.notes
      })
      // 重绑监护人(仅超管,且表单上有该字段才走)
      if (auth.isPlatformAdmin) {
        await studentApi.setGuardians(form._id, form.guardians)
      }
    } else {
      await studentApi.create({
        name: form.name,
        gender: form.gender,
        birthday: form.birthday,
        guardianMobile: form.guardianMobile,
        notes: form.notes
      })
    }
    ElMessage.success('已保存')
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function toggleBlock(row) {
  const next = !row.isBlocked
  const action = next ? '禁用' : '解禁'
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确认要${action}该学生吗？${next ? '禁用后该学生将无法报名/下单,家长端不可见。' : '解禁后将恢复正常业务。'}`,
      `${action}学生`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入原因(可选)',
        inputType: 'textarea'
      }
    )
    await studentApi.setBlocked(row._id, next, reason || '')
    ElMessage.success(`已${action}`)
    load()
  } catch (e) {
    // 用户点击取消
    if (e === 'cancel') return
    ElMessage.error(e?.response?.data?.message || `${action}失败`)
  }
}

async function onRemoveConfirm(row, { password }) {
  try {
    await studentApi.remove(row._id, { password })
    ElMessage.success('已停用')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 高风险', `学生 ${row.name}`)
  }
}

onMounted(() => {
  load()
  loadOrgUsers()
})
</script>