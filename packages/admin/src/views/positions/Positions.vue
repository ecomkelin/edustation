<template>
  <div class="page positions-page">
    <!-- 顶部说明 + 操作 -->
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2 class="title">职位 / 权限</h2>
          <div class="subtitle">管理本机构的「职位 = 角色 + 权限码集合」，分配给员工后立即生效。</div>
        </div>
        <div class="header-actions">
          <el-tooltip
            :disabled="!!auth.currentOrgId"
            content="请先在顶部「机构切换」中选择一个目标机构"
            placement="top"
          >
            <el-button :disabled="!auth.currentOrgId" @click="openCreate">新建职位</el-button>
          </el-tooltip>
          <el-tooltip
            v-if="auth.isPlatformAdmin"
            :disabled="!!auth.currentOrgId"
            content="请先在顶部「机构切换」中选择一个目标机构"
            placement="top"
          >
            <el-button
              type="primary"
              :disabled="!auth.currentOrgId"
              @click="openSync"
            >从其他机构同步职位</el-button>
          </el-tooltip>
        </div>
      </div>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="什么是职位？"
        description="职位是「角色 + 一组权限码」。把它分配给员工后，员工即拥有该职位下所有权限码对应的操作能力。系统职位不可删除；修改任何职位的权限码，会立即影响所有持有该职位的员工的实际操作权限。"
        style="margin-top: 12px"
      />
    </el-card>

    <!-- 筛选 -->
    <el-card shadow="never" class="filter-card">
      <el-form inline @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="按名称过滤（客户端）"
            clearable
            style="width: 220px"
            @input="onFilterInput"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.isSystem" style="width: 130px" @change="filtersTick++">
            <el-option label="全部" value="all" />
            <el-option label="系统职位" value="system" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="家长等级">
          <el-select v-model="filters.clientLevel" style="width: 160px" @change="filtersTick++">
            <el-option label="全部" value="all" />
            <el-option label="非家长 (staff)" value="staff" />
            <el-option label="家长 (clientLevel ≥ 1)" value="client" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-table
      :data="filteredList"
      v-loading="loading"
      border
      style="margin-top: 12px"
      empty-text="暂无职位"
    >
      <el-table-column label="名称" min-width="220">
        <template #default="{ row }">
          <div class="name-cell">
            <span class="name">{{ row.name }}</span>
            <el-tag
              v-if="row.isSystem"
              type="info"
              size="small"
            >
              <el-tooltip
                content="系统内置职位：不可删除；修改名称后可能会影响业务层判断。"
                placement="top"
              >
                系统
              </el-tooltip>
            </el-tag>
            <el-tag
              v-if="Number(row.clientLevel) > 0"
              type="warning"
              size="small"
            >
              <el-tooltip
                :content="`本机构的家长岗位（clientLevel=${row.clientLevel}）。clientLevel 越大权限/等级越高；只有持有该职位的家长才能在 C 端登录。`"
                placement="top"
              >
                L{{ row.clientLevel }} 家长
              </el-tooltip>
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="权限" min-width="180">
        <template #default="{ row }">
          <el-popover
            v-if="row.permissions && row.permissions.length"
            placement="right"
            :width="420"
            trigger="click"
            popper-class="perm-popover"
          >
            <template #reference>
              <el-button text type="primary">
                {{ row.permissions.length }} 项 ▾
              </el-button>
            </template>
            <div v-for="g in groupedPermissions(row.permissions)" :key="g.key" class="pop-group">
              <div class="pop-group-title">{{ g.label }}</div>
              <div
                v-for="p in g.items"
                :key="p.code"
                class="pop-item"
              >
                <el-tooltip
                  :content="p.description || '暂无说明'"
                  placement="top"
                  :show-after="200"
                >
                  <span class="pop-code">{{ p.code }}</span>
                </el-tooltip>
                <span class="pop-label">{{ p.label }}</span>
              </div>
            </div>
          </el-popover>
          <span v-else style="color: #999">无</span>
        </template>
      </el-table-column>

      <el-table-column label="系统" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isSystem ? 'warning' : 'info'" size="small">
            {{ row.isSystem ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          <span style="color: #606266">{{ formatDate(row.createdAt) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <!-- 「误操删除」:系统职位不可删;无员工持有该职位才能删 -->
          <DestructiveConfirm
            v-if="!row.isSystem && isPlatformAdmin"
            :target="`职位 ${row.name}`"
            warning="高风险"
            :precheck-notes="['无员工持有该职位']"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" type="danger">误操删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑 / 新建弹窗 -->
    <el-dialog
      v-model="dialog"
      :title="form._id ? '编辑职位' : '新建职位'"
      width="720px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input
            v-model="form.name"
            maxlength="50"
            show-word-limit
            placeholder="本机构内唯一，1-50 字"
          />
        </el-form-item>

        <el-form-item label="家长等级">
          <el-input-number
            v-model="form.clientLevel"
            :min="0"
            :max="99"
            :step="1"
            :disabled="form._isSystem"
            style="width: 140px"
          />
          <span class="clientlevel-hint">
            0 = 非家长（staff 端岗位）；≥ 1 = 家长岗位，数字越大等级越高
          </span>
        </el-form-item>

        <el-alert
          v-if="Number(form.clientLevel) > 0"
          type="warning"
          :closable="false"
          show-icon
          :title="`家长岗位（L${form.clientLevel}）`"
          :description="`本机构内每个 clientLevel 至多一个岗位。${takenClientLevelHint}`"
          style="margin-bottom: 12px"
        />

        <el-form-item label="权限">
          <div class="perm-picker">
            <el-collapse v-model="expandedGroups">
              <el-collapse-item
                v-for="g in catalog"
                :key="g.key"
                :name="g.key"
              >
                <template #title>
                  <div class="group-title">
                    <span class="group-label">{{ g.label }}</span>
                    <span class="group-count">({{ g.permissions.length }})</span>
                    <div class="group-actions">
                      <el-button
                        type="primary"
                        link
                        size="small"
                        @click.stop="selectAllInGroup(g, true)"
                      >全选</el-button>
                      <el-button
                        type="primary"
                        link
                        size="small"
                        @click.stop="selectAllInGroup(g, false)"
                      >全不选</el-button>
                    </div>
                  </div>
                </template>
                <div v-if="g.description" class="group-desc">{{ g.description }}</div>
                <el-checkbox-group v-model="form.permissions" class="perm-list">
                  <el-tooltip
                    v-for="p in g.permissions"
                    :key="p"
                    :content="getPermissionMeta(p)?.description || '暂无说明'"
                    placement="top"
                    :show-after="200"
                  >
                    <el-checkbox :value="p" class="perm-checkbox">
                      <span class="perm-code">{{ p }}</span>
                      <span class="perm-label">{{ getPermissionMeta(p)?.label || '' }}</span>
                    </el-checkbox>
                  </el-tooltip>
                </el-checkbox-group>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 跨机构同步弹窗 -->
    <el-dialog
      v-model="syncDialog"
      title="从其他机构同步职位"
      width="820px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="同步规则"
        description="仅复制与本公司不同名的职位。同名职位会被自动跳过，不会覆盖也不会报错。新职位在本机构内默认为「自定义 / 非家长」，可后续编辑。"
        style="margin-bottom: 12px"
      />

      <!-- 目标机构：顶部「机构切换」里选中的那个（= auth.currentOrgId） -->
      <div class="target-org-bar">
        <span class="label">目标机构：</span>
        <span class="value">{{ currentOrgName || '（未选择）' }}</span>
        <el-tag v-if="currentOrgName" type="info" size="small">
          同步到此
        </el-tag>
      </div>

      <el-form label-width="80px" style="margin-top: 8px">
        <el-form-item label="源机构">
          <el-select
            v-model="selectedSourceOrgId"
            filterable
            remote
            :remote-method="searchSourceOrgs"
            :loading="sourceOrgsLoading"
            placeholder="搜索源机构（名称 / 简称 / 信用代码）"
            style="width: 100%"
            @change="onSourceOrgChange"
          >
            <el-option
              v-for="o in sourceOrgs"
              :key="o._id"
              :value="o._id"
              :label="`${o.name}${o.nameAbbreviation ? '（' + o.nameAbbreviation + '）' : ''}`"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <el-table
        v-if="selectedSourceOrgId"
        ref="syncTableRef"
        :data="sourcePositions"
        v-loading="sourcePositionsLoading"
        border
        @selection-change="onSelectionChange"
        empty-text="该源机构下暂无职位"
        max-height="420"
      >
        <el-table-column
          type="selection"
          width="48"
          :selectable="(row) => !row.existsInCurrent"
        />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="权限" width="100">
          <template #default="{ row }">
            <span style="color: #606266">{{ (row.permissions || []).length }} 项</span>
          </template>
        </el-table-column>
        <el-table-column label="源端系统" width="100">
          <template #default="{ row }">
            <el-tooltip
              v-if="row.isSystem"
              content="在源机构里是系统内置职位；同步到本公司后将变为普通自定义职位。"
              placement="top"
            >
              <el-tag type="info" size="small">系统</el-tag>
            </el-tooltip>
            <span v-else style="color: #999">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="160">
          <template #default="{ row }">
            <el-tag v-if="row.existsInCurrent" type="warning" size="small">
              已存在，将跳过
            </el-tag>
            <el-tag v-else type="success" size="small">可同步</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="selectedSourceOrgId" class="sync-summary">
        已选 <b>{{ selectedPositionIds.length }}</b> 个可同步；
        <span style="color: #909399">
          源机构共 {{ sourcePositions.length }} 个，其中
          {{ sourcePositions.filter((p) => p.existsInCurrent).length }} 个与本公司同名将被跳过
        </span>
      </div>

      <template #footer>
        <el-button @click="syncDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="syncing"
          :disabled="!selectedPositionIds.length"
          @click="confirmSync"
        >
          同步 {{ selectedPositionIds.length }} 个职位
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { positionApi } from '@/api/position'
import { useAuthStore } from '@/stores/auth'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
// 直接读 JSON：Vite 原生支持 JSON import；CJS 包装的 permissions.js 在 Rollup 静态分析下拿不到具名导出。
import sharedPermissionsData from '@shared/permissions.json'

/**
 * 把分组的权限配置拍平为 code -> { groupKey, groupLabel, label, description } 的查找表。
 * 服务端的 @shared/permissions.js 也提供同名 API；这里仅供前端做权限元数据展示。
 */
const sharedPermissionMeta = (() => {
  const out = {}
  for (const g of sharedPermissionsData.groups || []) {
    for (const code of g.permissions || []) {
      out[code] = {
        groupKey: g.key,
        groupLabel: g.label,
        groupDescription: g.description || '',
        label: (g.permissionLabels && g.permissionLabels[code] && g.permissionLabels[code].label) || code,
        description: (g.permissionLabels && g.permissionLabels[code] && g.permissionLabels[code].description) || ''
      }
    }
  }
  return out
})()
function sharedGetPermissionMeta(code) {
  return sharedPermissionMeta[code] || null
}

const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const list = ref([])
const catalog = ref([]) // [{ key, label, description, permissionLabels, permissions: [String] }]
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)

// 当前目标机构名称（从 auth.orgs / auth.currentOrgId 推导；供同步弹窗头部展示）
const currentOrgName = computed(() => {
  const id = auth.currentOrgId
  if (!id) return ''
  const org = (auth.orgs || []).find((o) => (o.id || o._id) === id)
  return org ? org.name : ''
})

const form = reactive({
  _id: '',
  _isSystem: false,
  _clientLevel: 0,
  clientLevel: 0,
  name: '',
  permissions: []
})

// 默认全展开；catalog 异步加载完成后，保留已有展开项并把新增组也展开
const expandedGroups = ref([])
watch(
  catalog,
  (val) => {
    const keys = val.map((g) => g.key)
    const set = new Set(expandedGroups.value)
    for (const k of keys) set.add(k)
    expandedGroups.value = Array.from(set)
  },
  { immediate: true }
)
const filters = reactive({ keyword: '', isSystem: 'all', clientLevel: 'all' })
const filtersTick = ref(0) // 触发 computed（select 变化时 +1）

const filteredList = computed(() => {
  // 引用 filtersTick 让其参与依赖
  void filtersTick.value
  const kw = (filters.keyword || '').trim().toLowerCase()
  return list.value.filter((p) => {
    if (filters.isSystem === 'system' && !p.isSystem) return false
    if (filters.isSystem === 'custom' && p.isSystem) return false
    if (filters.clientLevel === 'client' && Number(p.clientLevel) <= 0) return false
    if (filters.clientLevel === 'staff' && Number(p.clientLevel) > 0) return false
    if (kw && !p.name.toLowerCase().includes(kw)) return false
    return true
  })
})

let kwDebounce = null
function onFilterInput() {
  if (kwDebounce) clearTimeout(kwDebounce)
  kwDebounce = setTimeout(() => {
    filtersTick.value++
  }, 300)
}

function resetFilters() {
  filters.keyword = ''
  filters.isSystem = 'all'
  filters.clientLevel = 'all'
  filtersTick.value++
}

async function load() {
  loading.value = true
  try {
    const r = await positionApi.list({ pageSize: 200 })
    list.value = r.data.items
  } finally {
    loading.value = false
  }
}

async function loadCatalog() {
  const r = await positionApi.catalog()
  // 保留 group 的 description（即使后端没传也不报错）
  catalog.value = (r.data.groups || []).map((g) => ({
    key: g.key,
    label: g.label,
    description: g.description || '',
    permissions: g.permissions || []
  }))
}

function openCreate() {
  Object.assign(form, { _id: '', _isSystem: false, _clientLevel: 0, clientLevel: 0, name: '', permissions: [] })
  dialog.value = true
}

function openEdit(row) {
  const lvl = Number(row.clientLevel) || 0
  Object.assign(form, {
    _id: row._id,
    _isSystem: !!row.isSystem,
    _clientLevel: lvl,
    clientLevel: lvl,
    name: row.name,
    permissions: [...(row.permissions || [])]
  })
  dialog.value = true
}

async function submit() {
  if (!form.name) return ElMessage.warning('请填写名称')
  const newLevel = Number(form.clientLevel) || 0
  // 同 org 内同 clientLevel>0 已被其他岗位占用的预校验，避免无效请求
  if (newLevel > 0) {
    const conflict = list.value.find(
      (p) => Number(p.clientLevel) === newLevel && p._id !== form._id
    )
    if (conflict) {
      return ElMessage.warning(`本机构已存在 clientLevel=${newLevel} 的家长岗位「${conflict.name}」，请换一个等级或编辑该岗位`)
    }
  }
  saving.value = true
  try {
    if (form._id) {
      await positionApi.update(form._id, {
        name: form.name,
        clientLevel: newLevel
      })
      await positionApi.setPermissions(form._id, form.permissions)
    } else {
      await positionApi.create({ name: form.name, permissions: form.permissions, clientLevel: newLevel })
    }
    ElMessage.success('已保存')
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

// 拼出"已被其他岗位占用的等级"提示，避免用户白提交一次
const takenClientLevelHint = computed(() => {
  const taken = list.value
    .filter((p) => Number(p.clientLevel) > 0 && p._id !== form._id)
    .map((p) => `L${p.clientLevel}（${p.name}）`)
  if (!taken.length) return '当前机构内尚无其他家长岗位，可放心创建。'
  return `当前机构已被占用的家长等级：${taken.join('、')}。请选一个未占用的等级。`
})

async function onRemoveConfirm(row, { password }) {
  try {
    await positionApi.remove(row._id, { password })
    ElMessage.success('已删除')
    load()
  } catch (_e) {
    // 错误已 ElMessage
  }
}

/* ----- 权限码展示辅助 ----- */

function getPermissionMeta(code) {
  // 优先使用 catalog 内嵌的元数据（catalog 含 description），若没有再回退到 shared
  return getPermissionMetaRaw(code) || fallbackMeta(code)
}

function getPermissionMetaRaw(code) {
  for (const g of catalog.value) {
    const labels = g.permissionLabels
    if (labels && labels[code]) {
      return {
        groupKey: g.key,
        groupLabel: g.label,
        label: labels[code].label,
        description: labels[code].description
      }
    }
  }
  return null
}

function fallbackMeta(code) {
  const m = sharedGetPermissionMeta(code)
  return m ? { groupKey: m.groupKey, groupLabel: m.groupLabel, label: m.label, description: m.description } : null
}

function selectAllInGroup(g, checked) {
  const set = new Set(form.permissions)
  if (checked) {
    for (const p of g.permissions) set.add(p)
  } else {
    for (const p of g.permissions) set.delete(p)
  }
  form.permissions = Array.from(set)
}

function groupedPermissions(perms) {
  // 按 group 聚合，供 popover 展示
  const map = new Map()
  for (const code of perms || []) {
    const g = catalog.value.find((x) => (x.permissions || []).includes(code))
    const key = g ? g.key : '_other'
    const label = g ? g.label : '其他'
    if (!map.has(key)) map.set(key, { key, label, items: [] })
    const meta = getPermissionMeta(code)
    map.get(key).items.push({
      code,
      label: meta?.label || code,
      description: meta?.description || ''
    })
  }
  return Array.from(map.values())
}

function formatDate(d) {
  if (!d) return '-'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '-'
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

/* ----- 跨机构同步 ----- */

const syncDialog = ref(false)
const sourceOrgs = ref([])
const sourceOrgsLoading = ref(false)
const selectedSourceOrgId = ref('')
const sourcePositions = ref([])
const sourcePositionsLoading = ref(false)
const existingNamesInCurrentOrg = ref(new Set())
const selectedPositionIds = ref([])
const syncing = ref(false)
const syncTableRef = ref(null)

async function openSync() {
  syncDialog.value = true
  // 重置状态
  sourceOrgs.value = []
  selectedSourceOrgId.value = ''
  sourcePositions.value = []
  selectedPositionIds.value = []
  // 预拉当前机构职位名（用于 existsInCurrent 判定）
  try {
    const r = await positionApi.list({ pageSize: 500 })
    existingNamesInCurrentOrg.value = new Set((r.data.items || []).map((p) => p.name))
  } catch (e) {
    // ignore; 弹窗继续打开
  }
  // 默认列前 20 个源机构
  await searchSourceOrgs('')
}

async function searchSourceOrgs(keyword) {
  sourceOrgsLoading.value = true
  try {
    const r = await positionApi.listSourceOrgs({ keyword })
    sourceOrgs.value = r.data.items || []
  } finally {
    sourceOrgsLoading.value = false
  }
}

async function onSourceOrgChange(orgId) {
  sourcePositions.value = []
  selectedPositionIds.value = []
  if (!orgId) return
  sourcePositionsLoading.value = true
  try {
    const r = await positionApi.listByOrg(orgId)
    sourcePositions.value = (r.data.items || []).map((p) => ({
      ...p,
      existsInCurrent: existingNamesInCurrentOrg.value.has(p.name)
    }))
    // 预选所有「可同步」行
    await nextTick()
    if (syncTableRef.value) {
      sourcePositions.value
        .filter((p) => !p.existsInCurrent)
        .forEach((row) => syncTableRef.value.toggleRowSelection(row, true))
    }
  } finally {
    sourcePositionsLoading.value = false
  }
}

function onSelectionChange(rows) {
  selectedPositionIds.value = rows.map((r) => r._id)
}

async function confirmSync() {
  if (!selectedPositionIds.value.length) return
  const N = selectedPositionIds.value.length
  try {
    await ElMessageBox.confirm(
      `将向当前机构创建 ${N} 个职位（与本公司不同名），是否继续？`,
      '提示',
      { type: 'info' }
    )
  } catch {
    return
  }
  syncing.value = true
  try {
    const r = await positionApi.sync({
      sourceOrgId: selectedSourceOrgId.value,
      positionIds: selectedPositionIds.value
    })
    const { createdCount = 0, skippedCount = 0 } = r.data || {}
    ElMessage.success(`已创建 ${createdCount} 个，跳过 ${skippedCount} 个`)
    syncDialog.value = false
    load()
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  load()
  loadCatalog()
})
</script>

<style scoped>
.positions-page { display: flex; flex-direction: column; gap: 12px; }
.header-card { border: none; }
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.title { margin: 0 0 4px 0; font-size: 20px; }
.subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }

.filter-card { border: none; }

.name-cell { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.name { font-weight: 500; }

.perm-picker {
  width: 100%;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 4px 12px;
  max-height: 460px;
  overflow-y: auto;
}
.clientlevel-hint {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.group-label { font-weight: 600; font-size: 14px; }
.group-count { color: #909399; font-size: 12px; }
.group-actions { margin-left: auto; display: flex; gap: 4px; }
.group-desc {
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
  padding: 4px 0 8px 0;
}
.perm-list { display: flex; flex-direction: column; gap: 4px; padding: 4px 0 12px 0; }
.perm-checkbox { width: 100%; margin-right: 0; }
.perm-code { color: #606266; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.perm-label { color: #303133; margin-left: 8px; }

.pop-group + .pop-group { margin-top: 10px; }
.pop-group-title {
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
  padding-bottom: 4px;
  margin-bottom: 6px;
}
.pop-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 13px;
}
.pop-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #606266; min-width: 170px; }
.pop-label { color: #303133; }

.sync-summary { margin-top: 12px; color: #606266; font-size: 13px; }
.target-org-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  border: 1px dashed #dcdfe6;
  margin-bottom: 4px;
}
.target-org-bar .label { color: #909399; font-size: 13px; }
.target-org-bar .value { color: #303133; font-weight: 600; font-size: 14px; }
</style>

<style>
/* popover 内容不限定在 scoped 内，否则 Element Plus 注入的 popper 找不到 */
.perm-popover { padding: 12px 14px !important; }
</style>
