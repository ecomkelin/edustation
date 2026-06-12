<template>
  <div class="page">
    <h2>学科</h2>
    <p class="hint">机构的学科。类别、目标、海报、宣传视频等维护在此；具体课程由「课程模板」承载。</p>

    <el-space style="margin-bottom: 12px">
      <el-input
        v-model="keyword"
        placeholder="按名称搜索"
        clearable
        style="width: 200px"
        @keyup.enter="load"
        @clear="load"
      />
      <el-button @click="load">搜索</el-button>
      <el-button type="primary" @click="openCreate">新建学科</el-button>
      <el-tooltip
        v-if="auth.isPlatformAdmin"
        :disabled="!!auth.currentOrgId"
        content="请先在顶部「机构切换」中选择一个目标机构"
        placement="top"
      >
        <el-button
          :disabled="!auth.currentOrgId"
          @click="openSync"
        >从其他机构同步学科</el-button>
      </el-tooltip>
    </el-space>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="分类" min-width="140">
        <template #default="{ row }">
          <span v-if="row.category">{{ row.category.name }}</span>
          <el-tag v-else type="info" size="small">未分类</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="教学目标" min-width="200">
        <template #default="{ row }">
          <template v-if="row.objectives && row.objectives.length">
            <el-tag v-for="(o, i) in row.objectives.slice(0, 3)" :key="i" size="small" style="margin-right: 4px">
              {{ o }}
            </el-tag>
            <el-tag v-if="row.objectives.length > 3" type="info" size="small">
              +{{ row.objectives.length - 3 }}
            </el-tag>
          </template>
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="海报" width="80">
        <template #default="{ row }">
          <el-image
            v-if="row.posterUrl"
            :src="row.posterUrl"
            :preview-src-list="[row.posterUrl]"
            fit="cover"
            style="width: 48px; height: 48px; border-radius: 4px"
            :hide-on-click-modal="true"
          />
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <!-- 「误操删除」:仅平台超管可见;走二次确认 + 输密码;无 CourseProduct/CourseInstance 引用才能删 -->
          <DestructiveConfirm
            v-if="isPlatformAdmin"
            :target="`学科 ${row.name}`"
            warning="中风险"
            :precheck-notes="['该学科不被任何课程产品引用', '该学科不被任何开班作为主学科']"
            :precheck="() => subjectApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" type="danger">误操删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialog"
      :title="form.id ? '编辑学科' : '新建学科'"
      width="640px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="分类">
          <el-tree-select
            v-model="form.category"
            :data="categoryTree"
            :props="{ value: 'id', label: 'name', children: 'children' }"
            check-strictly
            clearable
            placeholder="不选则不分类"
            style="width: 100%"
          />
          <span class="form-tip">类别需先在「类别字典 - 学科」下维护</span>
        </el-form-item>
        <el-form-item label="教学目标">
          <div class="obj-list">
            <div v-for="(o, i) in form.objectives" :key="i" class="obj-row">
              <el-input v-model="form.objectives[i]" maxlength="200" placeholder="如：掌握基础乐理" />
              <el-button link type="danger" :icon="Delete" @click="form.objectives.splice(i, 1)" />
            </div>
            <el-button :icon="Plus" size="small" @click="form.objectives.push('')">添加目标</el-button>
          </div>
        </el-form-item>
        <el-form-item label="海报 URL">
          <el-input v-model="form.posterUrl" placeholder="https://..." maxlength="500" />
          <el-image
            v-if="form.posterUrl"
            :src="form.posterUrl"
            fit="cover"
            style="width: 96px; height: 96px; border-radius: 4px; margin-top: 8px"
            :preview-src-list="[form.posterUrl]"
            :hide-on-click-modal="true"
          />
        </el-form-item>
        <el-form-item label="宣传视频 URL">
          <el-input v-model="form.videoUrl" placeholder="https://..." maxlength="500" />
        </el-form-item>
        <el-form-item label="课程简介">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            placeholder="富文本内容（当前使用纯文本，后续可接编辑器）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 跨机构同步弹窗（仅平台超管） -->
    <el-dialog
      v-model="syncDialog"
      title="从其他机构同步学科"
      width="820px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="同步规则"
        description="仅复制与本公司不同名的学科。同名学科会被自动跳过，不会覆盖也不会报错。category / objectives / description / posterUrl / videoUrl 一并复制；源端引用的 Category 若已失效，复制后该字段会置空，可后续编辑。"
        style="margin-bottom: 12px"
      />

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
        :data="sourceSubjects"
        v-loading="sourceSubjectsLoading"
        border
        @selection-change="onSelectionChange"
        empty-text="该源机构下暂无学科"
        max-height="420"
      >
        <el-table-column
          type="selection"
          width="48"
          :selectable="(row) => !row.existsInCurrent"
        />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="分类" min-width="120">
          <template #default="{ row }">
            <span v-if="row.category">{{ row.category.name }}</span>
            <el-tag v-else type="info" size="small">未分类</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="教学目标" width="100">
          <template #default="{ row }">
            <span style="color: #606266">{{ (row.objectives || []).length }} 项</span>
          </template>
        </el-table-column>
        <el-table-column label="海报" width="80">
          <template #default="{ row }">
            <el-image
              v-if="row.posterUrl"
              :src="row.posterUrl"
              :preview-src-list="[row.posterUrl]"
              fit="cover"
              style="width: 40px; height: 40px; border-radius: 4px"
              :hide-on-click-modal="true"
            />
            <span v-else class="muted">-</span>
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
        已选 <b>{{ selectedSubjectIds.length }}</b> 个可同步；
        <span style="color: #909399">
          源机构共 {{ sourceSubjects.length }} 个，其中
          {{ sourceSubjects.filter((s) => s.existsInCurrent).length }} 个与本公司同名将被跳过
        </span>
      </div>

      <template #footer>
        <el-button @click="syncDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="syncing"
          :disabled="!selectedSubjectIds.length"
          @click="confirmSync"
        >
          同步 {{ selectedSubjectIds.length }} 个学科
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import { subjectApi } from '@/api/subject'
import { handleRemoveError } from '@/utils/removable'
import { categoryApi } from '@/api/category'
import { useAuthStore } from '@/stores/auth'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const list = ref([])
const loading = ref(false)
const keyword = ref('')
const categoryTree = ref([])

const dialog = ref(false)
const saving = ref(false)
const formRef = ref()
const form = reactive(emptyForm())

function emptyForm() {
  return { id: '', name: '', category: null, objectives: [], posterUrl: '', videoUrl: '', description: '' }
}

const rules = {
  name: [{ required: true, message: '请填写名称', trigger: 'blur' }]
}

async function load() {
  loading.value = true
  try {
    const r = await subjectApi.list({ keyword: keyword.value })
    list.value = (r.data || []).map((s) => ({ ...s, id: s.id || s._id }))
  } finally {
    loading.value = false
  }
}

async function loadCategoryTree() {
  const r = await categoryApi.tree({ model: 'Subject' })
  categoryTree.value = r.data || []
}

function resetForm() {
  Object.assign(form, emptyForm())
  formRef.value?.clearValidate()
}

function openCreate() {
  resetForm()
  dialog.value = true
  loadCategoryTree()
}

function openEdit(row) {
  resetForm()
  Object.assign(form, {
    id: row.id || row._id,
    name: row.name,
    category: row.category ? row.category.id || row.category._id : null,
    objectives: Array.isArray(row.objectives) ? [...row.objectives] : [],
    posterUrl: row.posterUrl || '',
    videoUrl: row.videoUrl || '',
    description: row.description || ''
  })
  dialog.value = true
  loadCategoryTree()
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
    // 过滤空目标
    const objectives = (form.objectives || []).map((o) => (o || '').trim()).filter(Boolean)
    const payload = {
      name: form.name,
      category: form.category || null,
      objectives,
      posterUrl: form.posterUrl || null,
      videoUrl: form.videoUrl || null,
      description: form.description || ''
    }
    if (form.id) {
      await subjectApi.update(form.id, payload)
      ElMessage.success('已更新')
    } else {
      await subjectApi.create(payload)
      ElMessage.success('已创建')
    }
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onRemoveConfirm(row, { password }) {
  try {
    await subjectApi.remove(row.id || row._id, { password })
    ElMessage.success('已删除')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险', `学科 ${row.name}`)
  }
}

/* ----- 跨机构同步（仅平台超管） ----- */

// 当前目标机构名称（从 auth.orgs / auth.currentOrgId 推导）
const currentOrgName = computed(() => {
  const id = auth.currentOrgId
  if (!id) return ''
  const org = (auth.orgs || []).find((o) => (o.id || o._id) === id)
  return org ? org.name : ''
})

const syncDialog = ref(false)
const sourceOrgs = ref([])
const sourceOrgsLoading = ref(false)
const selectedSourceOrgId = ref('')
const sourceSubjects = ref([])
const sourceSubjectsLoading = ref(false)
const existingNamesInCurrentOrg = ref(new Set())
const selectedSubjectIds = ref([])
const syncing = ref(false)
const syncTableRef = ref(null)

async function openSync() {
  syncDialog.value = true
  // 重置状态
  sourceOrgs.value = []
  selectedSourceOrgId.value = ''
  sourceSubjects.value = []
  selectedSubjectIds.value = []
  // 预拉当前机构学科名（用于 existsInCurrent 判定）
  try {
    const r = await subjectApi.list({ pageSize: 500 })
    existingNamesInCurrentOrg.value = new Set((r.data || []).map((s) => s.name))
  } catch (e) {
    // ignore; 弹窗继续打开
  }
  // 默认列前 20 个源机构
  await searchSourceOrgs('')
}

async function searchSourceOrgs(keyword) {
  sourceOrgsLoading.value = true
  try {
    const r = await subjectApi.listSourceOrgs({ keyword })
    sourceOrgs.value = r.data.items || []
  } finally {
    sourceOrgsLoading.value = false
  }
}

async function onSourceOrgChange(orgId) {
  sourceSubjects.value = []
  selectedSubjectIds.value = []
  if (!orgId) return
  sourceSubjectsLoading.value = true
  try {
    const r = await subjectApi.listByOrg(orgId)
    sourceSubjects.value = (r.data.items || []).map((s) => ({
      ...s,
      existsInCurrent: existingNamesInCurrentOrg.value.has(s.name)
    }))
    // 预选所有「可同步」行
    await nextTick()
    if (syncTableRef.value) {
      sourceSubjects.value
        .filter((s) => !s.existsInCurrent)
        .forEach((row) => syncTableRef.value.toggleRowSelection(row, true))
    }
  } finally {
    sourceSubjectsLoading.value = false
  }
}

function onSelectionChange(rows) {
  selectedSubjectIds.value = rows.map((r) => r._id)
}

async function confirmSync() {
  if (!selectedSubjectIds.value.length) return
  const N = selectedSubjectIds.value.length
  try {
    await ElMessageBox.confirm(
      `将向当前机构创建 ${N} 个学科（与本公司不同名），是否继续？`,
      '提示',
      { type: 'info' }
    )
  } catch {
    return
  }
  syncing.value = true
  try {
    const r = await subjectApi.sync({
      sourceOrgId: selectedSourceOrgId.value,
      subjectIds: selectedSubjectIds.value
    })
    const { createdCount = 0, skippedCount = 0 } = r.data || {}
    ElMessage.success(`已创建 ${createdCount} 个，跳过 ${skippedCount} 个`)
    syncDialog.value = false
    load()
  } finally {
    syncing.value = false
  }
}

onMounted(load)
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
.muted {
  color: #c0c4cc;
}
.obj-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.obj-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.obj-row .el-input {
  flex: 1;
}
.form-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
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
