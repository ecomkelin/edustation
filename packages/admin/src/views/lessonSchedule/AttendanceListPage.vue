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
        <!--
          2026-07-09: 快速筛选 chip 组 (radio-button 风格, 与 task/TaskList 视图切换同款约定)
            - 全部考勤: 不过滤
            - 待补课:  status NOT IN [completed,madeup] AND schedule.status IN [completed,archived]
                       复用 MakeupPage.vue:257-264 的客户端过滤逻辑, 按 plannedStartTime 倒序
            - 待评价:  status IN [completed,madeup] AND !evaluation.evaluatedAt
            - 已补:    status === 'madeup'
          待补课 chip 上的红色 badge 数字 = 当前全量里"待补课"条数 (不管 chip 选啥, 都不变),
          让教务一眼看到"现在机构内有多少待补课" — 跨 chip 切换的固定指引.
          取代之前的「课评」select (4 个选项含义与 chip 一一对应, 两套 UI 互相打架).
        -->
        <el-form-item label="快速筛选">
          <el-radio-group v-model="filter.quickFilter" size="default" @change="onSearch">
            <el-radio-button value="">全部考勤</el-radio-button>
            <el-radio-button value="pending-makeup">
              待补课
              <el-badge
                v-if="pendingMakeupCount > 0"
                :value="pendingMakeupCount"
                type="warning"
                :max="99"
                style="margin-left: 4px"
              />
            </el-radio-button>
            <el-radio-button value="pending-eval">待评价</el-radio-button>
            <el-radio-button value="madeup">已补</el-radio-button>
          </el-radio-group>
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
        <!-- 2026-07-08: 归档开关 -->
        <el-form-item>
          <el-checkbox v-model="filter.showArchived" @change="onSearch">显示已归档</el-checkbox>
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
          <span>本页汇总该机构下所有 LessonAttendance，可按学生/开班/状态/日期范围快速定位。
          顶部「快速筛选」chip 可一键定位 <strong>待补课</strong>(已结束/已归档排课下的未消课考勤)/ <strong>待评价</strong>(已消课但没写课评)/ <strong>已补</strong>(已用 1-键补课) 三类典型场景。
          请假 / 未到考勤可点行内「1-键补课」直接补建已消课记录并扣减课包 1 课时；点击「已评 ✓」可在弹窗内查看完整课评。</span>
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
        <!-- 2026-07-09: 课评列点击 chip 打开弹窗:
             - 已评 ✓ → 查看弹窗 (evalDialog, 只读 el-descriptions)
             - 未评 ✗ → 写课评弹窗 (evalEditDialog, 可编辑表单)
             取消旧版「写课评」跳转排课 — 列表内 1 步完成, 不必绕道日历抽屉。 -->
        <el-table-column label="课评" min-width="130">
          <template #default="{ row }">
            <template v-if="row.status === 'completed' || row.status === 'madeup'">
              <el-tag
                v-if="row.evaluation && row.evaluation.evaluatedAt"
                type="success" size="small" effect="dark"
                style="cursor: pointer"
                @click="openEvalDialog(row)"
              >已评 ✓</el-tag>
              <el-tag
                v-else
                type="warning" size="small" effect="plain"
                style="cursor: pointer"
                @click="openEvalEditDialog(row)"
              >未评 ✗</el-tag>
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
        <!-- 2026-07-09: 操作列瘦身
             - 移除「跳转排课」(用户决策: 列表已聚合, 跳排课日历没必要)
             - 「写课评」移除 (EvaluationEditor 入口仍在 AttendanceRosterDialog, 由「排课日历」点事件进入)
             - 新增「1-键补课」: 仅 status ∈ {leave, no_show} 且排课已完成/已归档时显示 (复用 make isPendingMakeup 的语义)
             - 2026-07-10: 新增「添加作品」: 仅 status ∈ {completed, madeup} 时显示 (业务语义:
                 还没消课 = 还没上课, 没有作品可言; 已消课/已补 才有作品)。
               弹窗复用 studentWork 那套 UI, 三步选择 (课程/学生/考勤) 跳过, 因为这三个值已经知道 (来自行)。 -->
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canMakeup(row)"
              size="small"
              type="primary"
              :loading="makeupLoading[row._id || row.id]"
              @click="confirmOneKeyMakeup(row)"
            >1-键补课</el-button>
            <el-button
              v-if="canUploadWork(row)"
              size="small"
              type="success"
              @click="openAddWorkDialog(row)"
            >添加作品</el-button>
            <span v-if="!canMakeup(row) && !canUploadWork(row)" class="muted">—</span>
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

    <!--
      2026-07-09: 课评查看弹窗 — 点列表「已评 ✓」chip 弹出, 完整展示 score/content/strengths/improvements/evaluatedBy/evaluatedAt。
      列表本身只读, 写课评入口在 AttendanceRosterDialog (排课日历点事件进入)。
      用 el-descriptions 紧凑展示字段; 评语 / 亮点 / 改进单独 block 防止被压成单行。
    -->
    <el-dialog
      v-model="evalDialog"
      title="课评详情"
      width="520px"
      :close-on-click-modal="false"
    >
      <template v-if="evalTarget">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="学生">
            {{ evalTarget.student?.name || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="开班 / 课次">
            {{ ciName(evalTarget) }} · 第 {{ evalTarget.lessonSchedule?.lessonNo || '?' }} 课
          </el-descriptions-item>
          <el-descriptions-item label="评分">
            <el-rate
              v-model="evalDialogScoreDisplay"
              disabled
              show-score
              :max="5"
              :score-template="`${evalTarget.evaluation?.score || 0} / 5`"
            />
          </el-descriptions-item>
          <el-descriptions-item label="评语">
            <div style="white-space: pre-wrap">{{ evalTarget.evaluation?.content || '—' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="亮点">
            <div style="white-space: pre-wrap">{{ evalTarget.evaluation?.strengths || '—' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="待改进">
            <div style="white-space: pre-wrap">{{ evalTarget.evaluation?.improvements || '—' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="评价人">
            {{ evalTarget.evaluation?.evaluatedBy?.realName || evalTarget.evaluation?.evaluatedBy?.mobile || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="评价时间">
            {{ formatDate(evalTarget.evaluation?.evaluatedAt, 'YYYY-MM-DD HH:mm') }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="evalDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!--
      2026-07-09: 写课评弹窗 — 点列表「未评 ✗」chip 弹出, 录入评分/评语/亮点/待改进, 保存即写课评。
      与 evalDialog(只读) 解耦, 单一职责: 一个查看, 一个写。
      表单字段对齐 backend updateEvaluation:
        - score:    number 1-5 或 null (清除)
        - content:  string ≤2000 字符
        - strengths / improvements: string ≤1000 字符
      全部可选, 跟后端 validator 一致 (任何子集都允许保存)。
      排他门控:
        - 后端要求 attendance.status ∈ {completed, madeup} (未消课不允许写课评)
        - 排课归档后不可改 (READONLY_SCHEDULE_STATUSES.includes 'archived')
        - 列表 chip 已 v-if 限制 status ∈ {completed, madeup}, 排课归档判断交给后端兜底。
      保存成功后 mutate row.evaluation in-place (同 evaluation-editor fix 2026-07-09 的思路),
      让 chip 立即从「未评 ✗」翻成「已评 ✓」+ 显示新分数, 避免 reload 一遍列表。
    -->
    <el-dialog
      v-model="evalEditDialog"
      title="写课评"
      width="560px"
      :close-on-click-modal="false"
    >
      <template v-if="evalEditTarget">
        <el-alert
          type="info" :closable="false" show-icon
          style="margin-bottom: 12px"
        >
          <template #title>
            <span>
              {{ evalEditTarget.student?.name || '—' }} ·
              {{ ciName(evalEditTarget) }} · 第 {{ evalEditTarget.lessonSchedule?.lessonNo || '?' }} 课
              · {{ formatDate(evalEditTarget.lessonSchedule?.plannedStartTime, 'MM-DD HH:mm') }}
            </span>
          </template>
        </el-alert>
        <el-form label-width="80px">
          <el-form-item label="评分">
            <el-rate
              v-model="evalEditForm.score"
              :max="5"
              show-score
              :score-template="`${evalEditForm.score || 0} / 5`"
            />
          </el-form-item>
          <el-form-item label="总体评语">
            <el-input
              v-model="evalEditForm.content"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
              placeholder="例如：本节课认真听讲，互动积极..."
            />
          </el-form-item>
          <el-form-item label="亮点">
            <el-input
              v-model="evalEditForm.strengths"
              type="textarea"
              :rows="2"
              maxlength="1000"
              show-word-limit
              placeholder="本节课表现好的地方"
            />
          </el-form-item>
          <el-form-item label="待改进">
            <el-input
              v-model="evalEditForm.improvements"
              type="textarea"
              :rows="2"
              maxlength="1000"
              show-word-limit
              placeholder="下次可提升的方向"
            />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="evalEditDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="evalEditSaving"
          @click="saveEvalEdit"
        >保存课评</el-button>
      </template>
    </el-dialog>

    <!--
      2026-07-10: 添加作品 弹窗
      从考勤行直接发起, 三步选择 (课程/学生/考勤) 跳过 — 来自行内, 已隐式传入。
      复用 studentWork 既有 UI (upload → uploadMany → create), 不重新发明。
      文件先经 /storage/upload-many?scope=work 上传拿到 fileIds, 再以 JSON 调
      /api/v1/student-works 创建。弹窗关闭后调 fetchList 重新拉取考勤列表,
      行内会出现 "未评" link chip 之前, 作品本身与考勤列表正交, 跨页跳作品列表查看。
    -->
    <el-dialog
      v-model="addWorkDialog"
      title="添加学生作品"
      width="640px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <template v-if="addWorkTarget">
        <el-alert
          type="info" :closable="false" show-icon
          style="margin-bottom: 12px"
        >
          <template #title>
            <span>
              {{ addWorkTarget.student?.name || '—' }} ·
              {{ ciName(addWorkTarget) }} · 第 {{ addWorkTarget.lessonSchedule?.lessonNo || '?' }} 课
              · {{ formatDate(addWorkTarget.lessonSchedule?.plannedStartTime, 'MM-DD HH:mm') }}
            </span>
          </template>
          <template #default>
            <span style="font-size: 12px">
              学科 / 开班 / 学生 由后端从考勤自动推导，创建后不可改。
            </span>
          </template>
        </el-alert>
        <el-form :model="addWorkForm" label-width="100px">
          <el-form-item label="标题" required>
            <el-input
              v-model="addWorkForm.title"
              maxlength="100"
              show-word-limit
              placeholder="如：水墨山水-第一节"
            />
          </el-form-item>
          <el-form-item label="描述">
            <el-input
              v-model="addWorkForm.description"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
              placeholder="可选：作品的内容/教学要点等"
            />
          </el-form-item>
          <el-form-item label="等级">
            <el-rate
              v-model="addWorkForm.level"
              :max="5"
              show-score
              :score-template="`${addWorkForm.level || 0} / 5`"
            />
            <div class="muted" style="font-size: 12px; margin-top: 4px">
              1=入门 / 2=初学 / 3=合格 / 4=良好 / 5=优秀；不评 = 留空
            </div>
          </el-form-item>
          <el-form-item label="作品文件" required>
            <el-upload
              v-model:file-list="addWorkForm.fileList"
              :auto-upload="false"
              multiple
              list-type="picture"
              accept="image/*,video/*,audio/*,.pdf"
            >
              <el-button>选择新文件</el-button>
              <template #tip>
                <div class="muted" style="font-size: 12px">支持图片/视频/音频/PDF，至少 1 个</div>
              </template>
            </el-upload>
            <el-button link style="margin-top: 6px" @click="addWorkPicker = true">从文件库选</el-button>
            <div
              v-if="addWorkForm.pickedFileIds && addWorkForm.pickedFileIds.length"
              class="muted"
              style="font-size: 12px; margin-top: 4px"
            >
              已从文件库选 {{ addWorkForm.pickedFileIds.length }} 个，与上方新文件合并提交
            </div>
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="addWorkDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="addWorkSaving"
          :disabled="!canSubmitAddWork"
          @click="submitAddWork"
        >提交</el-button>
      </template>
    </el-dialog>

    <!-- 从文件库选学生作品文件（多选） -->
    <FilePicker
      v-model="addWorkPicker"
      multiple
      scope="work"
      title="选择学生作品文件"
      @select="onAddWorkPickedFiles"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { courseInstanceApi } from '@/api/courseInstance'
import { studentApi } from '@/api/student'
// 2026-07-10: 添加作品入口走 studentWork.create + storage.uploadMany, 跟作品列表页同套 API
import { studentWorkApi } from '@/api/studentWork'
import { storageApi } from '@/api/storage'
import { hasPermInOrg } from '@/utils/permissionHelper'
import { useAuthStore } from '@/stores/auth'
// 2026-07-10: 从文件库选 — 复用 studentWorks 用的 FilePicker 组件
import FilePicker from '@/components/FilePicker.vue'
import { formatDate } from '@/utils/format'

const auth = useAuthStore()

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
 // 2026-07-09: 取代旧 evalState select, 4 选项与 chip 1:1 对应:
 //   '' | 'pending-makeup' | 'pending-eval' | 'madeup'
 quickFilter: '',
 page:1,
 pageSize:20,
 // 2026-07-08: 归档开关
 showArchived: false
})
const dateRange = ref(null)

const items = ref([])
const total = ref(0)
const loading = ref(false)
const courseInstanceOptions = ref([])
const studentOptions = ref([])
// 2026-07-09: 待补课 badge 数字 — 不随 quickFilter 切换改变, 让教务跨 chip 一眼看到机构内
//   "还有多少待补课"。在 fetchList 后从原始 raw 派生 (chip 切到 pending-makeup 时是同源).
const pendingMakeupCount = ref(0)

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
 to: dateRange.value?.[1],
 // 2026-07-08: 归档过滤
 archived: filter.showArchived ? 'true' : undefined
 }
 const r = await lessonAttendanceApi.list(params)
 let raw = r.data?.items || r.data || []
 // 2026-07-09: 待补课 badge 数字 — 必须先算, 后续 chip 过滤会改 raw
 pendingMakeupCount.value = raw.filter(isPendingMakeup).length
 // 2026-07-09: 快速筛选 chip — 取代旧 evalState select (4 选项合并成 1 个 radio-button 组)
 //   pending-makeup / pending-eval / madeup 在拉到的全量数据上客户端二次过滤
 //   与 MakeupPage.vue:257-264 待补课语义保持一致
 if (filter.quickFilter === 'pending-makeup') {
  raw = raw.filter(isPendingMakeup)
  // 待补课按 plannedStartTime 倒序, 最近的优先 (跟 MakeupPage 一致)
  raw.sort((a, b) => {
   const ta = new Date(a.lessonSchedule?.plannedStartTime || 0).getTime()
   const tb = new Date(b.lessonSchedule?.plannedStartTime || 0).getTime()
   return tb - ta
  })
 } else if (filter.quickFilter === 'pending-eval') {
  raw = raw.filter((a) => (a.status === 'completed' || a.status === 'madeup') && !(a.evaluation && a.evaluation.evaluatedAt))
 } else if (filter.quickFilter === 'madeup') {
  raw = raw.filter((a) => a.status === 'madeup')
 }
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
 filter.quickFilter = ''
 filter.page =1
 dateRange.value = null
 fetchList()
}

/**
 * 2026-07-09: 「待补课考勤」定义 — 与 MakeupPage.vue:257-264 保持完全一致。
 * - 考勤 status ∈ {scheduled, checked_in, leave, no_show} (未消课/未补)
 * - 排课 status ∈ {completed, archived} (课已结束/归档)
 * 抽出 helper 让 badge 计数和 chip 过滤共用同一份语义, 避免两处实现漂移。
 */
function isPendingMakeup(a) {
 if (a.status === 'completed' || a.status === 'madeup') return false
 const schedStatus = a.lessonSchedule && a.lessonSchedule.status
 if (schedStatus !== 'completed' && schedStatus !== 'archived') return false
 return true
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

// ─── 1-键补课 (2026-07-09 新增) ────────────────────────────────────
// 复用 isPendingMakeup 的语义: 考勤未消课 (status ∈ {scheduled, checked_in, leave, no_show})
//   + 排课已完成/已归档 + 有 studentProduct 才能扣减课时。
// leave/no_show 是最常见的两种「未消课」场景, 之前用户必须跳到排课日历再点补, 现在直接在列表点即可。
const makeupLoading = reactive({}) // { [attendanceId]: boolean }
function canMakeup(row) {
 if (!row || !row.lessonSchedule) return false
 if (!isPendingMakeup(row)) return false
 // 没学生产品可扣 → 灰掉 (跟 MakeupPage 的 disable 逻辑保持一致)
 return !!(row.studentProduct && (row.studentProduct.remainingLessons || 0) > 0)
}
async function confirmOneKeyMakeup(row) {
 const id = row._id || row.id
 try {
  await ElMessageBox.confirm(
   `将为「${row.student?.name || '该学生'}」补建已消课记录，并扣减课包 1 课时。是否继续？`,
   '1-键补课',
   { type: 'warning', confirmButtonText: '确认补课', cancelButtonText: '取消' }
  )
 } catch {
  return // 取消
 }
 makeupLoading[id] = true
 try {
  await lessonAttendanceApi.makeup(id)
  ElMessage.success('已补课；学生课包 -1')
  await fetchList()
 } catch (e) {
  ElMessage.error(e?.response?.data?.message || '补课失败')
 } finally {
  makeupLoading[id] = false
 }
}

// ─── 课评查看弹窗 (2026-07-09 新增) ─────────────────────────────────
const evalDialog = ref(false)
const evalTarget = ref(null)
// el-rate 的 v-model 必须可写, 用一个 ref 当 display placeholder (实际显示用 evalTarget.evaluation.score)
const evalDialogScoreDisplay = computed(() => evalTarget.value?.evaluation?.score || 0)
function openEvalDialog(row) {
 evalTarget.value = row
 evalDialog.value = true
}

// ─── 写课评弹窗 (2026-07-09 新增) ─────────────────────────────────
//   列表行内「未评 ✗」点击触发 → 表单 → 保存即写课评。
//   表单字段与后端 updateEvaluation validator 对齐 (score/content/strengths/improvements 全部可选)。
const evalEditDialog = ref(false)
const evalEditTarget = ref(null)
const evalEditSaving = ref(false)
const evalEditForm = reactive({
 score: null,
 content: '',
 strengths: '',
 improvements: ''
})
function openEvalEditDialog(row) {
 evalEditTarget.value = row
 // 从已有 evaluation 预填 (这里 row.evaluation 通常为 null, 因为入口是「未评 ✗」chip;
 //   但接口兜底: 假如有人从其他入口又触发了同函数, 已有数据也不会丢)
 const ev = row && row.evaluation
 evalEditForm.score = ev && ev.score != null ? ev.score : null
 evalEditForm.content = (ev && ev.content) || ''
 evalEditForm.strengths = (ev && ev.strengths) || ''
 evalEditForm.improvements = (ev && ev.improvements) || ''
 evalEditDialog.value = true
}
async function saveEvalEdit() {
 if (!evalEditTarget.value) return
 if (evalEditSaving.value) return
 const id = evalEditTarget.value._id || evalEditTarget.value.id
 evalEditSaving.value = true
 try {
  const body = {
   score: evalEditForm.score,
   content: evalEditForm.content || null,
   strengths: evalEditForm.strengths || null,
   improvements: evalEditForm.improvements || null
  }
  const r = await lessonAttendanceApi.updateEvaluation(id, body)
  const saved = r.data || {}
  const ev = saved.evaluation || {}
  // 2026-07-09: 回写父对象的 evaluation (与 evaluation-editor fix 同思路)
  //   items 是 ref([]) 深度响应式, Object.assign 触发响应式更新;
  //   行内的「未评 ✗」chip 立即翻成「已评 ✓」+ 显示新分数, 无需 reload 列表。
  //   后端 fillFromAttendance 的等价逻辑: 不存在 evaluation 时整体赋值, 已有则字段覆盖保留其他字段。
  const nextEval = {
   score: ev.score ?? evalEditForm.score ?? null,
   content: ev.content ?? evalEditForm.content ?? '',
   strengths: ev.strengths ?? evalEditForm.strengths ?? '',
   improvements: ev.improvements ?? evalEditForm.improvements ?? '',
   evaluatedAt: ev.evaluatedAt || new Date().toISOString()
  }
  const row = evalEditTarget.value
  if (row.evaluation) Object.assign(row.evaluation, nextEval)
  else row.evaluation = nextEval
  ElMessage.success('课评已保存')
  evalEditDialog.value = false
 } catch (e) {
  ElMessage.error(e?.response?.data?.message || '课评保存失败')
 } finally {
  evalEditSaving.value = false
 }
}

// ─── 添加作品 (2026-07-10 新增) ──────────────────────────────────────
// 从考勤列表行直接发起, 跳到「学生作品 > 新增作品」时, 三步选择 (课程/学生/考勤) 已经隐式填好,
// UI 不重画, 仅保留标题/描述/等级/文件四步, 与 studentWorks/StudentWorks.vue createVisible 对齐。
// 业务前置:
//   - 仅 status ∈ {completed, madeup} 显示入口 (其他状态无作品可言)
//   - 必须有 studentWork.write 权限 (后端 requirePermission 兜底)
const addWorkDialog = ref(false)
const addWorkTarget = ref(null)            // 行 row 引用, 含 student / lessonSchedule / ...
const addWorkSaving = ref(false)
const addWorkPicker = ref(false)
const addWorkForm = reactive({
  title: '',
  description: '',
  level: 0,
  fileList: [],                            // el-upload 本地选择 (未上传)
  pickedFileIds: []                        // 从 FilePicker 选的已上传 File._id
})
function canUploadWork(row) {
  if (!row) return false
  if (!hasPermInOrg(auth, 'studentWork.write')) return false
  return row.status === 'completed' || row.status === 'madeup'
}
function openAddWorkDialog(row) {
  addWorkTarget.value = row
  // 表单 reset — 用 reactive 但每次都得显式清, 不能简单 = reactive({...})
  addWorkForm.title = ''
  addWorkForm.description = ''
  addWorkForm.level = 0
  addWorkForm.fileList = []
  addWorkForm.pickedFileIds = []
  addWorkDialog.value = true
}
function onAddWorkPickedFiles(files) {
  if (!files || !files.length) return
  const existing = new Set(addWorkForm.pickedFileIds.map(String))
  for (const f of files) {
    const id = String(f._id)
    if (!existing.has(id)) {
      addWorkForm.pickedFileIds.push(id)
      existing.add(id)
    }
  }
}
const canSubmitAddWork = computed(() => {
  const hasNew = addWorkForm.fileList && addWorkForm.fileList.length > 0
  const hasPicked = addWorkForm.pickedFileIds && addWorkForm.pickedFileIds.length > 0
  return !!(
    addWorkTarget.value &&
    String(addWorkForm.title || '').trim() &&
    (hasNew || hasPicked)
  )
})
async function submitAddWork() {
  if (!addWorkTarget.value || !canSubmitAddWork.value) return
  addWorkSaving.value = true
  try {
    // 1) 先传本地新文件
    const rawFiles = (addWorkForm.fileList || [])
      .map((f) => f.raw || (f.originFileObj) || f)
      .filter(Boolean)
    let uploadedIds = []
    if (rawFiles.length) {
      const upRes = await storageApi.uploadMany({ files: rawFiles, scope: 'work' })
      uploadedIds = (upRes.data?.items || []).map((i) => i.id)
    }
    const fileIds = [...(addWorkForm.pickedFileIds || []), ...uploadedIds]
    if (!fileIds.length) {
      ElMessage.error('请至少上传或选择一个文件')
      return
    }
    // 2) 创建作品
    const attendanceId = addWorkTarget.value._id || addWorkTarget.value.id
    const payload = {
      lessonAttendance: attendanceId,
      title: String(addWorkForm.title).trim(),
      fileIds
    }
    if (addWorkForm.description) payload.description = addWorkForm.description
    if (addWorkForm.level) payload.level = String(addWorkForm.level)
    await studentWorkApi.create(payload)
    ElMessage.success('作品已上传')
    addWorkDialog.value = false
    // 作品跟考勤列表正交 — 跨模块的写入不需要 reload 本页考勤行 (没列字段更新, 性能省下)
    // 用户如想看作品, 跳到 /studentWorks (左侧菜单"学生作品")。
  } catch (e) {
    // http.js 已弹 ElMessage; 错误细节留 ctx
    console.warn('[addWork]', e)
  } finally {
    addWorkSaving.value = false
  }
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
