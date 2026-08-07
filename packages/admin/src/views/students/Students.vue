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
      <!-- 2026-08-07: 姓名点击进详情 (替代行操作的「详情」按钮, 减少噪声) -->
      <el-table-column prop="name" label="姓名" width="120">
        <template #default="{ row }">
          <el-link type="primary" underline="never" @click="goDetail(row)">{{ row.name }}</el-link>
        </template>
      </el-table-column>
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
      <el-table-column label="操作" width="240" fixed="right">
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
          <!-- 2026-08-07: 「禁用 / 停用」按钮已挪到详情页 (StudentDetail.vue 左账号卡),
               列表行不再承担这两个动作, 减少噪声 -->
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
        <!-- 2026-07-05: 学生头像 (6 个预制 SVG 手动选, 不分男女) -->
        <el-form-item label="头像">
          <div style="display: flex; align-items: center; gap: 12px">
            <SvgAvatar :svg-key="form.avatarSvgKey" :size="48" audience="student" />
            <el-button size="small" type="primary" link @click="studentAvatarPicker = true">
              选择形象
            </el-button>
            <span v-if="!form.avatarSvgKey" style="color: #909399; font-size: 12px">未选择 (默认显示字母)</span>
          </div>
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="form.gender">
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <!-- 2026-07-11: 生日三栏下拉 (年/月/日) + 红星 + 必填 (label 自定义红色星号, 无 prop 绕开 Element Plus 找不到 form.birthday 的 'is required' 错报) -->
        <el-form-item>
          <template #label>
            <span style="color: #F56C6C">*</span>
            <span> 生日</span>
          </template>
          <el-select
            v-model="form.birthdayYear"
            placeholder="年"
            style="width: 110px"
            filterable
            @change="form.birthdayDay = null"
          >
            <el-option v-for="y in yearOptions" :key="y" :label="y" :value="y" />
          </el-select>
          <el-select
            v-model="form.birthdayMonth"
            placeholder="月"
            style="width: 90px; margin-left: 8px"
            filterable
            @change="form.birthdayDay = null"
          >
            <el-option v-for="m in 12" :key="m" :label="m" :value="m" />
          </el-select>
          <el-select
            v-model="form.birthdayDay"
            placeholder="日"
            style="width: 90px; margin-left: 8px"
            filterable
            :disabled="!form.birthdayYear || !form.birthdayMonth"
          >
            <el-option v-for="d in dayOptions" :key="d" :label="d" :value="d" />
          </el-select>
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

    <!-- 学生头像选择器 (2026-07-05) -->
    <AvatarSvgPicker
      v-model="studentAvatarPicker"
      v-model:key-value="form.avatarSvgKey"
      audience="student"
      :allow-clear="true"
      title="选择学生形象"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { studentApi } from '@/api/student'
import { parentApi } from '@/api/parent'
import { schoolApi } from '@/api/school'
import StudentProfileDialog from '@/components/Profile/StudentProfileDialog.vue'
import ParentProfileDialog from '@/components/Profile/ParentProfileDialog.vue'
import SvgAvatar from '@/components/Avatar/SvgAvatar.vue'
import AvatarSvgPicker from '@/components/Avatar/AvatarSvgPicker.vue'
import { userApi } from '@/api/user'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/format'
import { GENDER_LABEL, SCHOOL_TYPE_LABEL } from '@/utils/constants'

const auth = useAuthStore()
const router = useRouter()
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
  // 2026-07-11: 三栏下拉 — 年/月/日. 提交时拼回 birthdayISO (YYYY-MM-DD)
  birthdayYear: null,
  birthdayMonth: null,
  birthdayDay: null,
  guardianMobile: '',
  guardians: [],
  school: '',
  notes: '',
  // 2026-07-05: 头像 (6 个预制 SVG 手动选, 默认 null 显示兜底)
  avatarSvgKey: null
})
// 学生头像 picker 开关
const studentAvatarPicker = ref(false)

// 表单校验规则(必填 + 手机号格式)
// 2026-07-11: 生日三栏不带 prop/required, 在 save() 手动校验; 其他字段 (姓名/监护人手机) 用 Element Plus 内置规则
const rules = {
  name: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  guardianMobile: [
    { required: true, message: '请填写监护人手机', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式错误', trigger: 'blur' }
  ]
}

// 2026-07-11: 生日三栏选项 + 拼 ISO 字符串 (空 → '')
// 年: 今天起到 30 年前, 简单降序 (今年在最上, 30 年前在底), 不跳不乱
const thisYear = new Date().getFullYear()
const yearOptions = Array.from({ length: 31 }, (_, i) => thisYear - i)
// 日: 根据所选年/月动态算 (平年 2 月 28, 闰年 29; 4/6/9/11 月 30; 其他 31)
const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
const dayOptions = computed(() => {
  const y = form.birthdayYear
  const m = form.birthdayMonth
  if (!y || !m) return []
  return Array.from({ length: daysInMonth(y, m) }, (_, i) => i + 1)
})
// 提交给后端用的字符串 (form.birthdayISO 也给 rules validator 用, 单一数据源)
const birthdayISO = computed(() => {
  if (!form.birthdayYear || !form.birthdayMonth || !form.birthdayDay) return ''
  const m = String(form.birthdayMonth).padStart(2, '0')
  const d = String(form.birthdayDay).padStart(2, '0')
  return `${form.birthdayYear}-${m}-${d}`
})

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
 *   - 后端 list() 已 .populate('guardians', 'mobile realName avatarSvgKey')
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

/**
 * 跳转到学生详情页 (2026-08-07): R-0408 / R-0409
 * 列表行「详情」按钮触发; 走 router.push 全页面跳转 (与 Users.vue goDetail 同范式)
 */
function goDetail(row) {
  router.push(`/students/${row._id}`)
}

function openCreate() {
  Object.assign(form, {
    _id: '',
    name: '',
    gender: 'male',
    // 2026-07-11: 三栏全部保持 null, 强制用户主动填 (避免「误以为已填」)
    birthdayYear: null,
    birthdayMonth: null,
    birthdayDay: null,
    guardianMobile: '',
    guardians: [],
    school: '',
    notes: '',
    avatarSvgKey: null
  })
  dialog.value = true
}

function openEdit(row) {
  // 2026-07-11: 解析后端 row.birthday (Date/ISO 字符串) → 拆 三栏数字. 防 1970-01-01 时区漂移: 用本地年月日.
  const parts = row.birthday ? new Date(row.birthday) : null
  const y = parts && !isNaN(parts.getTime()) ? parts.getFullYear() : null
  const m = parts && !isNaN(parts.getTime()) ? parts.getMonth() + 1 : null
  const d = parts && !isNaN(parts.getTime()) ? parts.getDate() : null
  Object.assign(form, {
    _id: row._id,
    name: row.name,
    gender: row.gender,
    birthdayYear: y,
    birthdayMonth: m,
    birthdayDay: d,
    guardians: (row.guardians || []).map((g) => (g._id ? String(g._id) : String(g))),
    school: row.school ? (row.school._id || String(row.school)) : '',
    notes: row.notes,
    // 2026-07-05: 后端 select avatarSvgKey 列 (Student.model 之前隐式取 undefined)
    avatarSvgKey: row.avatarSvgKey || null
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
  // 2026-07-11: 生日三栏手动校验 — Element Plus 内置校验不参与 (没 prop)
  if (!form.birthdayYear || !form.birthdayMonth || !form.birthdayDay) {
    ElMessage.error('请完整填写生日 (年/月/日)')
    return
  }
  saving.value = true
  try {
    if (form._id) {
      await studentApi.update(form._id, {
        name: form.name,
        gender: form.gender,
        // 2026-07-11: birthdayISO computed 提交 (三栏下拉的合并值)
        birthday: birthdayISO.value,
        school: form.school || null,
        notes: form.notes,
        // 2026-07-05: 学生头像
        avatarSvgKey: form.avatarSvgKey || null
      })
      // 重绑监护人(仅超管,且表单上有该字段才走)
      if (auth.isPlatformAdmin) {
        await studentApi.setGuardians(form._id, form.guardians)
      }
    } else {
      await studentApi.create({
        name: form.name,
        gender: form.gender,
        birthday: birthdayISO.value,
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

// 2026-08-07: 列表行不再有「禁用 / 停用」按钮 (这两个动作已迁到详情页左账号卡);
//   原 toggleBlock / onRemoveConfirm 函数及 DestructiveConfirm 组件已移除。

onMounted(() => {
  load()
  loadOrgUsers()
  loadSchools()
})
</script>