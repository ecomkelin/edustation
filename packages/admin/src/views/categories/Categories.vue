<template>
  <div class="page">
    <h2>类别字典</h2>
    <p class="hint">为机构、学生、产品、用户等业务对象提供统一类别。平台超管维护，全局共享。</p>

    <el-row :gutter="16">
      <el-col :span="8">
        <el-card shadow="never" class="tree-card">
          <template #header>
            <div class="card-head">
              <span>类别树</span>
              <el-button size="small" type="primary" @click="openCreate(null)">新建顶级</el-button>
            </div>
          </template>
          <el-radio-group v-model="model" size="small" class="model-group" @change="onModelChange">
            <el-radio-button v-for="m in MODELS" :key="m" :value="m">{{ modelLabel(m) }}</el-radio-button>
          </el-radio-group>
          <el-input
            v-model="filterText"
            placeholder="搜索类别"
            clearable
            size="small"
            style="margin-bottom: 8px"
          />
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
                  <!-- 误操删除:超管+密码二次确认;无子级 + 无 Org 引用才能删 -->
                  <DestructiveConfirm
                    :target="`类别 ${data.name}`"
                    warning="中风险"
                    :precheck-notes="['无子级类别', '无任何机构引用该类别']"
                    :precheck="() => categoryApi.removableCheck(data._id).then((r) => r.data)"
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
                {{ selected ? `${selected.name} 的子级（${modelLabel(model)}）` : `请从左侧选择一个${modelLabel(model)}类别` }}
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
                  :target="`类别 ${row.name}`"
                  warning="中风险"
                  :precheck-notes="['无子级类别', '无任何机构引用该类别']"
                  :precheck="() => categoryApi.removableCheck(row._id).then((r) => r.data)"
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

    <el-dialog v-model="dialog" :title="form.id ? '编辑类别' : '新建类别'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="业务域">
          <el-select v-model="form.model" :disabled="!!form.id" style="width: 100%">
            <el-option v-for="m in MODELS" :key="m" :value="m" :label="modelLabel(m)" />
          </el-select>
          <span class="form-tip">业务域创建后不可修改</span>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="父级">
          <el-tree-select
            v-model="form.parentCategory"
            :data="parentOptions"
            :props="{ value: 'id', label: 'name', children: 'children' }"
            check-strictly
            clearable
            placeholder="不选则为顶级"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="编码">
          <el-input v-model="form.code" maxlength="50" />
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
import { categoryApi } from '@/api/category'
import { handleRemoveError } from '@/utils/removable'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'

const MODELS = ['Org', 'Student', 'Subject', 'LeadTag']
const MODEL_LABELS = { Org: '机构', Student: '学生', Subject: '学科', LeadTag: '家长标签' }

const model = ref('Org')
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
  return { id: '', model: 'Org', name: '', parentCategory: null, code: '', sort: 0, isActive: true }
}

const rules = {
  name: [{ required: true, message: '请填写名称', trigger: 'blur' }]
}

function modelLabel(m) {
  return MODEL_LABELS[m] || m
}

watch(filterText, (v) => {
  treeRef.value?.filter(v)
})

async function loadTree() {
  const r = await categoryApi.tree({ model: model.value })
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
    const r = await categoryApi.list({ model: model.value, parent: selected.value.id || selected.value._id })
    children.value = (r.data || []).map((c) => ({ ...c, id: c.id || c._id }))
  } finally {
    loading.value = false
  }
}

function onSelect(node) {
  selected.value = node
  loadChildren()
}

function onModelChange() {
  selected.value = null
  children.value = []
  loadTree()
}

async function loadParents(excludeId = null) {
  const r = await categoryApi.tree({ model: form.model })
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

function filterNode(value, data) {
  if (!value) return true
  return data.name.includes(value)
}

function openCreate(parentNode) {
  Object.assign(form, emptyForm(), {
    model: model.value,
    parentCategory: parentNode ? parentNode.id || parentNode._id : null
  })
  dialog.value = true
  loadParents(null)
}

function openEdit(node) {
  Object.assign(form, {
    id: node.id || node._id,
    model: node.model || model.value,
    name: node.name,
    parentCategory: node.parentCategory ? node.parentCategory.id || node.parentCategory._id : null,
    code: node.code || '',
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
      model: form.model,
      name: form.name,
      parentCategory: form.parentCategory || null,
      code: form.code,
      sort: form.sort,
      isActive: form.isActive
    }
    if (form.id) {
      await categoryApi.update(form.id, payload)
      ElMessage.success('已更新')
    } else {
      await categoryApi.create(payload)
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
    await categoryApi.remove(node.id || node._id, { password })
    ElMessage.success('已删除')
    await loadTree()
    if (selected.value && (selected.value.id === (node.id || node._id) || selected.value._id === (node.id || node._id))) {
      selected.value = null
    }
    if (selected.value) await loadChildren()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险', `类别 ${node.name}`)
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
.model-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
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
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
