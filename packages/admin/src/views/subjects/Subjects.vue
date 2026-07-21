<template>
  <div class="page">
    <h2>学科</h2>
    <p class="hint">
      机构的学科。一个学科对应一个**细分到教学粒度**的课程类目（如"python 初级" / "python 高级"），
      携带教学大纲 + 每堂课课件。课程产品只承载"售卖规格"（价格 / 课时 / 有效期），不再含教学大纲。
    </p>

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
      <!-- 跨机构同步: 仅平台超管可见/可点。非超管连入口都没有, 不会发 listSourceOrgs / listByOrg / sync 请求 -->
      <template v-if="auth.isPlatformAdmin">
        <el-tooltip
          :disabled="!!auth.currentOrgId"
          content="请先在顶部「机构切换」中选择一个目标机构"
          placement="top"
        >
          <el-button
            :disabled="!auth.currentOrgId"
            @click="openSync"
          >从其他机构同步学科</el-button>
        </el-tooltip>
      </template>
    </el-space>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="分类" min-width="140">
        <template #default="{ row }">
          <span v-if="row.category">{{ row.category.name }}</span>
          <el-tag v-else type="info" size="small">未分类</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="大纲节数" width="100">
        <template #default="{ row }">
          <span style="color: #606266">
            {{ (row.syllabus && row.syllabus.lessons && row.syllabus.lessons.length) || 0 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="课件组数" width="100">
        <template #default="{ row }">
          <span style="color: #606266">
            {{ (row.lessonMaterials && row.lessonMaterials.items && row.lessonMaterials.items.length) || 0 }}
          </span>
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
            v-if="row.posterFileId && row.posterFileId.url"
            :src="row.posterFileId.url"
            :preview-src-list="[row.posterFileId.url]"
            fit="cover"
            style="width: 48px; height: 48px; border-radius: 4px"
            :hide-on-click-modal="true"
          />
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <!-- 详情页: 基本信息只读 + 「编辑基础信息」按钮(内嵌) + 教学大纲内嵌编辑 + 课件内嵌编辑 -->
          <el-button size="small" type="primary" plain @click="goDetail(row)">详情</el-button>
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

    <!-- 基础信息弹窗（2026-07-20: 仅用于新建, 不再含大纲与课件; 两者在详情页编辑） -->
    <el-dialog
      v-model="dialog"
      title="新建学科"
      width="900px"
      :before-close="onSubjectDialogBeforeClose"
      @closed="resetForm"
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="新建学科只填基本信息"
        description="课纲（教学大纲）和课件 在「详情」页单独维护 —— 此处内容较多，避免在弹窗里挤"
        style="margin-bottom: 16px"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <!-- 基本信息 -->
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
        <el-form-item label="海报">
          <div class="media-row">
            <div v-if="form.posterFileId" class="media-preview">
              <el-image
                :src="form.posterFileId.url"
                fit="cover"
                style="width: 120px; height: 80px; border-radius: 4px"
                :preview-src-list="[form.posterFileId.url]"
                :hide-on-click-modal="true"
              />
              <div class="media-meta">
                <span class="text-12">{{ form.posterFileId.originalName || '已选海报' }}</span>
                <el-button link size="small" type="danger" @click="form.posterFileId = null">移除</el-button>
              </div>
            </div>
            <div v-else class="media-empty">
              <el-icon :size="28" color="#c0c4cc"><Picture /></el-icon>
              <span class="text-12 muted">未上传海报</span>
            </div>
            <div class="media-actions">
              <el-upload
                :show-file-list="false"
                :auto-upload="true"
                :http-request="(req) => uploadMedia(req, 'poster')"
                :before-upload="beforePosterUpload"
                accept="image/*"
              >
                <el-button :icon="Upload" size="small">上传新海报</el-button>
              </el-upload>
              <el-button :icon="Folder" size="small" @click="openPicker('poster')">从文件库选</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="宣传视频">
          <div class="media-row">
            <div v-if="form.videoFileId" class="media-preview">
              <video
                :src="form.videoFileId.url"
                style="width: 160px; height: 90px; border-radius: 4px; background: #000"
                controls
              />
              <div class="media-meta">
                <span class="text-12">{{ form.videoFileId.originalName || '已选视频' }}</span>
                <el-button link size="small" type="danger" @click="form.videoFileId = null">移除</el-button>
              </div>
            </div>
            <div v-else class="media-empty">
              <el-icon :size="28" color="#c0c4cc"><VideoCamera /></el-icon>
              <span class="text-12 muted">未上传宣传视频</span>
            </div>
            <div class="media-actions">
              <el-upload
                :show-file-list="false"
                :auto-upload="true"
                :http-request="(req) => uploadMedia(req, 'video')"
                :before-upload="beforeVideoUpload"
                accept="video/*"
              >
                <el-button :icon="Upload" size="small">上传新视频</el-button>
              </el-upload>
              <el-button :icon="Folder" size="small" @click="openPicker('video')">从文件库选</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="课程简介">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
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
        description="仅复制与本公司不同名的学科。同名学科会被自动跳过，不会覆盖也不会报错。category / objectives / description / 教学大纲(文本) 一并复制；海报 / 视频 / 课件 fileId 因跨机构会失效，会复制骨架并清空 fileIds, 用户后续在目标机构重新上传。"
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
        <el-table-column label="大纲节数" width="100">
          <template #default="{ row }">
            <span style="color: #606266">
              {{ (row.syllabus && row.syllabus.lessons && row.syllabus.lessons.length) || 0 }}
            </span>
          </template>
        </el-table-column>
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
              v-if="row.posterFileId && row.posterFileId.url"
              :src="row.posterFileId.url"
              :preview-src-list="[row.posterFileId.url]"
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

    <!-- 海报 / 视频文件选择器(单选) -->
    <FilePicker
      v-model="mediaPicker"
      :scope="mediaPickerScope"
      :title="mediaPickerTitle"
      :mime-prefix="mediaPickerMimePrefix"
      @select="onPickMedia"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Folder, Upload, Picture, VideoCamera } from '@element-plus/icons-vue'
import { subjectApi } from '@/api/subject'
import { storageApi } from '@/api/storage'
import { handleRemoveError } from '@/utils/removable'
import { categoryApi } from '@/api/category'
import { useAuthStore } from '@/stores/auth'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import FilePicker from '@/components/FilePicker.vue'

const router = useRouter()
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
  return {
    name: '',
    category: null,
    objectives: [],
    posterFileId: null,
    videoFileId: null,
    description: ''
  }
}

const rules = {
  name: [{ required: true, message: '请填写名称', trigger: 'blur' }]
}

async function load() {
  loading.value = true
  try {
    const r = await subjectApi.list({ keyword: keyword.value })
    list.value = (r.data || []).map((s) => ({ ...s, id: s.id || s._id }))
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[subjects.load] failed:', e?.response?.data || e)
    list.value = []
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
  // 「原始值」快照:为 beforeClose 提示提供脏比对基线
  takeSnapshot()
}

function goDetail(row) {
  const id = row.id || row._id
  router.push({ path: `/subjects/${id}` })
}

// 「原始值」快照:在 openCreate 时记录;对比 form 当前值判断是否脏
const initialSnapshot = ref('')

function takeSnapshot() {
  initialSnapshot.value = JSON.stringify({
    name: form.name,
    category: form.category,
    objectives: form.objectives,
    posterFileId: form.posterFileId,
    videoFileId: form.videoFileId,
    description: form.description
  })
}

function isSubjectDirty() {
  if (!initialSnapshot.value) return false
  const current = JSON.stringify({
    name: form.name,
    category: form.category,
    objectives: form.objectives,
    posterFileId: form.posterFileId,
    videoFileId: form.videoFileId,
    description: form.description
  })
  return current !== initialSnapshot.value
}

async function onSubjectDialogBeforeClose(done) {
  if (!isSubjectDirty()) {
    done()
    return
  }
  try {
    await ElMessageBox.confirm(
      '当前新建的学科有未保存的基础信息,关闭后不会保存。确定要关闭吗?',
      '有未保存的内容',
      { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '继续填写' }
    )
    done()
  } catch {
    // 选「继续填写」,不关
  }
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
      posterFileId: form.posterFileId ? (form.posterFileId._id || form.posterFileId) : null,
      videoFileId: form.videoFileId ? (form.videoFileId._id || form.videoFileId) : null,
      description: form.description || ''
    }
    // 弹窗现在仅用于「新建」; 编辑基础信息已搬到 /subjects/:id 详情页内
    await subjectApi.create(payload)
    ElMessage.success('已创建')
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

/* ----- 海报 / 视频 单文件上传(走 FilePicker) ----- */
const mediaPicker = ref(false)
const mediaPickerKind = ref('poster') // 'poster' | 'video'
const mediaPickerScope = computed(() => 'subjectSyllabus')
const mediaPickerTitle = computed(() => (mediaPickerKind.value === 'poster' ? '选择海报' : '选择宣传视频'))
const mediaPickerMimePrefix = computed(() => (mediaPickerKind.value === 'poster' ? 'image/' : 'video/'))

function openPicker(kind) {
  mediaPickerKind.value = kind
  mediaPicker.value = true
}

function beforePosterUpload(file) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('海报必须是图片')
    return false
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('海报超过 20MB 限制')
    return false
  }
  return true
}

function beforeVideoUpload(file) {
  if (!file.type.startsWith('video/')) {
    ElMessage.error('宣传视频必须是视频文件')
    return false
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('视频超过 20MB 限制')
    return false
  }
  return true
}

async function uploadMedia(req, kind) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'subjectSyllabus' })
    const v = { _id: String(data.id), url: data.url, originalName: data.originalName }
    if (kind === 'poster') form.posterFileId = v
    else form.videoFileId = v
    ElMessage.success((kind === 'poster' ? '海报' : '视频') + '已上传,点"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function onPickMedia(files) {
  const f = Array.isArray(files) ? files[0] : files
  if (!f) return
  const v = { _id: String(f._id), url: f.url, originalName: f.originalName }
  if (mediaPickerKind.value === 'poster') form.posterFileId = v
  else form.videoFileId = v
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

async function openSync() {
  // 防御性: 非超管即便绕开 v-if 触发到这里, 也不发同步 API
  if (!auth.isPlatformAdmin) {
    ElMessage.warning('仅平台超管可执行跨机构同步')
    return
  }
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
.media-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  flex-wrap: wrap;
}
.media-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.media-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.media-empty {
  width: 120px;
  height: 80px;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.media-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.text-12 { font-size: 12px; color: #606266; }
</style>
