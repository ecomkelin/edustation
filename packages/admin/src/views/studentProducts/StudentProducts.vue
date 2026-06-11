<template>
  <div class="page student-products-page">
    <h2>学生课包</h2>
    <p class="hint">
      学生持有的课包（StudentProduct）。来源主要是<strong>订单付款</strong>（自动按订单 items 创建），也可由员工<strong>直接赠课</strong>（绕过订单，标红展示 + 必填原因）。消课（FIFO）由考勤模块自动扣减。
    </p>

    <el-form :inline="true" :model="filter" @submit.prevent="load" class="filter-form">
      <el-form-item label="学生">
        <el-select
          v-model="filter.student"
          clearable
          filterable
          placeholder="全部学生"
          style="width: 200px"
          @change="load"
        >
          <el-option
            v-for="s in students"
            :key="s._id"
            :label="s.name"
            :value="s._id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="来源">
        <el-select v-model="filter.source" clearable placeholder="全部" style="width: 140px" @change="load">
          <el-option label="订单" value="order" />
          <el-option label="赠课" value="gift" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filter.isActive" clearable placeholder="全部" style="width: 140px" @change="load">
          <el-option label="启用" value="true" />
          <el-option label="停用" value="false" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button @click="resetFilters">重置</el-button>
        <el-button v-if="canGift" type="danger" plain @click="openGift">送课包</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="items" v-loading="loading" style="margin-top: 12px" :row-class-name="rowClass">
      <el-table-column label="学生" width="120">
        <template #default="{ row }">
          <span :class="row.source === 'gift' ? 'gift-strong' : 'cell-strong'">
            {{ row.student && row.student.name || '—' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="课程产品" min-width="220">
        <template #default="{ row }">
          <div :class="row.source === 'gift' ? 'gift-strong' : 'cell-strong'">
            {{ row.courseProduct && row.courseProduct.name || '—' }}
          </div>
          <div class="muted">
            课程产品默认
            <template v-if="row.courseProduct && row.courseProduct.totalLessons">
              {{ row.courseProduct.totalLessons }} 节 / {{ row.courseProduct.validDays || '?' }} 天
            </template>
            <template v-else>—</template>
          </div>
        </template>
      </el-table-column>
      <!-- 来源:订单(蓝) vs 赠课(红),赠课整行用 gift-strong 高亮,与订单列表的常规色调区分 -->
      <el-table-column label="来源" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.source === 'gift'" type="danger" size="small">赠课</el-tag>
          <el-tag v-else type="primary" size="small">订单</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="剩余/总课时" width="140">
        <template #default="{ row }">
          <div :class="row.source === 'gift' ? 'gift-strong' : 'cell-strong'">
            剩余 {{ row.remainingLessons }} / 共 {{ row.totalLessons }} 节
          </div>
          <el-progress
            :percentage="progressPct(row)"
            :stroke-width="6"
            :show-text="false"
            :color="row.source === 'gift' ? '#F56C6C' : '#409EFF'"
            style="margin-top: 4px"
          />
        </template>
      </el-table-column>
      <el-table-column label="到期日" width="130">
        <template #default="{ row }">
          <span :class="expiryClass(row)">{{ formatDate(row.expireDate, 'YYYY-MM-DD') || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
            {{ row.isActive ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="赠课信息" min-width="240">
        <template #default="{ row }">
          <template v-if="row.source === 'gift'">
            <div class="gift-strong">原因：{{ row.giftReason || '—' }}</div>
            <div class="muted">
              赠课人：{{ giftGiverName(row) }} · {{ formatDate(row.giftedAt, 'YYYY-MM-DD HH:mm') }}
            </div>
          </template>
          <template v-else>
            <div class="muted">
              来源订单：{{ row.order && row.order._id ? String(row.order._id).slice(-6) : '—' }}
            </div>
            <div class="muted">
              订单状态：{{ orderStatusLabel(row) }}
            </div>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ formatDate(row.createdAt, 'YYYY-MM-DD HH:mm') }}</template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && items.length === 0"
      description="暂无课包记录"
      :image-size="80"
      style="margin-top: 24px"
    />

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      style="margin-top: 12px; justify-content: flex-end;"
      @current-change="load"
      @size-change="onSizeChange"
    />

    <!-- 赠课弹窗:员工直接为学生创建 StudentProduct
         - 必填:学生、课程产品、原因
         - 选填:总课时(不填=产品默认)、到期日(不填=产品 validDays) -->
    <el-dialog v-model="giftDialog" title="送课包（员工赠课）" width="540px" :close-on-click-modal="false">
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 12px">
        <template #title>
          赠课不走订单支付，课包将标红展示并附上原因给家长知悉。需 <code>studentProduct.gift</code> 权限。
        </template>
      </el-alert>
      <el-form :model="giftForm" label-width="100px" ref="giftFormRef">
        <el-form-item label="学生" required>
          <el-select
            v-model="giftForm.student"
            filterable
            placeholder="选择学生"
            style="width: 100%"
            :empty-values="[null, undefined, '']"
          >
            <el-option
              v-for="s in students"
              :key="s._id"
              :label="s.name"
              :value="s._id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="课程产品" required>
          <el-select
            v-model="giftForm.courseProduct"
            filterable
            placeholder="选择课程产品（决定默认课时与有效期）"
            style="width: 100%"
            @change="onProductChange"
            :empty-values="[null, undefined, '']"
          >
            <el-option
              v-for="p in activeProducts"
              :key="p._id"
              :label="productLabel(p)"
              :value="p._id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="总课时">
          <el-input-number v-model="giftForm.totalLessons" :min="1" :max="9999" style="width: 100%" />
          <div class="form-hint">不填或保持产品默认时取「课程产品·总课时」</div>
        </el-form-item>
        <el-form-item label="到期日">
          <el-date-picker
            v-model="giftForm.expireDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="不填则按产品 validDays 自动计算"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="赠课原因" required>
          <el-input
            v-model="giftForm.giftReason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="必填。例：试听课奖励 / 老学员维护 / 投诉补偿 / 内部测试"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="giftDialog = false">取消</el-button>
        <el-button
          type="danger"
          :loading="giftSaving"
          :disabled="!canSubmitGift"
          @click="submitGift"
        >
          确认送课包
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { studentProductApi } from '@/api/studentProduct'
import { studentApi } from '@/api/student'
import { courseProductApi } from '@/api/courseProduct'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/format'

const auth = useAuthStore()

// ─── 权限判定 ───
// canGift: 当前用户是否能在本机构使用 studentProduct.gift 权限。
// - 平台超管直通
// - 否则检查当前机构的职位是否包含此权限码
const canGift = computed(() => {
  if (auth.isPlatformAdmin) return true
  const cur = auth.orgs.find((o) => o.id === auth.currentOrgId)
  if (!cur) return false
  return (cur.positions || []).some((p) => (p.permissions || []).includes('studentProduct.gift'))
})

const items = ref([])
const students = ref([])
const products = ref([]) // 全部产品（赠课弹窗用 isActive 过滤后再展示）
const loading = ref(false)

// ─── 分页 ───
// 后端 list 已支持 page / pageSize,返回 { items, total, page, pageSize }
// pageSize 选项与课程报名等其他列表保持一致;翻页不重置筛选,但筛选/重置要回到第 1 页
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const filter = reactive({
  student: '',
  source: '',
  isActive: ''
})

// ─── 加载 ───
async function loadStudents() {
  try {
    // isBlocked=false 过滤掉黑名单学员(赠课 / 筛选下拉永远拿不到)
    const r = await studentApi.list({ pageSize: 500, isBlocked: false })
    students.value = r.data.items || r.data || []
  } catch (e) {
    students.value = []
  }
}

async function loadProducts() {
  try {
    // courseProductApi.list 已经是精简 list 形态（看 courseProductApi 实现 / 实际响应）。
    // 服务端 list 一般返回 { data: [...] } 形式，按约定做容错。
    const r = await courseProductApi.list({ pageSize: 500 })
    products.value = r.data?.items || r.data || []
  } catch (e) {
    products.value = []
  }
}

// 赠课弹窗只展示启用中的产品
const activeProducts = computed(() => (products.value || []).filter((p) => p.isActive !== false))

function productLabel(p) {
  if (!p) return ''
  const lessons = p.totalLessons ? `${p.totalLessons} 节` : '? 节'
  const days = p.validDays ? `/${p.validDays}天` : ''
  return `${p.name} · ${lessons}${days}`
}

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (filter.student) params.student = filter.student
    if (filter.source) params.source = filter.source
    if (filter.isActive) params.isActive = filter.isActive
    const r = await studentProductApi.list(params)
    // 后端响应: { data: { items, total, page, pageSize } }
    const data = r.data || {}
    items.value = data.items || []
    total.value = data.total || 0
  } catch (e) {
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filter.student = ''
  filter.source = ''
  filter.isActive = ''
  page.value = 1 // 重置筛选回到第一页
  load()
}

// 切换每页大小时回到第 1 页:避免 pageSize 从 100 改成 10 后,当前页号已经超出范围
function onSizeChange() {
  page.value = 1
  load()
}

// ─── 行展示辅助 ───
function rowClass({ row }) {
  // 赠课行加浅红底色，订单行保持默认。与订单列表（蓝色/成功色）视觉区分。
  return row.source === 'gift' ? 'gift-row' : ''
}

function progressPct(row) {
  if (!row.totalLessons) return 0
  return Math.round((row.remainingLessons / row.totalLessons) * 100)
}

function giftGiverName(row) {
  const g = row.giftedBy
  if (!g) return '—'
  if (typeof g === 'string') return g.slice(-6)
  return g.realName || g.mobile || (g._id ? String(g._id).slice(-6) : '—')
}

function orderStatusLabel(row) {
  if (!row.order) return '—'
  return row.order.status || '—'
}

function expiryClass(row) {
  if (!row.expireDate) return 'muted'
  const days = Math.floor((new Date(row.expireDate).getTime() - Date.now()) / (24 * 3600 * 1000))
  if (days < 0) return 'expired'
  if (days < 30) return 'expiring'
  return ''
}

// ─── 赠课弹窗 ───
const giftDialog = ref(false)
const giftSaving = ref(false)
const giftFormRef = ref(null)
const giftForm = reactive({
  student: '',
  courseProduct: '',
  totalLessons: null, // null = 后端走产品默认
  expireDate: '',
  giftReason: ''
})

function openGift() {
  giftForm.student = ''
  giftForm.courseProduct = ''
  giftForm.totalLessons = null
  giftForm.expireDate = ''
  giftForm.giftReason = ''
  giftDialog.value = true
}

function onProductChange(id) {
  const p = activeProducts.value.find((x) => x._id === id)
  if (!p) return
  // 选了产品就回填默认值:总课时,便于用户直接看到「如果不改就送这么多」的效果
  giftForm.totalLessons = p.totalLessons || null
  if (p.validDays) {
    const d = new Date()
    d.setDate(d.getDate() + Number(p.validDays))
    giftForm.expireDate = d.toISOString().slice(0, 10)
  } else {
    giftForm.expireDate = ''
  }
}

const canSubmitGift = computed(() =>
  !!giftForm.student && !!giftForm.courseProduct && !!(giftForm.giftReason || '').trim()
)

async function submitGift() {
  if (!canSubmitGift.value) {
    return ElMessage.warning('请填写学生、课程产品和赠课原因')
  }
  giftSaving.value = true
  try {
    const payload = {
      student: giftForm.student,
      courseProduct: giftForm.courseProduct,
      giftReason: giftForm.giftReason.trim()
    }
    if (giftForm.totalLessons != null) payload.totalLessons = Number(giftForm.totalLessons)
    if (giftForm.expireDate) payload.expireDate = giftForm.expireDate
    await studentProductApi.gift(payload)
    ElMessage.success('已送课包')
    giftDialog.value = false
    load()
  } catch (e) {
    // http 拦截器已经弹过 ElMessage，这里只做兜底
    ElMessage.error(e?.response?.data?.message || '送课包失败')
  } finally {
    giftSaving.value = false
  }
}

onMounted(() => {
  loadStudents()
  loadProducts()
  load()
})
</script>

<style scoped>
.student-products-page { display: flex; flex-direction: column; }
.hint { color: #909399; font-size: 13px; margin: 4px 0 12px; line-height: 1.6; }
.hint strong { color: #303133; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; }

.cell-strong { font-weight: 600; color: #303133; }
/* 赠课课包高亮:按 CLAUDE.md "赠课产生的 StudentProduct 在管理后台/家长端标红"
   与订单（蓝色/常规）刻意区分，便于一眼识别。 */
.gift-strong { font-weight: 600; color: #F56C6C; }
.muted { color: #909399; font-size: 12px; }
.expired { color: #F56C6C; font-weight: 600; }
.expiring { color: #E6A23C; font-weight: 600; }

.form-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 4px;
}

/* 赠课整行加浅红底:与订单行形成整体色调差异 */
:deep(.el-table .gift-row) {
  background: #fef0f0 !important;
}
:deep(.el-table .gift-row:hover > td) {
  background: #fde2e2 !important;
}
</style>
