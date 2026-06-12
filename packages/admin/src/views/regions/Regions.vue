<template>
  <div class="page">
    <h2>地区字典</h2>
    <p class="hint">省/市/区三级行政区。机构归属用。平台超管维护，全局共享。</p>

    <el-row :gutter="16">
      <el-col :span="8">
        <el-card shadow="never" class="tree-card">
          <template #header>
            <div class="card-head">
              <span>地区树</span>
              <el-button size="small" type="primary" @click="openCreate(null)">新建顶级</el-button>
            </div>
          </template>
          <el-input v-model="filterText" placeholder="搜索地区" clearable size="small" style="margin-bottom: 8px" />
          <el-tree
            ref="treeRef"
            :data="tree"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            :filter-node-method="filterNode"
            highlight-current
            :expand-on-click-node="false"
            @node-click="onSelect"
          >
            <template #default="{ node, data }">
              <span class="tree-node">
                <span>{{ node.label }}</span>
                <span class="tree-actions">
                  <el-button link size="small" @click.stop="openCreate(data)">+ 子级</el-button>
                  <el-button link size="small" type="primary" @click.stop="openEdit(data)">编辑</el-button>
                  <!-- 误操删除:无子级 + 无 Org 引用才能删 -->
                  <DestructiveConfirm
                    :target="`地区 ${data.name}`"
                    warning="中风险"
                    :precheck-notes="['无子级地区', '无任何机构引用该地区']"
                    :precheck="() => regionApi.removableCheck(data._id).then((r) => r.data)"
                    @click.stop
                    @confirm="(p) => onRemoveConfirm(data, p)"
                  >
                    <el-button link size="small" type="danger">误操删除</el-button>
                  </DestructiveConfirm>
                </span>
              </span>
            </template>
          </el-tree>
        </el-card>
      </el-col>
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>
            <div class="card-head">
              <span>
                {{ selected ? `${selected.name} 的子级` : '请从左侧选择一个节点' }}
              </span>
              <el-button v-if="selected" size="small" type="primary" @click="openCreate(selected)">+ 子级</el-button>
            </div>
          </template>
          <el-table :data="children" v-loading="loading" border>
            <el-table-column prop="name" label="名称" min-width="160" />
            <el-table-column prop="code" label="编码" width="120" />
            <el-table-column prop="level" label="层级" width="80">
              <template #default="{ row }">L{{ row.level }}</template>
            </el-table-column>
            <el-table-column prop="sort" label="排序" width="80" />
            <el-table-column label="启用" width="80">
              <template #default="{ row }">
                <el-tag :type="row.isActive !== false ? 'success' : 'info'">
                  {{ row.isActive !== false ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="240" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openEdit(row)">编辑</el-button>
                <el-button size="small" @click="openCreate(row)">+ 子级</el-button>
                <DestructiveConfirm
                  :target="`地区 ${row.name}`"
                  warning="中风险"
                  :precheck-notes="['无子级地区', '无任何机构引用该地区']"
                  :precheck="() => regionApi.removableCheck(row._id).then((r) => r.data)"
                  @confirm="(p) => onRemoveConfirm(row, p)"
                >
                  <el-button size="small" type="danger">误操删除</el-button>
                </DestructiveConfirm>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="dialog" :title="form.id ? '编辑地区' : '新建地区'" width="440px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="编码">
          <el-input v-model="form.code" maxlength="50" />
        </el-form-item>
        <el-form-item label="父级">
          <el-tree-select
            v-model="form.parent"
            :data="parentOptions"
            :props="{ value: 'id', label: 'name', children: 'children' }"
            check-strictly
            clearable
            placeholder="不选则为顶级"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
        </el-form-item>
        <el-form-item v-if="form.id" label="启用">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { regionApi } from '@/api/region'
import { handleRemoveError } from '@/utils/removable'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'

const tree = ref([])
const treeRef = ref()
const filterText = ref('')
const selected = ref(null)
const children = ref([])
const loading = ref(false)

const dialog = ref(false)
const saving = ref(false)
const formRef = ref()
const form = reactive(emptyForm())
const parentOptions = ref([])

function emptyForm() {
  return { id: '', name: '', code: '', parent: null, sort: 0, isActive: true }
}

const rules = {
  name: [{ required: true, message: '请填写名称', trigger: 'blur' }]
}

watch(filterText, (v) => {
  treeRef.value?.filter(v)
})

function filterNode(value, data) {
  if (!value) return true
  return data.name.includes(value)
}

async function loadTree() {
  const r = await regionApi.tree()
  tree.value = normalize(r.data || [])
}

function normalize(arr) {
  return arr.map((n) => ({
    ...n,
    id: n.id || n._id,
    children: n.children && n.children.length ? normalize(n.children) : []
  }))
}

async function loadChildren() {
  loading.value = true
  try {
    if (!selected.value) {
      children.value = []
      return
    }
    const r = await regionApi.list({ parent: selected.value.id || selected.value._id })
    children.value = (r.data || []).map((c) => ({ ...c, id: c.id || c._id }))
  } finally {
    loading.value = false
  }
}

function onSelect(node) {
  selected.value = node
  loadChildren()
}

async function loadParents(excludeId = null) {
  const r = await regionApi.tree()
  let list = normalize(r.data || [])
  if (excludeId) {
    list = filterDescendants(list, excludeId)
  }
  parentOptions.value = list
}

function filterDescendants(tree, excludeId) {
  return tree
    .filter((n) => (n.id || n._id) !== excludeId)
    .map((n) => ({ ...n, children: filterDescendants(n.children || [], excludeId) }))
}

function openCreate(parentNode) {
  Object.assign(form, emptyForm(), { parent: parentNode ? parentNode.id || parentNode._id : null })
  dialog.value = true
  loadParents(null)
}

function openEdit(node) {
  Object.assign(form, {
    id: node.id || node._id,
    name: node.name,
    code: node.code || '',
    parent: node.parent ? node.parent.id || node.parent._id : null,
    sort: node.sort || 0,
    isActive: node.isActive !== false
  })
  dialog.value = true
  loadParents(form.id)
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
      name: form.name,
      code: form.code,
      parent: form.parent || null,
      sort: form.sort,
      isActive: form.isActive
    }
    if (form.id) {
      await regionApi.update(form.id, payload)
      ElMessage.success('已更新')
    } else {
      await regionApi.create(payload)
      ElMessage.success('已创建')
    }
    dialog.value = false
    await loadTree()
    if (selected.value) await loadChildren()
  } finally {
    saving.value = false
  }
}

async function onRemoveConfirm(node, { password }) {
  try {
    await regionApi.remove(node.id || node._id, { password })
    ElMessage.success('已删除')
    await loadTree()
    if (selected.value && (selected.value.id === (node.id || node._id) || selected.value._id === (node.id || node._id))) {
      selected.value = null
    }
    if (selected.value) await loadChildren()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险')
  }
}

onMounted(loadTree)
</script>

<style scoped>
.page {
  max-width: 100%;
}
.hint {
  color: #909399;
  font-size: 13px;
  margin: 4px 0 12px;
}
.tree-card :deep(.el-card__header) {
  padding: 12px 16px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 500;
}
.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-right: 8px;
}
.tree-actions {
  opacity: 0;
  transition: opacity 0.2s;
}
.tree-node:hover .tree-actions {
  opacity: 1;
}
</style>
