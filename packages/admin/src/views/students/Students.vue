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
      <el-select
        v-model="schoolFilter"
        placeholder="所属学校"
        clearable
        filterable
        style="width: 180px"
        @change="load"
      >
        <el-option
          v-for="s in schoolOptions"
          :key="s._id"
          :label="`${s.name}${SCHOOL_TYPE_LABEL[s.type] ? ' · ' + SCHOOL_TYPE_LABEL[s.type] : ''}`"
          :value="s._id"
        />
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
      <el-table-column label="学校" width="160">
        <template #default="{ row }">
          <span v-if="row.school">{{ row.school.name }}</span>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="监护人" width="140">
        <template #default="{ row }">
          <span v-for="g in row.guardians" :key="g._id" style="margin-right: 6px">
            {{ g.realName || '-' }}
          </span>
        </template>
      </el-table-column>
      <!-- 2026-06-16: 单独列"家长电话" — 方便找学生打电话
           - 监护人列只显示名字 (realName 可能是 "家长-张三" 这种格式, 看不出电话)
           - 直接从 guardians[0].mobile 拉, 配合 el-tooltip 显示完整号码 + 拨号
           - 业务上主监护人 = guardians[0] (Student.guardianUser)
           - 列表场景: 显示主监护人电话就够, 不展示所有监护人避免冗长 -->
      <el-table-column label="家长电话" width="140">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.guardians && row.guardians.length"
            :content="`点击拨打: ${primaryGuardianMobile(row)}`"
            placement="top"
          >
            <a
              :href="`tel:${primaryGuardianMobile(row)}`"
              style="color: #409eff; text-decoration: none"
            >
              {{ formatMobile(primaryGuardianMobile(row)) }}
            </a>
          </el-tooltip>
          <span v-else style="color: #999">未登记</span>
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
      <el-table-column label="操作" width="380" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            size="small"
            :type="row.hasProfile ? 'primary' : ''"
            @click="openProfile(row)"
          >画像{{ row.hasProfile ? '✓' : '' }}</el-button>
          <!-- 2026-06-16: 家长沟通画像 (续课/谈判前看"沟通偏好")
               - parentId 由后端 list() 关联 guardians[0].mobile → Parent 返回
               - parentId 为 null = 该学员未走招生流程 (直接通过"新建学生"创建), 按钮灰禁用
               - 复用 ParentProfileDialog (潜客管理那边同一组件) -->
          <el-tooltip
            :content="row.parentId ? '' : '该学员未关联潜客档案, 无法维护家长画像'"
            placement="top"
          >
            <el-button
              size="small"
              :type="row.hasParentProfile ? 'warning' : ''"
              :disabled="!row.parentId"
              @click="openParentProfile(row)"
            >家长画像{{ row.hasParentProfile ? '✓' : '' }}</el-button>
          </el-tooltip>
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
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="姓名" prop="name" required><el-input v-model="form.name" /></el-form-item>
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
        <el-form-item label="监护人手机" v-if="!form._id" prop="guardianMobile" :required="!form._id">
          <el-input v-model="form.guardianMobile" placeholder="不存在的手机号将自动创建家长账号" />
        </el-form-item>
        <el-form-item label="所属学校">
          <el-select
            v-model="form.school"
            filterable
            clearable
            placeholder="不选则无(选填)"
            style="width: 100%"
          >
            <el-option
              v-for="s in schoolOptions"
              :key="s._id"
              :label="`${s.name}${SCHOOL_TYPE_LABEL[s.type] ? ' · ' + SCHOOL_TYPE_LABEL[s.type] : ''}`"
              :value="s._id"
            />
          </el-select>
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

    <!-- 学生学习画像 (2026-06 新增) -->
    <StudentProfileDialog
      v-model:visible="profileDialog.visible"
      :student="profileDialog.student"
      @saved="onProfileSaved"
    />

    <!-- 2026-06-16: 已转化家长的「沟通画像」(从潜客管理复用同一组件)
         - 弹窗前先 fetch parent detail, 组装 {id, realName, phone, lifecycle} 传过去
         - ParentProfileDialog 已存在, 不需要新建组件 -->
    <ParentProfileDialog
      v-model:visible="parentProfileDialog.visible"
      :parent="parentProfileDialog.parent"
      @saved="onParentProfileSaved"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { studentApi } from '@/api/student'
import { parentApi } from '@/api/parent'
import { schoolApi } from '@/api/school'
import StudentProfileDialog from '@/components/Profile/StudentProfileDialog.vue'
import ParentProfileDialog from '@/components/Profile/ParentProfileDialog.vue'
import { handleRemoveError } from '@/utils/removable'
import { userApi } from '@/api/user'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/format'
import { GENDER_LABEL, SCHOOL_TYPE_LABEL } from '@/utils/constants'

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
const schoolFilter = ref('')
const orgUsers = ref([])
const schoolOptions = ref([])
const formRef = ref(null)
const form = reactive({
  _id: '',
  name: '',
  gender: 'male',
  birthday: '',
  guardianMobile: '',
  guardians: [],
  school: '',
  notes: ''
})

// 表单校验规则(必填 + 手机号格式)
const rules = {
  name: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  guardianMobile: [
    { required: true, message: '请填写监护人手机', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式错误', trigger: 'blur' }
  ]
}

async function load() {
  loading.value = true
  try {
    const params = {
      keyword: keyword.value,
      page: page.value,
      pageSize: pageSize.value
    }
    if (schoolFilter.value) params.school = schoolFilter.value
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

/**
 * 取主监护人手机号
 *   - 业务上 guardians[0] = 主监护人 (Student.guardianUser 也是它)
 *   - 后端 list() 已 .populate('guardians', 'mobile realName avatar')
 *   - 用于"家长电话"列展示 + tel: 拨号
 */
function primaryGuardianMobile(row) {
  const g = (row.guardians || [])[0]
  if (!g) return ''
  return g.mobile || ''
}

/**
 * 手机号脱敏: 138****5678 (2026-06-16 加)
 *   - 默认中段 4 位掩, 列表不暴露完整号
 *   - 鼠标 hover 看 tooltip 看完整号
 *   - 长度异常时原样显示
 */
function formatMobile(m) {
  if (!m) return '-'
  const s = String(m)
  if (s.length === 11) return `${s.slice(0, 3)}****${s.slice(7)}`
  return s
}

async function loadOrgUsers() {
  try {
    const r = await userApi.list({ pageSize: 500 })
    orgUsers.value = r.data.items || r.data || []
  } catch (e) {
    orgUsers.value = []
  }
}

async function loadSchools() {
  try {
    // 仅拉启用学校(用作下拉),按学段/名称排序
    const r = await schoolApi.list({ isActive: 'true', pageSize: 500 })
    const items = r.data.items || []
    items.sort((a, b) => {
      if (a.type !== b.type) return (a.type || '').localeCompare(b.type || '')
      return (a.name || '').localeCompare(b.name || '')
    })
    schoolOptions.value = items
  } catch (e) {
    schoolOptions.value = []
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
    school: '',
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
    school: row.school ? (row.school._id || String(row.school)) : '',
    notes: row.notes
  })
  dialog.value = true
}

// === 学生学习画像 (2026-06 新增) ===
const profileDialog = reactive({ visible: false, student: null })
function openProfile(row) {
  // 列表项的 _id 即 Student._id, 但 dialog 用 id 字段
  profileDialog.student = { ...row, id: row._id }
  profileDialog.visible = true
}
function onProfileSaved() {
  load()
}

// === 已转化家长沟通画像 (2026-06-16 新增)
//   - 续课/谈判前场景: 教务需要看"该学员家长的沟通偏好/家庭背景/孩子关注/跟进备忘"
//   - 复用 ParentProfileDialog (潜客管理那边同款), 弹窗前先 fetch parent detail
//   - parentId 为 null 时按钮已 disabled, 不会走到这里
const parentProfileDialog = reactive({ visible: false, parent: null })
async function openParentProfile(row) {
  if (!row.parentId) return
  try {
    const r = await parentApi.detail(row.parentId)
    parentProfileDialog.parent = {
      id: row.parentId,
      realName: r.data.realName || r.data.phone || '家长',
      phone: r.data.phone,
      lifecycle: r.data.lifecycle
    }
    parentProfileDialog.visible = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载家长信息失败')
  }
}
function onParentProfileSaved() {
  // 家长画像保存后, 列表 hasParentProfile 标记要刷新 (✓ 可能新增/消失)
  load()
}

async function submit() {
  // 表单前置校验(必填 + 格式),校验不通过直接返回,不发请求
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (form._id) {
      await studentApi.update(form._id, {
        name: form.name,
        gender: form.gender,
        birthday: form.birthday,
        school: form.school || null,
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
        school: form.school || null,
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
  loadSchools()
})
</script>