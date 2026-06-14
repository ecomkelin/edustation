<template>
  <div class="page student-works-page">
    <h2>学生作品</h2>
    <p class="hint">
      学员在课上的作品（图片/视频/描述）。作品一旦创建即不可改（考勤锚定 + 学科/开班快照），需改请删除重建。
    </p>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增作品</el-button>
    </div>

    <el-form :inline="true" :model="filter" @submit.prevent="load" class="filter-form">
      <el-form-item label="学科">
        <el-select v-model="filter.subject" clearable filterable placeholder="全部学科" style="width: 180px" @change="load">
          <el-option v-for="s in subjects" :key="s._id" :label="s.name" :value="s._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="开班">
        <el-select v-model="filter.courseInstance" clearable filterable placeholder="全部开班" style="width: 200px" @change="load">
          <el-option v-for="c in courseInstances" :key="c._id" :label="c.name || c.courseProduct?.name || c._id" :value="c._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="学生">
        <el-select v-model="filter.student" clearable filterable placeholder="全部学生" style="width: 180px" @change="load">
          <el-option v-for="s in students" :key="s._id" :label="s.name" :value="s._id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button @click="resetFilters">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="items" v-loading="loading" style="margin-top: 12px" @row-click="openDetail" row-class-name="row-clickable">
      <el-table-column label="缩略图" width="100">
        <template #default="{ row }">
          <el-image
            v-if="row.fileUrls && row.fileUrls[0]"
            :src="row.fileUrls[0]"
            :preview-src-list="row.fileUrls"
            :initial-index="0"
            fit="cover"
            style="width: 64px; height: 64px; border-radius: 6px"
            :preview-teleported="true"
          />
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="等级" width="100">
        <template #default="{ row }">
          <span v-if="row.level" class="level-stars">
            <span v-for="i in row.level" :key="i" class="star">★</span>
            <span v-for="i in (5 - row.level)" :key="'e' + i" class="star empty">★</span>
          </span>
          <span v-else class="text-muted">未评</span>
        </template>
      </el-table-column>
      <el-table-column label="标题" min-width="160">
        <template #default="{ row }">
          <span class="cell-strong">{{ row.title }}</span>
          <div v-if="row.description" class="text-muted text-12 ellipsis">{{ row.description }}</div>
        </template>
      </el-table-column>
      <el-table-column label="学生" width="100">
        <template #default="{ row }">
          {{ row.student && row.student.name || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="学科" width="100">
        <template #default="{ row }">
          {{ row.subject && row.subject.name || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="开班" min-width="140">
        <template #default="{ row }">
          {{ (row.courseInstance && row.courseInstance.name) || (row.courseInstance && row.courseInstance.courseProduct && row.courseInstance.courseProduct.name) || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="排课时间" width="160">
        <template #default="{ row }">
          <span v-if="row.lessonSchedule && row.lessonSchedule.plannedStartTime">
            {{ formatDate(row.lessonSchedule.plannedStartTime, 'YYYY-MM-DD HH:mm') }}
          </span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="上传者" width="100">
        <template #default="{ row }">
          {{ (row.uploadedBy && row.uploadedBy.realName) || (row.uploadedBy && row.uploadedBy.mobile) || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="上传时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.createdAt, 'YYYY-MM-DD HH:mm') }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click.stop="openEdit(row)">编辑</el-button>
          <DestructiveConfirm
            v-if="canDelete"
            :target="`作品 ${row.title}`"
            warning="中风险"
            :precheck-notes="['该作品未被其他业务引用']"
            :precheck="() => studentWorkApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" link type="danger">删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="filter.page"
      v-model:page-size="filter.pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      style="margin-top: 16px; justify-content: flex-end"
      @current-change="load"
      @size-change="load"
    />

    <!-- 详情：行点击打开 dialog -->
    <el-dialog v-model="detailVisible" :title="detail && detail.title" width="560px" destroy-on-close>
      <div v-if="detail">
        <div class="meta-row"><span class="meta-label">学生</span>{{ detail.student && detail.student.name }}</div>
        <div class="meta-row"><span class="meta-label">学科</span>{{ detail.subject && detail.subject.name || '—' }}</div>
        <div class="meta-row"><span class="meta-label">开班</span>{{ detail.courseInstance && detail.courseInstance.name || '—' }}</div>
        <div class="meta-row"><span class="meta-label">排课时间</span>{{ detail.lessonSchedule && formatDate(detail.lessonSchedule.plannedStartTime, 'YYYY-MM-DD HH:mm') || '—' }}</div>
        <div class="meta-row"><span class="meta-label">上传者</span>{{ detail.uploadedBy && (detail.uploadedBy.realName || detail.uploadedBy.mobile) }}</div>
        <div class="meta-row">
          <span class="meta-label">等级</span>
          <span v-if="detail.level" class="level-stars">
            <span v-for="i in detail.level" :key="i" class="star">★</span>
            <span v-for="i in (5 - detail.level)" :key="'e' + i" class="star empty">★</span>
          </span>
          <span v-else class="text-muted">未评</span>
        </div>
        <div v-if="detail.description" class="meta-row">
          <span class="meta-label">描述</span>
          <div style="white-space: pre-wrap">{{ detail.description }}</div>
        </div>
        <el-divider />
        <el-image
          v-for="(u, i) in (detail.fileUrls || [])"
          :key="i"
          :src="u"
          :preview-src-list="detail.fileUrls"
          :initial-index="i"
          fit="contain"
          style="width: 100%; max-height: 360px; margin-bottom: 8px; border-radius: 6px"
          :preview-teleported="true"
        />
        <div v-if="!(detail.fileUrls || []).length" class="text-muted text-center">无文件</div>
      </div>
    </el-dialog>

    <!-- 编辑：员工可改 title / description / level（fileUrls 不动，需重新上传走删除重建） -->
    <el-dialog v-model="editVisible" title="编辑作品" width="520px" destroy-on-close>
      <el-form v-if="editForm" :model="editForm" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="editForm.title" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="等级">
          <el-rate
            v-model="editForm.level"
            :max="5"
            :show-text="false"
            show-score
            score-template="{value} / 5"
          />
          <div class="text-muted text-12" style="margin-top: 4px">
            1=入门 / 2=初学 / 3=合格 / 4=良好 / 5=优秀；不评 = 留空后保存
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新增：三步选择 课程 → 学生 → 考勤 → 作品详情 -->
    <el-dialog v-model="createVisible" title="新增学生作品" width="640px" destroy-on-close>
      <el-form v-if="createForm" :model="createForm" label-width="100px">
        <!-- Step 1: 选课程（CourseInstance 开班） -->
        <el-form-item label="选课程" required>
          <el-select
            v-model="createForm.courseInstance"
            filterable
            :loading="ciLoading"
            placeholder="选择开班"
            style="width: 100%"
            @change="onCourseChange"
          >
            <el-option
              v-for="c in ciOptions"
              :key="c._id"
              :label="c.label"
              :value="c._id"
            />
          </el-select>
        </el-form-item>

        <!-- Step 2: 选学生（报过这门课的学生） -->
        <el-form-item label="选学生" required>
          <el-select
            v-model="createForm.student"
            filterable
            :loading="studentLoading"
            :disabled="!createForm.courseInstance"
            :placeholder="createForm.courseInstance ? '选择学生' : '请先选课程'"
            style="width: 100%"
            @change="onStudentChange"
          >
            <el-option
              v-for="s in studentOptions"
              :key="s._id"
              :label="s.name"
              :value="s._id"
            />
          </el-select>
        </el-form-item>

        <!-- Step 3: 选考勤（该学生在该课程下的考勤） -->
        <el-form-item label="选考勤" required>
          <el-select
            v-model="createForm.lessonAttendance"
            filterable
            :loading="attendanceLoading"
            :disabled="!createForm.student"
            :placeholder="createForm.student ? '选择考勤' : '请先选学生'"
            style="width: 100%"
          >
            <el-option
              v-for="a in attendanceOptions"
              :key="a._id"
              :label="a.label"
              :value="a._id"
            />
          </el-select>
          <div class="text-muted text-12" style="margin-top: 4px">
            学科、开班、学生由后端从考勤自动推导，<b>创建后不可改</b>
          </div>
        </el-form-item>

        <el-divider />

        <el-form-item label="标题" required>
          <el-input v-model="createForm.title" maxlength="100" show-word-limit placeholder="如：水墨山水-第一节" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="等级">
          <el-rate
            v-model="createForm.level"
            :max="5"
            :show-text="false"
            show-score
            score-template="{value} / 5"
          />
          <div class="text-muted text-12" style="margin-top: 4px">
            1=入门 / 2=初学 / 3=合格 / 4=良好 / 5=优秀；不评 = 留空
          </div>
        </el-form-item>
        <el-form-item label="作品文件" required>
          <el-upload
            v-model:file-list="createForm.fileList"
            :auto-upload="false"
            multiple
            list-type="picture"
            accept="image/*,video/*,audio/*,.pdf"
          >
            <el-button>选择新文件</el-button>
            <template #tip>
              <div class="text-muted text-12">支持图片/视频/音频/PDF，至少 1 个</div>
            </template>
          </el-upload>
          <el-button :icon="Folder" link style="margin-top: 6px" @click="workPicker = true">
            从文件库选
          </el-button>
          <div v-if="createForm.pickedFileIds && createForm.pickedFileIds.length"
               class="text-muted text-12" style="margin-top: 4px">
            已从文件库选 {{ createForm.pickedFileIds.length }} 个，与上方新文件合并提交
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="createSaving"
          :disabled="!canSubmitCreate"
          @click="submitCreate"
        >提交</el-button>
      </template>
    </el-dialog>

    <!-- 从文件库选学生作品文件（多选） -->
    <FilePicker
      v-model="workPicker"
      multiple
      scope="work"
      title="选择学生作品文件"
      @select="onPickWorks"
    />
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, computed } from 'vue'
import { Plus, Folder } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import { studentWorkApi } from '@/api/studentWork'
import FilePicker from '@/components/FilePicker.vue'
import { storageApi } from '@/api/storage'
import { handleRemoveError } from '@/utils/removable'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { courseInstanceApi } from '@/api/courseInstance'
import { subjectApi } from '@/api/subject'
import { studentApi } from '@/api/student'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/format'

const auth = useAuthStore()

const loading = ref(false)
const items = ref([])
const total = ref(0)
const subjects = ref([])
const courseInstances = ref([])
const students = ref([])

const filter = reactive({
  subject: '',
  courseInstance: '',
  student: '',
  page: 1,
  pageSize: 20
})

const detailVisible = ref(false)
const detail = ref(null)

// 删除权限：仅平台超管可见"删除"按钮（后端 requirePlatformPassword 强一致）
const canDelete = computed(() => !!auth.isPlatformAdmin)

const editVisible = ref(false)
const editForm = ref(null) // { _id, title, description, level }
const editSaving = ref(false)

// 新增作品（三步选择：课程 → 学生 → 考勤）
const createVisible = ref(false)
const createSaving = ref(false)
const ciOptions = ref([]) // [{ _id, label }]  开班
const ciLoading = ref(false)
const studentOptions = ref([]) // [{ _id, name }] 该课程下报过名的学生
const studentLoading = ref(false)
const attendanceOptions = ref([]) // [{ _id, label }] 该学生+该课程的考勤
const attendanceLoading = ref(false)
const createForm = ref(null) // { courseInstance, student, lessonAttendance, title, description, level, fileList }

async function load() {
  loading.value = true
  try {
    const params = { page: filter.page, pageSize: filter.pageSize }
    if (filter.subject) params.subject = filter.subject
    if (filter.courseInstance) params.courseInstance = filter.courseInstance
    if (filter.student) params.student = filter.student
    const res = await studentWorkApi.list(params)
    items.value = res.data?.items || []
    total.value = res.data?.total || 0
  } catch (e) {
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filter.subject = ''
  filter.courseInstance = ''
  filter.student = ''
  filter.page = 1
  load()
}

async function openDetail(row) {
  try {
    const res = await studentWorkApi.detail(row._id)
    detail.value = res.data || null
    detailVisible.value = true
  } catch (e) {
    ElMessage.error('作品详情加载失败')
  }
}

function openEdit(row) {
  editForm.value = {
    _id: row._id,
    title: row.title,
    description: row.description || '',
    // el-rate 的 v-model 要求 number；null 时给 0 + 在 submit 时清掉
    level: row.level || 0
  }
  editVisible.value = true
}

async function submitEdit() {
  if (!editForm.value) return
  if (!editForm.value.title || !String(editForm.value.title).trim()) {
    ElMessage.warning('标题不能为空')
    return
  }
  editSaving.value = true
  try {
    const payload = {
      title: String(editForm.value.title).trim(),
      description: editForm.value.description
    }
    // el-rate 用 0 表示"未评"；区分"不传"和"传 0"——传 0 等价于显式清空
    payload.level = editForm.value.level || null

    await studentWorkApi.update(editForm.value._id, payload)
    ElMessage.success('保存成功')
    editVisible.value = false
    load()
    // 同步更新详情 dialog（如果打开着）
    if (detail.value && detail.value._id === editForm.value._id) {
      const res = await studentWorkApi.detail(editForm.value._id)
      detail.value = res.data || null
    }
  } catch (e) {
    // 错误已由 http.js 的 ElMessage 弹出
  } finally {
    editSaving.value = false
  }
}

async function onRemoveConfirm(row, { password }) {
  try {
    await studentWorkApi.remove(row._id, { password })
    ElMessage.success('已删除')
    if (detail.value && detail.value._id === row._id) {
      detailVisible.value = false
    }
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险', `作品 ${row.title}`)
  }
}

// ─── 新增作品：课程 → 学生 → 考勤 三步选择 ──────────────────────
async function openCreate() {
  createForm.value = {
    courseInstance: '',
    student: '',
    lessonAttendance: '',
    title: '',
    description: '',
    level: 0,
    fileList: [],
    pickedFileIds: []
  }
  studentOptions.value = []
  attendanceOptions.value = []
  createVisible.value = true
  await loadCourseInstances()
}

async function loadCourseInstances() {
  ciLoading.value = true
  try {
    // 用现有的 courseInstanceApi；后端 list 直接返回数组
    const res = await courseInstanceApi.list({ pageSize: 200 }, { silent: true })
    const items = Array.isArray(res.data) ? res.data : (res.data?.items || [])
    ciOptions.value = items.map((c) => ({
      _id: c._id,
      label: [c.name || c.courseProduct?.name, c.courseProduct?.name].filter(Boolean).join(' / ') || c._id
    }))
  } catch (e) {
    ciOptions.value = []
  } finally {
    ciLoading.value = false
  }
}

async function onCourseChange(courseInstanceId) {
  if (!createForm.value) return
  // 清空下游
  createForm.value.student = ''
  createForm.value.lessonAttendance = ''
  studentOptions.value = []
  attendanceOptions.value = []
  if (!courseInstanceId) return

  studentLoading.value = true
  try {
    // 查这门课下"在读"的学生（status=enrolled）
    const res = await courseEnrollmentApi.list({
      courseInstance: courseInstanceId,
      status: 'enrolled',
      pageSize: 500
    }, { silent: true })
    const items = res.data?.items || []
    // 去重（同一学生可能多次报名）
    const seen = new Set()
    const uniq = []
    for (const e of items) {
      const s = e.student
      if (!s) continue
      const id = typeof s === 'object' ? s._id : s
      if (seen.has(id)) continue
      seen.add(id)
      uniq.push({ _id: id, name: typeof s === 'object' ? s.name : id })
    }
    studentOptions.value = uniq
  } catch (e) {
    studentOptions.value = []
  } finally {
    studentLoading.value = false
  }
}

async function onStudentChange(studentId) {
  if (!createForm.value) return
  createForm.value.lessonAttendance = ''
  attendanceOptions.value = []
  if (!studentId || !createForm.value.courseInstance) return
  await loadAttendances()
}

async function loadAttendances() {
  if (!createForm.value) return
  attendanceLoading.value = true
  try {
    // 后端 lessonAttendance.list 新加 courseInstance 参数（service.js 已支持）
    const res = await lessonAttendanceApi.list({
      courseInstance: createForm.value.courseInstance,
      student: createForm.value.student,
      pageSize: 200
    }, { silent: true })
    const items = Array.isArray(res.data) ? res.data : (res.data?.items || [])
    attendanceOptions.value = items.map((a) => ({
      _id: a._id,
      label: [
        a.lessonSchedule?.plannedStartTime ? formatDate(a.lessonSchedule.plannedStartTime, 'YYYY-MM-DD HH:mm') : '',
        a.lessonSchedule?.title || '',
        a.status || ''
      ].filter(Boolean).join(' | ')
    }))
  } catch (e) {
    attendanceOptions.value = []
  } finally {
    attendanceLoading.value = false
  }
}

const canSubmitCreate = computed(() => {
  if (!createForm.value) return false
  const hasNew = createForm.value.fileList && createForm.value.fileList.length > 0
  const hasPicked = createForm.value.pickedFileIds && createForm.value.pickedFileIds.length > 0
  return !!(
    createForm.value.lessonAttendance &&
    String(createForm.value.title).trim() &&
    (hasNew || hasPicked)
  )
})

async function submitCreate() {
  if (!createForm.value || !canSubmitCreate.value) return
  createSaving.value = true
  try {
    // 1) 上传新文件
    const files = (createForm.value.fileList || []).map((f) => f.raw || f).filter(Boolean)
    let uploadedIds = []
    if (files.length) {
      const upRes = await storageApi.uploadMany({ files, scope: 'work' })
      uploadedIds = (upRes.data?.items || []).map((i) => i.id)
    }
    // 2) 合并：从文件库选 + 新上传
    const fileIds = [...(createForm.value.pickedFileIds || []), ...uploadedIds]
    if (!fileIds.length) {
      ElMessage.error('请至少上传或选择一个文件')
      return
    }
    const payload = {
      lessonAttendance: createForm.value.lessonAttendance,
      title: String(createForm.value.title).trim(),
      fileIds
    }
    if (createForm.value.description) payload.description = createForm.value.description
    if (createForm.value.level) payload.level = String(createForm.value.level)
    await studentWorkApi.create(payload)
    ElMessage.success('作品已上传')
    createVisible.value = false
    load()
  } catch (e) {
    // http.js 已弹 ElMessage
  } finally {
    createSaving.value = false
  }
}

// 从文件库选作品文件（多选）。与 fileList 平行存储，submitCreate 时合并。
// 已知 trade-off：用户上传后未点提交就关弹窗，新上传的文件会成孤儿 —— 与 Orgs 的 stagedLogoIds 同样限制，
// 后续可镜像 stagedWorkIds 修复，本期不做。
const workPicker = ref(false)
function onPickWorks(files) {
  if (!createForm.value) return
  if (!createForm.value.pickedFileIds) createForm.value.pickedFileIds = []
  const existing = new Set(createForm.value.pickedFileIds.map(String))
  for (const f of files) {
    const id = String(f._id)
    if (!existing.has(id)) {
      createForm.value.pickedFileIds.push(id)
      existing.add(id)
    }
  }
}

onMounted(async () => {
  // 并行拉取过滤器下拉数据。silent=true：无权限时下拉为空，不弹错误 toast（页面其它功能照常）
  const [s, c, st] = await Promise.allSettled([
    subjectApi.list({ pageSize: 200 }, { silent: true }),
    courseInstanceApi.list({ pageSize: 200 }, { silent: true }),
    studentApi.list({ pageSize: 200 }, { silent: true })
  ])
  if (s.status === 'fulfilled') {
    // 响应统一被 ApiResponse.ok 包成 {success, data: ...}; http 拦截器 return body.
    // subject 端点 data 是裸 array; courseInstance/student data 是 {items, total} 分页.
    const v = s.value
    subjects.value = Array.isArray(v?.data) ? v.data : []
  }
  if (c.status === 'fulfilled') courseInstances.value = c.value.data?.items || []
  if (st.status === 'fulfilled') students.value = st.value.data?.items || []
  load()
})
</script>

<style scoped>
.student-works-page .hint {
  color: #6b7280;
  font-size: 13px;
  margin: 0 0 12px;
}
.student-works-page .toolbar {
  margin: 0 0 8px;
  display: flex;
  justify-content: flex-end;
}
.filter-form {
  background: #fafbfc;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 0;
}
.row-clickable {
  cursor: pointer;
}
.cell-strong { font-weight: 500; color: #1f2937; }
.text-muted { color: #9ca3af; }
.text-12 { font-size: 12px; }
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
}
.meta-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 14px;
}
.meta-label {
  width: 80px;
  flex-shrink: 0;
  color: #6b7280;
}
.text-center { text-align: center; }
.level-stars { display: inline-flex; gap: 1px; font-size: 14px; }
.level-stars .star { color: #f59e0b; }
.level-stars .star.empty { color: #e5e7eb; }
</style>
