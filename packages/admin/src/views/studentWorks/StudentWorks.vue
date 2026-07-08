<template>
  <div class="page student-works-page">
    <h2>学生作品</h2>
    <p class="hint">
      学员在课上的作品（图片/视频/描述）。作品一旦创建即不可改（考勤锚定 + 学科/开班快照），需改请删除重建。
    </p>

    <!-- 顶部 KPI（2026-07-01 新增；走 R-1606） -->
    <el-row :gutter="12" class="kpi-row">
      <el-col :xs="12" :sm="6">
        <KpiCard label="本期作品数" :value="stats.total" :extra="`对比上一期 ${stats.prevTotal}`" accent="blue" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="已评数" :value="stats.ratedCount" :extra="`上一期 ${stats.prevRatedCount}`" accent="green" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="平均等级" :value="stats.avgLevel != null ? stats.avgLevel + ' / 5' : '—'" extra="仅计已评" accent="orange" />
      </el-col>
      <el-col :xs="12" :sm="6">
        <KpiCard label="未评数" :value="stats.unratedCount" extra="待员工评定" accent="red" />
      </el-col>
    </el-row>

    <!-- 工具栏：左侧视图切换，右侧操作 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <!-- 2026-07-06 bugfix: label= 在 Element Plus 3.0 已 deprecated, 改 value= (与 admin 其他模块对齐) -->
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="list">列表</el-radio-button>
          <el-radio-button value="card">卡片</el-radio-button>
        </el-radio-group>
      </div>
      <div class="toolbar-right">
        <!-- 2026-07-08: 归档开关 -->
        <el-checkbox v-model="filter.showArchived" @change="reloadAll">显示已归档</el-checkbox>
        <el-button :icon="Download" @click="onExport">导出 CSV</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增作品</el-button>
      </div>
    </div>

    <el-form :inline="true" :model="filter" @submit.prevent="reloadAll" class="filter-form">
      <el-form-item label="学科">
        <el-select v-model="filter.subject" clearable filterable placeholder="全部学科" style="width: 160px" @change="reloadAll">
          <el-option v-for="s in subjects" :key="s._id" :label="s.name" :value="s._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="开班">
        <el-select v-model="filter.courseInstance" clearable filterable placeholder="全部开班" style="width: 180px" @change="reloadAll">
          <el-option v-for="c in courseInstances" :key="c._id" :label="c.name || c.courseProduct?.name || c._id" :value="c._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="学生">
        <el-select v-model="filter.student" clearable filterable placeholder="全部学生" style="width: 160px" @change="reloadAll">
          <el-option v-for="s in students" :key="s._id" :label="s.name" :value="s._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="等级">
        <el-select v-model="filter.levels" multiple collapse-tags clearable placeholder="全部等级" style="width: 160px" @change="reloadAll">
          <el-option v-for="lv in [1,2,3,4,5]" :key="lv" :label="`${lv} ★`" :value="lv" />
        </el-select>
      </el-form-item>
      <el-form-item label="上传者">
        <el-select v-model="filter.uploadedBy" clearable filterable placeholder="全部上传者" style="width: 160px" @change="reloadAll">
          <el-option v-for="u in userOptions" :key="u._id" :label="u.realName || u.mobile" :value="u._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker
          v-model="filter.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
          style="width: 280px"
          :shortcuts="dateShortcuts"
          @change="reloadAll"
        />
      </el-form-item>
      <el-form-item label="排序">
        <el-select v-model="filter.sort" style="width: 160px" @change="reloadAll">
          <el-option label="最新在前" value="-createdAt" />
          <el-option label="最旧在前" value="createdAt" />
          <el-option label="等级高分" value="-level" />
          <el-option label="等级低分" value="level" />
          <el-option label="标题 A→Z" value="title" />
          <el-option label="标题 Z→A" value="-title" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button @click="resetFilters">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 列表视图：仅在 viewMode==='list' 渲染 -->
    <el-table
      v-if="viewMode === 'list'"
      :data="items"
      v-loading="loading"
      style="margin-top: 12px"
      @row-click="openDetail"
      row-class-name="row-clickable"
    >
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
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row.archived" size="small" link type="primary" @click.stop="openEdit(row)">编辑</el-button>
          <!-- 2026-07-08: 归档/取消归档 -->
          <el-button v-if="canWrite && !row.archived" size="small" link type="warning" @click.stop="onArchive(row)">归档</el-button>
          <el-button v-if="canWrite && row.archived" size="small" link @click.stop="onUnarchive(row)">取消归档</el-button>
          <el-tag v-if="row.archived" size="small" type="warning" effect="plain">已归档</el-tag>
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

    <!-- 卡片视图：grid 2-4 列响应式 -->
    <div v-else v-loading="loading" class="card-grid">
      <div v-if="!items.length" class="card-grid-empty">暂无作品</div>
      <div
        v-for="row in items"
        :key="row._id"
        class="work-card"
        @click="openDetail(row)"
      >
        <el-image
          v-if="row.fileUrls && row.fileUrls[0]"
          :src="row.fileUrls[0]"
          :preview-src-list="row.fileUrls"
          :initial-index="0"
          fit="cover"
          class="work-card-img"
          :preview-teleported="true"
        />
        <div v-else class="work-card-noimg">无图</div>
        <div class="work-card-body">
          <div class="work-card-title">{{ row.title }}</div>
          <div class="work-card-meta">
            <span>{{ row.student && row.student.name || '—' }}</span>
            <span class="work-card-level">
              <span v-if="row.level" class="level-stars">
                <span v-for="i in row.level" :key="i" class="star">★</span>
              </span>
              <span v-else class="text-muted text-12">未评</span>
            </span>
          </div>
          <div class="work-card-time">
            {{ row.lessonSchedule && row.lessonSchedule.plannedStartTime ? formatDate(row.lessonSchedule.plannedStartTime, 'MM-DD HH:mm') : '—' }}
          </div>
          <div class="work-card-actions" @click.stop>
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
          </div>
        </div>
      </div>
    </div>

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
import { onMounted, reactive, ref, computed, watch } from 'vue'
import { Plus, Folder, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import KpiCard from '@/components/KpiCard.vue'
import { studentWorkApi } from '@/api/studentWork'
import { userApi } from '@/api/user'
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

// 顶部 KPI 状态
const stats = reactive({ total: 0, ratedCount: 0, unratedCount: 0, avgLevel: null, prevTotal: 0, prevRatedCount: 0 })

// 视图切换
const viewMode = ref('list')

// 列表数据
const loading = ref(false)
const items = ref([])
const total = ref(0)
const subjects = ref([])
const courseInstances = ref([])
const students = ref([])
const userOptions = ref([])

// 过滤器（2026-07-01 增强：加 levels/uploadedBy/dateRange/sort）
const filter = reactive({
  subject: '',
  courseInstance: '',
  student: '',
  levels: [],
  uploadedBy: '',
  dateRange: [],
  sort: '-createdAt',
  page: 1,
  pageSize: 20
})

// el-date-picker 快捷选项
const dateShortcuts = [
  {
    text: '本月',
    value: () => {
      const now = new Date()
      return [new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), now]
    }
  },
  {
    text: '近 7 天',
    value: () => {
      const now = new Date()
      const d = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
      return [d, now]
    }
  },
  {
    text: '近 30 天',
    value: () => {
      const now = new Date()
      const d = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
      return [d, now]
    }
  },
  {
    text: '本月至今',
    value: () => {
      const now = new Date()
      return [new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), now]
    }
  }
]

const detailVisible = ref(false)
const detail = ref(null)

// 删除权限：仅平台超管可见"删除"按钮（后端 requirePlatformPassword 强一致）
const canDelete = computed(() => !!auth.isPlatformAdmin)

const editVisible = ref(false)
const editForm = ref(null)
const editSaving = ref(false)

// 新增作品（三步选择：课程 → 学生 → 考勤）
const createVisible = ref(false)
const createSaving = ref(false)
const ciOptions = ref([])
const ciLoading = ref(false)
const studentOptions = ref([])
const studentLoading = ref(false)
const attendanceOptions = ref([])
const attendanceLoading = ref(false)
const createForm = ref(null)

// 过滤器 → 请求参数。把多选等级数组拆成 [minLevel, maxLevel]：
// 仅 1 档：minLevel = levels[0]; 多档：minLevel = min, maxLevel = max。
function buildParams() {
  const params = { page: filter.page, pageSize: filter.pageSize, sort: filter.sort || '-createdAt' }
  if (filter.subject) params.subject = filter.subject
  if (filter.courseInstance) params.courseInstance = filter.courseInstance
  if (filter.student) params.student = filter.student
  if (filter.uploadedBy) params.uploadedBy = filter.uploadedBy
  if (filter.levels && filter.levels.length) {
    const sorted = [...filter.levels].sort((a, b) => a - b)
    params.minLevel = sorted[0]
    if (sorted.length > 1) params.maxLevel = sorted[sorted.length - 1]
  }
  if (Array.isArray(filter.dateRange) && filter.dateRange.length === 2 && filter.dateRange[0] && filter.dateRange[1]) {
    // el-date-picker 的 value-format 已固定 'YYYY-MM-DDTHH:mm:ss.SSSZ' (ISO 字符串)
    params.createdAtFrom = filter.dateRange[0]
    params.createdAtTo = filter.dateRange[1]
  }
  // 2026-07-08: 归档过滤 — 默认隐藏, ?archived=true 才看历史
  if (filter.showArchived) params.archived = 'true'
  return params
}

async function load() {
  loading.value = true
  try {
    const params = buildParams()
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

async function loadStats() {
  // KPI 只关心当前过滤下的总数 / 等级分布，时间范围仍是 filter.dateRange
  try {
    const params = {}
    if (filter.subject) params.subject = filter.subject
    if (filter.courseInstance) params.courseInstance = filter.courseInstance
    if (filter.student) params.student = filter.student
    if (filter.uploadedBy) params.uploadedBy = filter.uploadedBy
    if (Array.isArray(filter.dateRange) && filter.dateRange.length === 2 && filter.dateRange[0] && filter.dateRange[1]) {
      params.createdAtFrom = filter.dateRange[0]
      params.createdAtTo = filter.dateRange[1]
    }
    const res = await studentWorkApi.stats(params)
    Object.assign(stats, res.data || stats)
  } catch (_) {
    // stats 失败不阻塞列表
  }
}

function reloadAll() {
  filter.page = 1
  load()
  loadStats()
}

function resetFilters() {
  filter.subject = ''
  filter.courseInstance = ''
  filter.student = ''
  filter.levels = []
  filter.uploadedBy = ''
  filter.dateRange = []
  filter.sort = '-createdAt'
  filter.page = 1
  load()
  loadStats()
}

// CSV 导出（仿 AuditLogs.onExport: fetch + Blob + <a download>，绕开 axios 拦截器对下载的影响）
function onExport() {
  const params = buildParams()
  delete params.page
  delete params.pageSize
  const url = studentWorkApi.buildExportCsvUrl(params)
  fetch(url, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    credentials: 'include'
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const blob = await r.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `student-works-${Date.now()}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    })
    .catch((e) => ElMessage.error('导出失败: ' + e.message))
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
    payload.level = editForm.value.level || null

    await studentWorkApi.update(editForm.value._id, payload)
    ElMessage.success('保存成功')
    editVisible.value = false
    load()
    loadStats()
    if (detail.value && detail.value._id === editForm.value._id) {
      const res = await studentWorkApi.detail(editForm.value._id)
      detail.value = res.data || null
    }
  } catch (e) {
    // http.js 已弹 ElMessage
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
    loadStats()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 中风险', `作品 ${row.title}`)
  }
}

// ─── 2026-07-08: 归档 / 取消归档 ──────────────────────
const canWrite = computed(() => hasPermInOrg(auth, 'studentWork.write'))
async function onArchive(row) {
  try {
    await studentWorkApi.archive(row._id)
    ElMessage.success('已归档')
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '归档失败')
  }
}
async function onUnarchive(row) {
  try {
    await studentWorkApi.unarchive(row._id)
    ElMessage.success('已取消归档')
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '取消归档失败')
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
    const res = await courseInstanceApi.list({ pageSize: 200 }, { silent: true })
    const arr = Array.isArray(res.data) ? res.data : (res.data?.items || [])
    ciOptions.value = arr.map((c) => ({
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
  createForm.value.student = ''
  createForm.value.lessonAttendance = ''
  studentOptions.value = []
  attendanceOptions.value = []
  if (!courseInstanceId) return

  studentLoading.value = true
  try {
    const res = await courseEnrollmentApi.list({
      courseInstance: courseInstanceId,
      status: 'enrolled',
      pageSize: 500
    }, { silent: true })
    const items = res.data?.items || []
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
    const res = await lessonAttendanceApi.list({
      courseInstance: createForm.value.courseInstance,
      student: createForm.value.student,
      pageSize: 200
    }, { silent: true })
    const arr = Array.isArray(res.data) ? res.data : (res.data?.items || [])
    attendanceOptions.value = arr.map((a) => ({
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
    const files = (createForm.value.fileList || []).map((f) => f.raw || f).filter(Boolean)
    let uploadedIds = []
    if (files.length) {
      const upRes = await storageApi.uploadMany({ files, scope: 'work' })
      uploadedIds = (upRes.data?.items || []).map((i) => i.id)
    }
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
    loadStats()
  } catch (e) {
    // http.js 已弹 ElMessage
  } finally {
    createSaving.value = false
  }
}

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
  const [s, c, st, u] = await Promise.allSettled([
    subjectApi.list({ pageSize: 200 }, { silent: true }),
    courseInstanceApi.list({ pageSize: 200 }, { silent: true }),
    studentApi.list({ pageSize: 200 }, { silent: true }),
    userApi.list({ pageSize: 200 }, { silent: true })
  ])
  // 2026-07-03:防御性 sanitize — 后端 .populate 后 _id 一定存在,但偶尔 raw subdoc / 某些端点
  //  返回的 item 可能没有 _id (比如 archived org 默认排除某些字段)。
  //  没有 _id 的 item 会让 <el-option :value="s._id"> 传 undefined,
  //  Vue prop 校验抛 "Invalid prop: ... Expected String|Number|Boolean|Object, got Undefined null"
  //  — 这个 warning 进了某个全局 handler 被错误序列化成 "Class constructor ObjectId"
  function safeId(item) {
    if (!item) return null
    return item._id || item.id || null
  }
  function normalize(list) {
    return (list || [])
      .filter((x) => safeId(x) != null)
      .map((x) => ({ ...x, _id: safeId(x) }))
  }
  if (s.status === 'fulfilled') subjects.value = normalize(Array.isArray(s.value?.data) ? s.value.data : [])
  if (c.status === 'fulfilled') courseInstances.value = normalize(c.value?.data?.items || [])
  if (st.status === 'fulfilled') students.value = normalize(st.value?.data?.items || [])
  if (u.status === 'fulfilled') {
    const v = u.value
    userOptions.value = normalize(Array.isArray(v?.data) ? v.data : (v?.data?.items || []))
  }
  load()
  loadStats()
})
</script>

<style scoped>
.student-works-page .hint {
  color: #6b7280;
  font-size: 13px;
  margin: 0 0 12px;
}
.kpi-row {
  margin-bottom: 12px;
}
.toolbar {
  margin: 8px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toolbar-right {
  display: flex;
  gap: 8px;
}
.filter-form {
  background: #fafbfc;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 0;
  display: flex;
  flex-wrap: wrap;
}
.filter-form .el-form-item {
  margin-bottom: 8px;
}
.row-clickable { cursor: pointer; }
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

/* 卡片视图 */
.card-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.card-grid-empty {
  grid-column: 1 / -1;
  padding: 40px;
  text-align: center;
  color: #9ca3af;
}
.work-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.work-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.work-card-img {
  width: 100%;
  height: 160px;
  display: block;
}
.work-card-noimg {
  width: 100%;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #9ca3af;
}
.work-card-body {
  padding: 10px 12px;
}
.work-card-title {
  font-weight: 500;
  color: #1f2937;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.work-card-meta {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
}
.work-card-time {
  margin-top: 2px;
  font-size: 12px;
  color: #9ca3af;
}
.work-card-actions {
  margin-top: 6px;
  display: flex;
  gap: 4px;
}
</style>
