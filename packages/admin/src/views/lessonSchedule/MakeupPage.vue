<template>
  <div class="makeup-page">
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
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="-"
            start-placeholder="从"
            end-placeholder="到"
            value-format="YYYY-MM-DD"
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
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      >
        <template #title>
          <span>本页列出「已结束/已归档」排课中所有未消课的考勤（leave / no_show / scheduled / checked_in）。
          点「补课」会按 FIFO 从该学生持有的匹配课包中扣减 1 课时，并新建一条 completed 记录。
          <strong>补课会真实扣减课包课时</strong>，请确认后再操作。</span>
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
                第 {{ row.lessonSchedule.lessonNo }} 课 · {{ formatDate(row.lessonSchedule.plannedStartTime, 'YYYY-MM-DD HH:mm') }}
              </div>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="原考勤状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="plain">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="课包" min-width="160">
          <template #default="{ row }">
            <template v-if="row.studentProduct">
              <el-tag size="small" effect="plain">剩 {{ row.studentProduct.remainingLessons }} 节</el-tag>
              <div class="muted" style="font-size:12px; margin-top:2px">
                至 {{ formatDate(row.studentProduct.expireDate, 'YYYY-MM-DD') }}
              </div>
            </template>
            <el-tag v-else size="small" type="danger" effect="plain">无课包</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="排课状态" min-width="120">
          <template #default="{ row }">
            <el-tag v-if="row.lessonSchedule" :type="scheduleType(row.lessonSchedule.status)" size="small" effect="plain">
              {{ scheduleLabel(row.lessonSchedule.status) }}
            </el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              :loading="makeupLoading[row._id || row.id]"
              @click="openMakeupDialog(row)"
            >补课</el-button>
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

    <!-- 补课确认弹框 -->
    <el-dialog v-model="makeupDialog" title="补课" width="480px" :close-on-click-modal="false">
      <el-form v-if="makeupTarget" label-width="100px">
        <el-form-item label="学生">
          <span class="value">{{ makeupTarget.student?.name || '—' }}</span>
        </el-form-item>
        <el-form-item label="原排课">
          <span class="muted">
            第 {{ makeupTarget.lessonSchedule?.lessonNo }} 课 ·
            {{ formatDate(makeupTarget.lessonSchedule?.plannedStartTime, 'YYYY-MM-DD HH:mm') }}
          </span>
        </el-form-item>
        <el-form-item label="原考勤状态">
          <el-tag :type="statusType(makeupTarget.status)" size="small" effect="plain">
            {{ statusLabel(makeupTarget.status) }}
          </el-tag>
        </el-form-item>
        <el-form-item label="课包">
          <template v-if="makeupTarget.studentProduct">
            <el-tag size="small" effect="plain">剩 {{ makeupTarget.studentProduct.remainingLessons }} 节</el-tag>
            <div class="muted" style="font-size:12px; margin-top:2px">
              至 {{ formatDate(makeupTarget.studentProduct.expireDate, 'YYYY-MM-DD') }}
            </div>
          </template>
          <el-tag v-else size="small" type="danger" effect="plain">无课包（无法补课）</el-tag>
        </el-form-item>
        <el-form-item label="说明">
          <el-alert type="info" :closable="false" show-icon>
            补课将自动从该学生匹配的课包中按 FIFO 扣减 1 课时，生成一条新的「已消课」考勤记录。
          </el-alert>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="makeupForm.remark"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="可选；记录补课原因/特殊说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="makeupDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!makeupTarget || !makeupTarget.studentProduct"
          :loading="makeupLoading[makeupTarget?._id || makeupTarget?.id]"
          @click="submitMakeup"
        >确认补课</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { courseInstanceApi } from '@/api/courseInstance'
import { studentApi } from '@/api/student'
import { formatDate } from '@/utils/format'

const STATUS_LABELS = {
 scheduled: '待上课', checked_in: '已签到', completed: '已消课', madeup: '已补', no_show: '未到', leave: '请假'
}
// el-tag 的 type 校验只接受 primary/success/info/warning/danger，leave 改 info。
const STATUS_TYPES = {
  scheduled: 'info', checked_in: 'warning', completed: 'success', madeup: 'warning', no_show: 'danger', leave: 'info'
}
const SCHEDULE_LABELS = {
  scheduled: '预备', preparing: '准备中', in_progress: '进行中', completed: '已结束', archived: '已归档', cancelled: '已取消'
}
const SCHEDULE_TYPES = {
  scheduled: 'info', preparing: 'primary', in_progress: 'warning', completed: 'success', archived: 'info', cancelled: 'danger'
}
function statusLabel(s) { return STATUS_LABELS[s] || s || '—' }
function statusType(s) { return STATUS_TYPES[s] || 'info' }
function scheduleLabel(s) { return SCHEDULE_LABELS[s] || s || '—' }
function scheduleType(s) { return SCHEDULE_TYPES[s] || 'info' }

const filter = reactive({
 student: null,
 courseInstance: null,
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

/**
 * 「待补课考勤」定义：
 * - 考勤本身 status ∈ {scheduled, checked_in, leave, no_show}（未消课/未补）
 * - 排课 status ∈ {completed, archived}（课已结束/归档）
 *
 * 业务语义：所有已结束排课下，凡未消课的学生考勤都应该被列出，方便教务统一扫描后批量决定是否补课。
 */
async function fetchList() {
 loading.value = true
 try {
 const params = {
 student: filter.student || undefined,
 courseInstance: filter.courseInstance || undefined,
 from: dateRange.value?.[0] ? `${dateRange.value[0]} 00:00:00` : undefined,
 to: dateRange.value?.[1] ? `${dateRange.value[1]} 23:59:59` : undefined
 }
 const r = await lessonAttendanceApi.list(params)
 const raw = r.data?.items || r.data || []
 const eligible = raw.filter((a) => {
 // 排除已消课/已补（无需再补）
 if (a.status === 'completed' || a.status === 'madeup') return false
 // 排课必须已结束或已归档
 const schedStatus = a.lessonSchedule && a.lessonSchedule.status
 if (schedStatus !== 'completed' && schedStatus !== 'archived') return false
 return true
 })
 // 按排课时间倒序（最近的需要补课的优先）
 eligible.sort((a, b) => {
 const ta = new Date(a.lessonSchedule?.plannedStartTime ||0).getTime()
 const tb = new Date(b.lessonSchedule?.plannedStartTime ||0).getTime()
 return tb - ta
 })
 total.value = eligible.length
 const start = (filter.page -1) * filter.pageSize
 items.value = eligible.slice(start, start + filter.pageSize)
 } catch (e) {
 ElMessage.error(e?.response?.data?.message || '加载待补课列表失败')
 } finally {
 loading.value = false
 }
}

function onSearch() { filter.page =1; fetchList() }
function onReset() {
 filter.student = null
 filter.courseInstance = null
 filter.page =1
 dateRange.value = null
 fetchList()
}

// ─── 补课弹框 ─────────────────────────────────────────────
const makeupDialog = ref(false)
const makeupTarget = ref(null)
const makeupForm = reactive({ remark: '' })
const makeupLoading = reactive({}) // { [attendanceId]: boolean }

function openMakeupDialog(row) {
 makeupTarget.value = row
 makeupForm.remark = ''
 makeupDialog.value = true
}

async function submitMakeup() {
 if (!makeupTarget.value) return
 const target = makeupTarget.value
 const id = target._id || target.id
 makeupLoading[id] = true
 try {
 await lessonAttendanceApi.makeup(id, { remark: makeupForm.remark || undefined })
 ElMessage.success('已补课；学生课包 -1')
 makeupDialog.value = false
 await fetchList()
 } catch (e) {
 ElMessage.error(e?.response?.data?.message || '补课失败')
 } finally {
 makeupLoading[id] = false
 }
}

onMounted(async () => {
 await fetchOptions()
 await fetchList()
})
</script>

<style scoped>
.makeup-page { padding:0; }
.filter-card { margin-bottom:12px; }
.muted { color:#909399; font-size:12px; }
.value { font-weight:500; }
</style>
