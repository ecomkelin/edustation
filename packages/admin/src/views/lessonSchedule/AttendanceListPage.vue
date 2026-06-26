<template>
  <div class="attendance-list-page">
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filter" @submit.prevent>
        <el-form-item label="学生">
          <el-select
            v-model="filter.student"
            clearable
            filterable
            placeholder="全部"
            style="width: 200px"
          >
            <el-option v-for="s in studentOptions" :key="s._id" :label="s.name" :value="s._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="开班">
          <el-select
            v-model="filter.courseInstance"
            clearable
            filterable
            placeholder="全部"
            style="width: 200px"
          >
            <el-option v-for="ci in courseInstanceOptions" :key="ci._id" :label="ci.name" :value="ci._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status" clearable placeholder="全部" style="width: 160px">
            <el-option v-for="o in STATUS_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="课评">
          <el-select v-model="filter.evalState" clearable placeholder="全部" style="width: 160px">
            <el-option label="仅已消课" value="completed-only" />
            <el-option label="已消课已评" value="evaluated" />
            <el-option label="已消课未评" value="pending" />
            <el-option label="含补课记录" value="makeup" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="-"
            start-placeholder="从"
            end-placeholder="到"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 360px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="onSearch">查询</el-button>
          <el-button @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      >
        <template #title>
          <span>本页汇总该机构下所有 LessonAttendance，可按学生/开班/状态/课评/日期范围快速定位。
          点击「跳转排课」跳到「排课日历」并自动打开对应排课的考勤抽屉。</span>
        </template>
      </el-alert>

      <el-table v-loading="loading" :data="items" border size="small" max-height="640">
        <el-table-column label="学生" min-width="110">
          <template #default="{ row }">
            <span v-if="row.student">{{ row.student.name }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="开班 / 第几课" min-width="200">
          <template #default="{ row }">
            <div v-if="row.lessonSchedule">
              <div>{{ ciName(row) }}</div>
              <div class="muted" style="font-size:12px">
                第 {{ row.lessonSchedule.lessonNo }} 课 · {{ formatDate(row.lessonSchedule.plannedStartTime, 'MM-DD HH:mm') }}
              </div>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="plain">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="课评" min-width="130">
          <template #default="{ row }">
            <template v-if="row.status === 'completed' || row.status === 'madeup'">
              <el-tag v-if="row.evaluation && row.evaluation.evaluatedAt" type="success" size="small" effect="dark">已评 ✓</el-tag>
              <el-tag v-else type="warning" size="small" effect="plain">未评 ✗</el-tag>
              <div v-if="row.evaluation && row.evaluation.score" class="muted" style="font-size:12px; margin-top:2px">
                评分 {{ row.evaluation.score }}/5
              </div>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="实际时间" min-width="160">
          <template #default="{ row }">
            <div v-if="row.actualStartTime || row.actualEndTime" style="font-size:12px">
              <div v-if="row.actualStartTime">起 {{ formatDate(row.actualStartTime, 'MM-DD HH:mm') }}</div>
              <div v-if="row.actualEndTime">止 {{ formatDate(row.actualEndTime, 'MM-DD HH:mm') }}</div>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.lessonSchedule"
              size="small"
              link
              type="primary"
              @click="goToSchedule(row)"
            >跳转排课</el-button>
            <el-button
              v-if="(row.status === 'completed' || row.status === 'madeup') && row.lessonSchedule"
              size="small"
              link
              type="primary"
              @click="goToSchedule(row, true)"
            >写课评</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="filter.page"
        v-model:page-size="filter.pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 12px; justify-content: flex-end"
        @current-change="fetchList"
        @size-change="fetchList"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { courseInstanceApi } from '@/api/courseInstance'
import { studentApi } from '@/api/student'
import { formatDate } from '@/utils/format'

const router = useRouter()

const STATUS_OPTIONS = [
 { value: 'scheduled', label: '待上课' },
 { value: 'checked_in', label: '已签到' },
 { value: 'completed', label: '已消课' },
 { value: 'madeup', label: '已补' },
 { value: 'no_show', label: '未到' },
 { value: 'leave', label: '请假' }
]
const STATUS_LABELS = {
 scheduled: '待上课', checked_in: '已签到', completed: '已消课', madeup: '已补', no_show: '未到', leave: '请假'
}
// el-tag 的 type 校验只接受 primary/success/info/warning/danger，
// leave 是中性状态用 info；任何未知状态 fallback 也用 info（不能再用 ''，否则触发 Invalid prop 警告）。
const STATUS_TYPES = {
  scheduled: 'info', checked_in: 'warning', completed: 'success', madeup: 'warning', no_show: 'danger', leave: 'info'
}
function statusLabel(s) { return STATUS_LABELS[s] || s || '—' }
function statusType(s) { return STATUS_TYPES[s] || 'info' }

const filter = reactive({
 student: null,
 courseInstance: null,
 status: null,
 evalState: null,
 page:1,
 pageSize:20
})
const dateRange = ref(null)

const items = ref([])
const total = ref(0)
const loading = ref(false)
const courseInstanceOptions = ref([])
const studentOptions = ref([])

function ciName(row) {
 const ci = row.lessonSchedule && row.lessonSchedule.courseInstance
 if (!ci) return '—'
 return ci.name || '—'
}

async function fetchOptions() {
 try {
 const [ci, st] = await Promise.all([
 courseInstanceApi.list({ pageSize:200 }),
 studentApi.list({ pageSize:200 })
 ])
 courseInstanceOptions.value = ci.data?.items || ci.data || []
 studentOptions.value = st.data?.items || st.data || []
 } catch (e) {
 console.warn('load options failed', e)
 }
}

async function fetchList() {
 loading.value = true
 try {
 // 注意：lessonAttendanceApi.list 当前实现直接返回数组（非分页）
 // 这里我们手动截取分页（如果后端支持 page/pageSize 则更好；目前先用前端分页兜底）
 const params = {
 student: filter.student || undefined,
 courseInstance: filter.courseInstance || undefined,
 status: filter.status || undefined,
 from: dateRange.value?.[0],
 to: dateRange.value?.[1]
 }
 const r = await lessonAttendanceApi.list(params)
 let raw = r.data?.items || r.data || []
 // 课评/补课筛选（前端过滤；如果量大后端可加 support 参数）
 if (filter.evalState === 'completed-only') raw = raw.filter((a) => a.status === 'completed' || a.status === 'madeup')
 if (filter.evalState === 'evaluated') raw = raw.filter((a) => (a.status === 'completed' || a.status === 'madeup') && a.evaluation && a.evaluation.evaluatedAt)
 if (filter.evalState === 'pending') raw = raw.filter((a) => (a.status === 'completed' || a.status === 'madeup') && !(a.evaluation && a.evaluation.evaluatedAt))
 if (filter.evalState === 'makeup') raw = raw.filter((a) => a.status === 'madeup')
 total.value = raw.length
 const start = (filter.page -1) * filter.pageSize
 items.value = raw.slice(start, start + filter.pageSize)
 } catch (e) {
 ElMessage.error(e?.response?.data?.message || '加载考勤失败')
 } finally {
 loading.value = false
 }
}

function onSearch() { filter.page =1; fetchList() }
function onReset() {
 filter.student = null
 filter.courseInstance = null
 filter.status = null
 filter.evalState = null
 filter.page =1
 dateRange.value = null
 fetchList()
}

function goToSchedule(row, expandEval = false) {
 // 2026-06-26: 上课表下线, 改跳排课日历 (/schedule), 用 ?open=<scheduleId> 触发 calendar 自动弹抽屉
 //   eval=<attendanceId> 临时保留 query 字段以便未来日历 drawer 内 EvaluationEditor 自动滚动到对应行
 const scheduleId = row.lessonSchedule && (row.lessonSchedule._id || row.lessonSchedule.id)
 if (!scheduleId) return
 router.push({
 path: '/schedule',
 query: { open: scheduleId, eval: expandEval ? row._id || row.id : undefined }
 })
}

onMounted(async () => {
 await fetchOptions()
 await fetchList()
})
</script>

<style scoped>
.attendance-list-page { padding:0; }
.filter-card { margin-bottom:12px; }
.muted { color:#909399; font-size:12px; }
</style>
