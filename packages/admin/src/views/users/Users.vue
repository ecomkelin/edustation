<template>
  <div class="page">
    <h2>用户管理</h2>

    <el-alert
      v-if="!auth.currentOrgId"
      type="warning"
      show-icon
      :closable="false"
      title="尚未选择机构"
      description="用户列表按当前机构筛选。请先在顶部「机构切换」中选择一个机构。"
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
      <el-form-item label="类型">
        <el-select v-model="filters.userType" style="width: 130px" @change="reload">
          <el-option label="全部" value="all" />
          <el-option label="员工" value="staff" />
          <el-option label="家长" value="client" />
        </el-select>
      </el-form-item>
      <el-form-item label="职位">
        <el-select v-model="filters.position" clearable style="width: 180px" @change="reload">
          <el-option v-for="p in positions" :key="p._id" :label="p.name" :value="p._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="地区">
        <el-cascader
          v-model="filters.region"
          :options="regionTree"
          :props="{ value: 'id', label: 'name', children: 'children', checkStrictly: true, emitPath: false }"
          clearable
          style="width: 220px"
          placeholder="全部"
          @change="reload"
        />
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
        <el-button type="primary" :disabled="!auth.currentOrgId" @click="openCreate">添加用户</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="realName" label="姓名" width="120">
        <template #default="{ row }">
          <el-link type="primary" underline="never" @click="goDetail(row)">
            {{ row.realName || row.mobile }}
          </el-link>
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
          <span v-if="row.region">{{ regionName(row.region) }}</span>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="职位" min-width="220">
        <template #default="{ row }">
          <el-tag
            v-for="p in row.positions"
            :key="p.id"
            :type="Number(p.clientLevel) > 0 ? 'warning' : 'info'"
            style="margin-right: 4px"
          >
            {{ p.name }}
            <span v-if="Number(p.clientLevel) > 0" style="margin-left: 4px">（L{{ p.clientLevel }} 家长）</span>
          </el-tag>
          <span v-if="!row.positions || !row.positions.length" style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="主属机构" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.isMain" type="success" size="small">主</el-tag>
        </template>
      </el-table-column>
      <!-- 2026-06 加: 对外名师开关 (UserOrgRel.showAsTeacher), C 端名师团队列用 -->
      <el-table-column label="对外名师" width="100">
        <template #default="{ row }">
          <el-switch
            :model-value="!!row.showAsTeacher"
            :disabled="!canSetTeacher(row)"
            :loading="row._teacherSaving"
            inline-prompt
            active-text="是"
            inactive-text="否"
            @change="(v) => onToggleTeacher(row, v)"
          />
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
      <!-- 2026-08-07: 加「详情」入口。用 link 样式而非实心按钮 —— 本表列已经很宽,
           操作列是 fixed=right, 每多 60px 就多盖住一列 (对外名师/启用/黑名单 在右侧需横向滚动)。
           姓名列也做成了跳详情的链接, 这里只是更显眼的第二入口。 -->
      <el-table-column label="操作" width="400" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="goDetail(row)">详情</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="warning" @click="openReset(row)">重置密码</el-button>
          <el-button
            v-if="auth.isPlatformAdmin"
            size="small"
            :type="row.isBlocked ? 'success' : 'warning'"
            @click="toggleBlock(row)"
          >
            {{ row.isBlocked ? '解禁' : '禁用' }}
          </el-button>
          <!-- 「误操移出」:超管+密码+互锁预检 -->
          <DestructiveConfirm
            :target="`用户 ${row.realName || row.mobile}`"
            warning="中风险"
            :precheck-notes="['无开班/排课引用', '无学员监护人关联', '无赠课/作品痕迹']"
            :precheck="() => userApi.removableCheck(row.id).then((r) => r.data)"
            @confirm="(p) => onRemoveFromOrgConfirm(row, p)"
          >
            <el-button
              size="small"
              type="danger"
              :disabled="row.id === auth.user?.id"
            >
              移出
            </el-button>
          </DestructiveConfirm>
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

    <!-- 新增 / 编辑用户 (2026-08-07 抽成共用组件, 详情页也用同一个) -->
    <UserFormDialog
      v-model="dialog"
      :mode="formMode"
      :user="editingUser"
      @saved="load"
    />

    <ResetPasswordDialog v-model="resetDialog" :user="resetTarget" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { userApi } from '@/api/user'
import { handleRemoveError } from '@/utils/removable'
import { positionApi } from '@/api/position'
import { regionApi } from '@/api/region'
import { useAuthStore } from '@/stores/auth'
import UserFormDialog from './UserFormDialog.vue'
import ResetPasswordDialog from './ResetPasswordDialog.vue'

const auth = useAuthStore()
const router = useRouter()

const list = ref([])
const positions = ref([])
const regionTree = ref([])
const loading = ref(false)

// 2026-08-07: 表单/重置密码弹窗已抽到 UserFormDialog / ResetPasswordDialog,
//   这里只留"开哪个弹窗、喂哪一行"的状态。原来的 form / lookupState / doLookup /
//   submit 等 ~250 行都搬进组件了 (详情页也要用同一套, 不能只留在列表页)。
const dialog = ref(false)
const formMode = ref('create') // 'create' | 'edit'
const editingUser = ref(null)
const resetDialog = ref(false)
const resetTarget = ref(null)

const filters = reactive({
  keyword: '',
  userType: 'all',
  position: '',
  region: '',
  isActive: 'all'
})
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

// region id → 名称扁平索引，避免在表格中反复回查树
const regionIndex = ref(new Map())
function flattenRegion(nodes) {
  for (const n of nodes || []) {
    regionIndex.value.set(n.id, n.name)
    if (n.children && n.children.length) flattenRegion(n.children)
  }
}
function regionName(id) {
  return regionIndex.value.get(id) || id
}

function maskIdCard(v) {
  if (!v) return '—'
  if (v.length <= 8) return v
  return v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4)
}

function goDetail(row) {
  router.push(`/users/${row.id}`)
}

async function load() {
  if (!auth.currentOrgId) {
    list.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const params = {
      keyword: filters.keyword,
      userType: filters.userType,
      position: filters.position || undefined,
      region: filters.region || undefined,
      isActive: filters.isActive,
      page: page.value,
      pageSize: pageSize.value
    }
    const r = await userApi.list(params)
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

async function loadPositions() {
  if (!auth.currentOrgId) {
    positions.value = []
    return
  }
  const r = await positionApi.list({ pageSize: 200 })
  positions.value = r.data.items
}

async function loadRegionTree() {
  const r = await regionApi.tree()
  const tree = (r.data || []).map((n) => ({
    ...n,
    id: n.id || n._id,
    children: n.children || []
  }))
  regionTree.value = tree
  regionIndex.value = new Map()
  flattenRegion(tree)
}

function openCreate() {
  formMode.value = 'create'
  editingUser.value = null
  dialog.value = true
}

function openEdit(row) {
  formMode.value = 'edit'
  editingUser.value = row
  dialog.value = true
}

function openReset(row) {
  resetTarget.value = row
  resetDialog.value = true
}

async function onRemoveFromOrgConfirm(row, { password }) {
  try {
    await userApi.remove(row.id, { password })
    ElMessage.success('已移出')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法解绑 · 高风险', `用户 ${row.realName || row.mobile}`)
  }
}

// 2026-06 加: 名师 switch 逻辑
// 业务规则: 任何 clientLevel > 0 的岗位(家长岗) → 该用户是"家长/混合身份" → 不可设为名师
// 后端 service 还会再兜底 (若前端被绕过会 400)
function canSetTeacher(row) {
  if (!row || !Array.isArray(row.positions)) return false
  return !row.positions.some((p) => Number(p.clientLevel) > 0)
}

async function onToggleTeacher(row, val) {
  const prev = !!row.showAsTeacher
  row.showAsTeacher = val
  row._teacherSaving = true
  try {
    const r = await userApi.setTeacherFlag(row.id, val)
    // r.data 已是业务 data,后端回 {id, orgId, showAsTeacher}
    row.showAsTeacher = !!(r && (r.showAsTeacher !== undefined ? r.showAsTeacher : val))
    ElMessage.success(val ? '已设为对外名师' : '已取消对外名师')
  } catch (e) {
    // 失败回滚 UI
    row.showAsTeacher = prev
    ElMessage.error(e?.response?.data?.message || '切换失败')
  } finally {
    row._teacherSaving = false
  }
}

// 黑名单切换: 仅超管可操作
async function toggleBlock(row) {
  const next = !row.isBlocked
  const action = next ? '禁用' : '解禁'
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确认要${action}该用户吗？${next ? '禁用后该账号将无法登录,refresh token 下次刷新时自动失效。' : '解禁后可恢复正常登录。'}`,
      `${action}用户`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入原因(可选)',
        inputType: 'textarea'
      }
    )
    await userApi.setBlocked(row.id, next, reason || '')
    ElMessage.success(`已${action}`)
    load()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e?.response?.data?.message || `${action}失败`)
  }
}

onMounted(() => {
  load()
  loadPositions()
  loadRegionTree()
})
</script>

<style scoped>
.page {
  max-width: 100%;
}
.filters {
  margin-bottom: 12px;
}
</style>
