<template>
  <div class="page">
    <h2>课程报名</h2>
    <p class="hint">学生 ↔ 开班 的报名关系。报名时仅校验开班状态;名额和课包均不前置校验,超额通过"分班"调整。已归档/退班的记录是审计依据,请走状态变更;物理删除(误操删除)仅平台超管可见,且需输入自己的登录密码二次确认。归档由开班 active→closed 时后端自动级联,此处不再提供手动归档按钮。</p>

    <el-form :inline="true" :model="filter" @submit.prevent="load">
      <el-form-item label="开班状态">
        <el-select
          v-model="filter.courseInstanceStatuses"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          placeholder="全部开班状态"
          style="width: 240px"
        >
          <el-option label="招生中" value="enrolling" />
          <el-option label="进行中" value="active" />
          <el-option label="已结班" value="closed" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
      <el-form-item label="开班">
        <el-select v-model="filter.courseInstance" clearable placeholder="全部开班" style="width: 280px" filterable>
          <el-option v-for="i in courseInstanceOptions" :key="i._id" :label="instanceLabel(i)" :value="i._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filter.status" clearable placeholder="全部" style="width: 140px">
          <el-option label="已报名" value="enrolled" />
          <el-option label="教务退班" value="dropped" />
          <el-option label="家长退班" value="withdrew" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="load">查询</el-button>
        <el-button type="success" @click="openEnroll">新增报名</el-button>
        <el-button @click="openRecover">补报(进行中开班)</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="items" v-loading="loading" style="margin-top: 12px">
      <el-table-column label="学生" width="120">
        <template #default="{ row }">{{ row.student && row.student.name }}</template>
      </el-table-column>
      <el-table-column label="开班" min-width="280">
        <template #default="{ row }">
          <div class="cell-strong">{{ rowInstanceName(row) }}</div>
          <div class="muted">
            {{ row.courseInstance && row.courseInstance.courseProduct && row.courseInstance.courseProduct.name || '—' }}
            · 老师 {{ row.courseInstance && row.courseInstance.teacher && row.courseInstance.teacher.realName || '未指定' }}
            · 教室 {{ row.courseInstance && row.courseInstance.room && row.courseInstance.room.name || '未指定' }}
          </div>
        </template>
      </el-table-column>
      <!-- 课程进度:已上 / 共 N 节。LessonAttendance 模块功能尚未完善,目前展示的是
           后端按 LessonAttendance.status='completed' 简单统计的"已消课"数;后续该模块
           完善后,这里的数字会自动跟着细化(见后端 service 注释)。 -->
      <el-table-column label="课程进度" width="160">
        <template #default="{ row }">
          <div v-if="row.progress">
            <div class="cell-strong">已上 {{ row.progress.attendedLessons }} / 共 {{ row.progress.totalLessons || '?' }} 节</div>
            <div class="muted">已排课 {{ row.progress.scheduledLessons }} 节</div>
          </div>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <!-- 课包:为该开班按 FIFO 选中的 StudentProduct 的剩余/总。
           - 赠课(source='gift')标红,展示赠课原因,便于家长/教务辨识;
           - null 表示该学生当前没有可用课包(后续排课不会生成考勤)。 -->
      <el-table-column label="课包" width="200">
        <template #default="{ row }">
          <template v-if="row.studentProduct">
            <div :class="row.studentProduct.source === 'gift' ? 'gift-strong' : 'cell-strong'">
              剩余 {{ row.studentProduct.remainingLessons }} / 共 {{ row.studentProduct.totalLessons }} 节
            </div>
            <div class="muted" v-if="row.studentProduct.source === 'gift'">
              赠课 · {{ row.studentProduct.giftReason || '原因未填' }}
            </div>
            <div class="muted" v-else>购买课包</div>
          </template>
          <span v-else class="hint-warn">无可用课包</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="报名时间" width="170">
        <template #default="{ row }">{{ formatDate(row.enrolledAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="380" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'enrolled'" size="small" @click="openTransfer(row)">调整班级</el-button>
          <el-button v-if="row.status === 'enrolled'" size="small" type="primary" plain @click="openPickSp(row)">选课包</el-button>
          <el-button v-if="row.status === 'enrolled'" size="small" type="warning" @click="setStatus(row, 'dropped')">退班</el-button>
          <!-- 「误操删除」:仅 enrolled 状态,且仅平台超管可见。
               点击会走二次确认 + 输入登录密码,任何一步不通过都不执行。 -->
          <el-button
            v-if="row.status === 'enrolled' && isPlatformAdmin"
            size="small"
            type="danger"
            @click="remove(row)"
          >误操删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page" v-model:page-size="pageSize" :total="total"
      :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next"
      style="margin-top: 12px" @current-change="load" @size-change="load" />

    <!-- 新增报名:仅列招生中(enrolling)的开班 -->
    <EnrollStudentsDialog
      v-model="enrollDialog"
      title="新增报名 · 招生中开班"
      :course-instance-options="enrollingInstances"
      @done="load"
    />

    <!-- 补报:仅列进行中(active)的开班 -->
    <EnrollStudentsDialog
      v-model="recoverDialog"
      title="补报 · 进行中开班(已开课)"
      :course-instance-options="activeInstances"
      @done="load"
    />

    <!-- 调整班级(分班)弹窗 -->
    <el-dialog v-model="transferDialog" title="调整班级" width="500px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="学生">
          <span>{{ transferSource && transferSource.student && transferSource.student.name }}</span>
        </el-form-item>
        <el-form-item label="当前班级">
          <span>{{ transferSourceLabel }}</span>
        </el-form-item>
        <el-form-item label="目标班级" required>
          <el-select v-model="transferTarget" filterable placeholder="选择目标开班" style="width: 100%">
            <el-option
              v-for="c in transferOptions"
              :key="c._id"
              :label="instanceLabel(c) + ' · ' + statusLabel(c.status)"
              :value="c._id"
            />
          </el-select>
          <div v-if="transferOptions.length === 0" class="hint-warn">
            没有可转入的开班(需要状态为"招生中"或"进行中",且不能是当前班级)
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferDialog = false">取消</el-button>
        <el-button type="primary" :loading="transferring" :disabled="!transferTarget" @click="submitTransfer">确定</el-button>
      </template>
    </el-dialog>

    <!-- 选课包弹框：教务为该报名手动指定/调整主用课包 -->
    <el-dialog v-model="spDialog" title="选课包" width="560px" :close-on-click-modal="false">
      <div v-if="spTarget" v-loading="spLoading">
        <p class="hint">
          学生 <b>{{ spTarget.student?.name }}</b> · 开班 <b>{{ spTarget.courseInstance?.name }}</b>
        </p>
        <el-form label-width="100px">
          <el-form-item label="当前课包">
            <template v-if="spTarget.studentProduct">
              <span :class="spTarget.studentProduct.source === 'gift' ? 'gift-strong' : 'cell-strong'">
                剩余 {{ spTarget.studentProduct.remainingLessons }} / 共 {{ spTarget.studentProduct.totalLessons }} 节
              </span>
              <span class="muted" style="margin-left: 8px">
                {{ spTarget.studentProduct.source === 'gift' ? '赠课' : '购买' }}
              </span>
            </template>
            <span v-else class="hint-warn">未绑定</span>
          </el-form-item>
          <el-form-item label="可选课包">
            <el-select
              v-model="spSelected"
              filterable
              clearable
              placeholder="请选择该学生的有效课包（限本开班 acceptedCourseProducts 范围）"
              style="width: 100%"
            >
              <el-option
                v-for="sp in spOptions"
                :key="sp._id"
                :value="sp._id"
                :label="`${sp.courseProduct?.name || '?'} · 剩${sp.remainingLessons}/${sp.totalLessons}节 · ${sp.source === 'gift' ? '赠课' : '购买'} · 至${formatDate(sp.expireDate, 'YYYY-MM-DD')}`"
              />
            </el-select>
            <div class="hint" style="margin-top: 4px">
              共 {{ spOptions.length }} 个有效课包（含已用完 / 已过期的标灰不会显示）。
              选择空表示清空主用课包（排课时按 FIFO 兜底）。
            </div>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="spDialog = false">取消</el-button>
        <el-button type="primary" :loading="spSaving" :disabled="!spDirty" @click="submitPickSp">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { courseInstanceApi } from '@/api/courseInstance'
import { studentProductApi } from '@/api/studentProduct'
import { useAuthStore } from '@/stores/auth'
import EnrollStudentsDialog from '@/components/EnrollStudentsDialog.vue'

const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filter = reactive({ courseInstance: '', courseInstanceStatuses: ['enrolling', 'active'], status: '' })

// 当前登录用户(用于「误操删除」二次确认时显示操作人姓名,以及
// 根据 isPlatformAdmin 决定是否渲染删除按钮)
const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)
const currentUserRealName = computed(() => (auth.user && auth.user.realName) || auth.user.mobile || '当前账号')

const courseInstances = ref([])

// 两个独立的报名弹窗:一个面向招生中,一个面向已开课的补报
const enrollDialog = ref(false)
const recoverDialog = ref(false)

// 调整班级(分班)
const transferDialog = ref(false)
const transferSource = ref(null)
const transferTarget = ref('')
const transferOptions = ref([])
const transferring = ref(false)

// 选课包
const spDialog = ref(false)
const spTarget = ref(null)        // 当前编辑的 enrollment
const spOptions = ref([])         // 该学生的可选 StudentProduct 列表
const spSelected = ref('')        // 表单当前选中的 SP _id（空表示清空）
const spOriginal = ref('')        // 打开时的初始值，用于脏值检测
const spLoading = ref(false)
const spSaving = ref(false)
const spDirty = computed(() => String(spSelected.value || '') !== String(spOriginal.value || ''))

// 排序/排除 planning/cancelled 的派生列表(用于开班下拉 & 弹窗选班)
// 排序按业务优先级:enrolling → active → closed;同优先级内 startDate desc。
// planning / cancelled 业务上无报名数据,直接排除
const STATUS_ORDER = { enrolling: 0, active: 1, closed: 2, planning: 99, cancelled: 99 }
const displayCourseInstances = computed(() => {
  return [...courseInstances.value]
    .filter((i) => Object.prototype.hasOwnProperty.call(STATUS_ORDER, i.status) && STATUS_ORDER[i.status] < 99)
    .sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99
      const sb = STATUS_ORDER[b.status] ?? 99
      if (sa !== sb) return sa - sb
      const da = a.startDate ? new Date(a.startDate).getTime() : 0
      const db = b.startDate ? new Date(b.startDate).getTime() : 0
      return db - da
    })
})
// "开班"下拉:派生自"开班状态"多选筛选项
const courseInstanceOptions = computed(() =>
  displayCourseInstances.value.filter((i) => filter.courseInstanceStatuses.includes(i.status))
)

// 招生中(enrolling):主要报名场景 — 班还没开课,在正常排课前完成报名
const enrollingInstances = computed(() =>
  displayCourseInstances.value.filter((i) => i.status === 'enrolling')
)
// 进行中(active):补报场景 — 班已开课但允许中途加学生
// (默认不混在主报名下拉里,避免误把已开课的班当成正常招生)
const activeInstances = computed(() =>
  displayCourseInstances.value.filter((i) => i.status === 'active')
)

// 开班标签:开班名称优先,产品名作副信息,老师降级到末尾
function instanceLabel(i) {
  if (!i) return '—'
  const name = i.name || (i.courseProduct && i.courseProduct.name) || '?'
  const product = i.courseProduct && i.courseProduct.name
  const teacher = i.teacher && (i.teacher.realName || i.teacher.mobile)
  const parts = [name]
  if (product && product !== name) parts.push(product)
  parts.push(`老师 ${teacher || '未指定'}`)
  return parts.join(' · ')
}
function rowInstanceName(row) {
  const ci = row.courseInstance
  if (!ci) return '—'
  return ci.name || (ci.courseProduct && ci.courseProduct.name) || '?'
}
function statusLabel(s) {
  return {
    enrolled: '已报名', archived: '已归档', dropped: '教务退班', withdrew: '家长退班',
    planning: '筹备', enrolling: '招生中', active: '进行中', closed: '已结班', cancelled: '已取消'
  }[s] || s
}
function statusType(s) {
  return { enrolled: 'success', archived: 'info', dropped: 'warning', withdrew: 'danger' }[s] || ''
}
function formatDate(d) { return d ? new Date(d).toLocaleString() : '-' }

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (filter.courseInstance) params.courseInstance = filter.courseInstance
    if (filter.courseInstanceStatuses.length > 0) {
      params.courseInstanceStatus = filter.courseInstanceStatuses.join(',')
    }
    if (filter.status) params.status = filter.status
    const r = await courseEnrollmentApi.list(params)
    items.value = r.data.items
    total.value = r.data.total
  } finally {
    loading.value = false
  }
}

async function loadRefs() {
  // 仅拉开班(学生由 EnrollStudentsDialog 自管)
  const ci = await courseInstanceApi.list({ pageSize: 500 })
  courseInstances.value = ci.data.items || ci.data || []
}

function openEnroll() {
  if (enrollingInstances.value.length === 0) {
    return ElMessage.warning('当前没有"招生中"的开班,请先在「开班」页把目标开班状态推到"招生中"')
  }
  enrollDialog.value = true
}

function openRecover() {
  if (activeInstances.value.length === 0) {
    return ElMessage.warning('当前没有"进行中"的开班可补报')
  }
  recoverDialog.value = true
}

async function setStatus(row, toStatus) {
  const reason = toStatus === 'dropped' ? await ElMessageBox.prompt('退班原因(可选)', '退班', { confirmButtonText: '确定', cancelButtonText: '取消' }).catch(() => null) : null
  if (toStatus === 'dropped' && reason === null) return
  await courseEnrollmentApi.setStatus(row._id, { toStatus, reason: typeof reason === 'object' ? reason.value : undefined })
  ElMessage.success('已更新')
  load()
}

async function remove(row) {
  // 「误操」物理删除:仅超管可见,需输入自己的登录密码二次确认。
  // 用 ElMessageBox.prompt 拿密码输入框;ElMessageBox 本身确认按钮单独再走一次。
  // 双确认流程:先点「我已知晓风险」→ 弹密码框 → 提交。
  await ElMessageBox.confirm(
    '此操作不可恢复,且仅限「误操」场景(已归档/退班的记录请走状态变更)。\n点击「继续」后需输入您的登录密码。',
    '误操删除',
    { type: 'error', confirmButtonText: '继续', cancelButtonText: '取消' }
  )
  const { value: pwd } = await ElMessageBox.prompt(
    `请输入「${currentUserRealName.value}」的登录密码以确认:`,
    '操作密码',
    {
      type: 'warning',
      inputType: 'password',
      inputPlaceholder: '登录密码(6-64位)',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      inputValidator: (v) => (v && v.length >= 6 && v.length <= 64) || '请输入 6-64 位密码',
      inputErrorMessage: '请输入 6-64 位密码'
    }
  )
  if (!pwd) return
  await courseEnrollmentApi.remove(row._id, { password: pwd })
  ElMessage.success('已删除')
  load()
}

const transferSourceLabel = computed(() => {
  const src = transferSource.value
  if (!src || !src.courseInstance) return '—'
  return instanceLabel(src.courseInstance)
})

async function openTransfer(row) {
  transferSource.value = row
  transferTarget.value = ''
  if (courseInstances.value.length === 0) {
    try {
      const r = await courseInstanceApi.list({ pageSize: 500 })
      courseInstances.value = r.data.items || r.data || []
    } catch (e) {
      courseInstances.value = []
    }
  }
  const sourceId = row.courseInstance && (row.courseInstance._id || row.courseInstance.id)
  transferOptions.value = (courseInstances.value || []).filter((c) =>
    String(c._id) !== String(sourceId) &&
    ['enrolling', 'active'].includes(c.status)
  )
  transferDialog.value = true
}

async function submitTransfer() {
  if (!transferTarget.value) return ElMessage.warning('请选择目标班级')
  transferring.value = true
  try {
    await courseEnrollmentApi.update(transferSource.value._id, { courseInstance: transferTarget.value })
    ElMessage.success('已调整')
    transferDialog.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '调整失败')
  } finally {
    transferring.value = false
  }
}

// 打开"选课包"弹框：拉取该学生的全部 StudentProduct（含过期/用完，让教务显式确认）
async function openPickSp(row) {
  spTarget.value = row
  spLoading.value = true
  spDialog.value = true
  spSelected.value = row.studentProduct?._id || row.studentProduct || ''
  spOriginal.value = spSelected.value
  try {
    const r = await studentProductApi.list({ student: row.student._id || row.student, pageSize: 200 })
    spOptions.value = (r.data?.items || r.data || [])
      // 仅保留 courseProduct 在当前开班 acceptedCourseProducts 范围内的
      .filter((sp) => {
        const ci = row.courseInstance || {}
        const accepted = (ci.acceptedCourseProducts && ci.acceptedCourseProducts.length)
          ? ci.acceptedCourseProducts
          : (ci.courseProduct ? [ci.courseProduct] : [])
        const spCp = sp.courseProduct?._id || sp.courseProduct
        return accepted.some((id) => String(id) === String(spCp))
      })
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载课包列表失败')
    spOptions.value = []
  } finally {
    spLoading.value = false
  }
}

async function submitPickSp() {
  if (!spTarget.value || !spDirty.value) return
  spSaving.value = true
  try {
    // null 表示清空主用课包（按 FIFO 兜底）
    const newValue = spSelected.value || null
    await courseEnrollmentApi.update(spTarget.value._id, { studentProduct: newValue })
    ElMessage.success(newValue ? '已更新主用课包' : '已清空主用课包')
    spDialog.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    spSaving.value = false
  }
}

onMounted(() => {
  loadRefs()
  load()
})
</script>

<style scoped>
.hint { color: #909399; font-size: 13px; margin: 4px 0 12px; }
.cell-strong { font-weight: 600; color: #303133; }
/* 赠课课包高亮:按 CLAUDE.md "赠课产生的 StudentProduct 在管理后台/家长端标红" */
.gift-strong { font-weight: 600; color: #F56C6C; }
.muted { color: #909399; font-size: 12px; }
.hint-warn {
  color: #E6A23C;
  font-size: 12px;
  line-height: 1.4;
  margin-top: 4px;
}
</style>
