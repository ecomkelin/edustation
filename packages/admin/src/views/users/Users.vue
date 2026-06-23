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
      <el-table-column prop="realName" label="姓名" width="120" />
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
      <el-table-column label="操作" width="380" fixed="right">
        <template #default="{ row }">
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
            >移出</el-button>
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

    <el-dialog v-model="dialog" :title="dialogTitle" width="560px" @close="resetCreate">
      <!-- 编辑分支 (form.id 已存在): 原编辑表单不变 -->
      <template v-if="form.id">
        <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
          <el-form-item label="姓名" prop="realName"><el-input v-model="form.realName" /></el-form-item>
          <el-form-item v-if="!form.id" label="手机号" prop="mobile">
            <el-input v-model="form.mobile" maxlength="20" />
          </el-form-item>
          <el-form-item label="身份证号" prop="idCard">
            <el-input v-model="form.idCard" placeholder="选填，15 或 18 位" maxlength="18" />
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
          <el-form-item label="职位">
            <el-select v-model="form.positions" multiple style="width: 100%">
              <el-option
                v-for="p in positions"
                :key="p._id"
                :label="Number(p.clientLevel) > 0 ? `${p.name}（L${p.clientLevel} 家长）` : p.name"
                :value="p._id"
              />
            </el-select>
          </el-form-item>
          <el-form-item v-if="form.id" label="启用">
            <el-switch v-model="form.isActive" />
          </el-form-item>
        </el-form>
      </template>

      <!-- 新增分支 (form.id 空): 合并「新建用户」+「添加已有用户」为一个流程
           步骤: 输入手机号 → 查找 → 三种分支
             A. 用户不存在 → 显示新建表单
             B. 用户已存在但不在本机构 → 显示分配职位表单
             C. 用户已在当前机构 → 提示信息 + 按钮禁用
      -->
      <template v-else>
        <el-form label-width="90px">
          <el-form-item label="手机号">
            <el-input
              v-model="form.mobile"
              placeholder="输入 11 位手机号后点「查找」"
              maxlength="11"
              @keyup.enter="doLookup"
            >
              <template #append>
                <el-button :loading="lookupLoading" @click="doLookup">查找</el-button>
              </template>
            </el-input>
          </el-form-item>

          <!-- 查找后的三态展示 -->
          <template v-if="lookupState !== 'idle'">
            <!-- A. 用户不存在 → 新建 -->
            <template v-if="lookupState === 'not_found'">
              <el-alert
                type="info"
                show-icon
                :closable="false"
                title="该手机号未注册过"
                description="请补全姓名、密码等基础信息完成新建"
                style="margin-bottom: 16px"
              />
              <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
                <el-form-item label="姓名" prop="realName"><el-input v-model="form.realName" /></el-form-item>
                <el-form-item label="密码">
                  <el-input v-model="form.password" placeholder="留空使用默认密码" show-password />
                </el-form-item>
                <el-form-item label="身份证号" prop="idCard">
                  <el-input v-model="form.idCard" placeholder="选填，15 或 18 位" maxlength="18" />
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
                <el-form-item label="职位">
                  <el-select v-model="form.positions" multiple style="width: 100%">
                    <el-option
                      v-for="p in positions"
                      :key="p._id"
                      :label="Number(p.clientLevel) > 0 ? `${p.name}（L${p.clientLevel} 家长）` : p.name"
                      :value="p._id"
                    />
                  </el-select>
                </el-form-item>
              </el-form>
            </template>

            <!-- B. 用户已存在, 不在本机构 → 分配职位 -->
            <template v-else-if="lookupState === 'found_other_org'">
              <el-alert
                type="success"
                show-icon
                :closable="false"
                :title="`已找到账号：${form.realName || form.mobile}`"
                description="该用户已在其他机构，请为他在本机构分配职位"
                style="margin-bottom: 12px"
              />
              <el-descriptions :column="2" border size="small" style="margin-bottom: 12px">
                <el-descriptions-item label="姓名">{{ form.realName || '—' }}</el-descriptions-item>
                <el-descriptions-item label="手机号">{{ form.mobile }}</el-descriptions-item>
                <el-descriptions-item label="身份证">{{ maskIdCard(form.idCard) }}</el-descriptions-item>
                <el-descriptions-item label="地区">{{ form.regionName || '—' }}</el-descriptions-item>
                <el-descriptions-item label="启用">
                  <el-tag :type="form.isActive ? 'success' : 'info'" size="small">
                    {{ form.isActive ? '是' : '否' }}
                  </el-tag>
                </el-descriptions-item>
              </el-descriptions>
              <el-form-item label="分配职位">
                <el-select v-model="form.positions" multiple style="width: 100%">
                  <el-option
                    v-for="p in positions"
                    :key="p._id"
                    :label="Number(p.clientLevel) > 0 ? `${p.name}（L${p.clientLevel} 家长）` : p.name"
                    :value="p._id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="主属机构">
                <el-switch v-model="form.isMain" />
              </el-form-item>
            </template>

            <!-- C. 用户已在当前机构 → 阻止 -->
            <template v-else-if="lookupState === 'found_same_org'">
              <el-alert
                type="warning"
                show-icon
                :closable="false"
                :title="`该用户 (${form.realName || form.mobile}) 已在当前机构`"
                description="如需调整职位，请关闭弹窗到列表中点击「编辑」修改。"
              />
            </template>
          </template>
        </el-form>
      </template>

      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="lookupState === 'found_same_org' || (!form.id && lookupState === 'idle')"
          @click="submit"
        >
          {{ submitText }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetDialog" title="重置密码" width="380px">
      <el-input v-model="newPassword" placeholder="新密码 (6-64)" show-password />
      <template #footer>
        <el-button @click="resetDialog = false">取消</el-button>
        <el-button type="primary" @click="doReset">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { userApi } from '@/api/user'
import { handleRemoveError } from '@/utils/removable'
import { positionApi } from '@/api/position'
import { regionApi } from '@/api/region'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const list = ref([])
const positions = ref([])
const regionTree = ref([])
const loading = ref(false)
const dialog = ref(false)
const resetDialog = ref(false)
const saving = ref(false)

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
const formRef = ref()
const form = reactive({
  id: '',
  realName: '',
  mobile: '',
  password: '',
  idCard: '',
  region: null,
  regionName: '',
  positions: [],
  isActive: true,
  isMain: false,
  // 查找时拿到的 user._id (用于 attach)
  existingUserId: null
})
const formRegion = ref(null)
const newPassword = ref('')
let resetTarget = null

// ===== 合并后的「添加用户」流程状态 =====
// lookupState:
//   'idle'           - 还没查找 / 输入手机号未确定
//   'not_found'      - 手机号无对应账号 → 显示新建表单
//   'found_other_org'- 账号存在但不在本机构 → 显示分配职位表单
//   'found_same_org' - 账号已在本机构 → 提示并禁用提交
const lookupState = ref('idle')
const lookupLoading = ref(false)

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

const rules = {
  realName: [{ required: true, message: '请填写姓名', trigger: 'blur' }],
  mobile: [
    { required: true, message: '请填写手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }
  ],
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
  resetCreate()
  dialog.value = true
}

function resetCreate() {
  Object.assign(form, {
    id: '',
    realName: '',
    mobile: '',
    password: '',
    idCard: '',
    region: null,
    regionName: '',
    positions: [],
    isActive: true,
    isMain: false,
    existingUserId: null
  })
  formRegion.value = null
  lookupState.value = 'idle'
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id,
    realName: row.realName,
    mobile: row.mobile,
    idCard: row.idCard || '',
    region: row.region || null,
    positions: (row.positions || []).map((p) => p.id),
    isActive: row.isActive
  })
  formRegion.value = row.region || null
  lookupState.value = 'idle'
  dialog.value = true
}

watch(formRegion, (v) => {
  form.region = v || null
})

/**
 * 弹窗标题 / 提交按钮文案 — 合并后随查找状态变化
 * - 编辑: '编辑用户' / '保存'
 * - 新建分支 A (未查到): '添加用户' / '新建'
 * - 新建分支 B (查到但不在本机构): '添加用户' / '加入机构'
 * - 新建分支 C (已在本机构): 提交按钮禁用
 */
const dialogTitle = computed(() => {
  if (form.id) return '编辑用户'
  return '添加用户'
})
const submitText = computed(() => {
  if (form.id) return '保存'
  if (lookupState.value === 'found_other_org') return '加入机构'
  return '新建'
})

/**
 * 查找手机号:
 *   - 用户不存在 → lookupState='not_found', 显示新建表单
 *   - 用户存在且 currentOrgRel 非空 → lookupState='found_same_org', 提示
 *   - 用户存在但 currentOrgRel 为空 → lookupState='found_other_org', 显示分配职位表单
 */
async function doLookup() {
  const m = (form.mobile || '').trim()
  if (!/^1[3-9]\d{9}$/.test(m)) {
    return ElMessage.warning('请输入合法的 11 位手机号')
  }
  lookupLoading.value = true
  try {
    const r = await userApi.lookup({ mobile: m })
    const u = r.data
    if (u && u.currentOrgRel) {
      // 已在当前机构
      Object.assign(form, {
        realName: u.realName || '',
        idCard: u.idCard || '',
        regionName: u.region?.name || '',
        isActive: !!u.isActive,
        existingUserId: u.id,
        positions: []
      })
      lookupState.value = 'found_same_org'
    } else {
      // 存在但不在本机构 → 可加入
      Object.assign(form, {
        realName: u.realName || '',
        idCard: u.idCard || '',
        regionName: u.region?.name || '',
        isActive: !!u.isActive,
        existingUserId: u.id,
        positions: [],
        isMain: false
      })
      lookupState.value = 'found_other_org'
    }
  } catch (e) {
    // 后端 lookup 在用户不存在时返回 404 → catch 内走新建分支
    lookupState.value = 'not_found'
    Object.assign(form, {
      realName: '',
      password: '',
      idCard: '',
      region: null,
      regionName: '',
      positions: []
    })
    formRegion.value = null
  } finally {
    lookupLoading.value = false
  }
}

async function submit() {
  // 编辑分支 → 走原 update
  if (form.id) {
    try {
      await formRef.value.validate()
    } catch {
      return
    }
    saving.value = true
    try {
      await userApi.update(form.id, {
        realName: form.realName,
        idCard: form.idCard || null,
        region: form.region,
        isActive: form.isActive
      })
      await userApi.setPositions(form.id, form.positions)
      ElMessage.success('已保存')
      dialog.value = false
      load()
    } finally {
      saving.value = false
    }
    return
  }

  // 新建分支: 必须先查找过
  if (lookupState.value === 'idle') {
    return ElMessage.warning('请先输入手机号并点击「查找」')
  }
  if (lookupState.value === 'found_same_org') {
    return ElMessage.warning('该用户已在当前机构，请关闭弹窗到列表中编辑')
  }

  saving.value = true
  try {
    if (lookupState.value === 'not_found') {
      // A. 新建用户
      try {
        await formRef.value.validate()
      } catch {
        saving.value = false
        return
      }
      await userApi.create({
        mobile: form.mobile,
        password: form.password || undefined,
        realName: form.realName,
        idCard: form.idCard || undefined,
        region: form.region || undefined,
        positions: form.positions
      })
      ElMessage.success('已创建')
    } else if (lookupState.value === 'found_other_org') {
      // B. 把已有用户加入本机构
      await userApi.attachToOrg(form.existingUserId, {
        positions: form.positions,
        isMain: form.isMain
      })
      ElMessage.success('已加入机构')
    }
    dialog.value = false
    load()
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
  if (newPassword.value.length < 6) return ElMessage.warning('新密码至少 6 位')
  await userApi.resetPassword(resetTarget.id, { newPassword: newPassword.value })
  ElMessage.success('已重置')
  resetDialog.value = false
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
