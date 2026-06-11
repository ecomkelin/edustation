<template>
  <div class="page orders-page">
    <h2>订单管理</h2>
    <p class="hint">
      员工在管理后台直接录单：选择学生 → 加入课程产品 → 录入支付方式与实付金额 → 提交即可收款（系统会按订单 items
      逐项给学生建好课包）。线上支付待后续开通。
    </p>

    <!-- ───── 筛选 ───── -->
    <el-form :inline="true" :model="filter" @submit.prevent="load" class="filter-form">
      <el-form-item label="学生">
        <el-select
          v-model="filter.student"
          clearable
          filterable
          placeholder="全部学生"
          style="width: 180px"
          @change="load"
        >
          <el-option v-for="s in students" :key="s._id" :label="s.name" :value="s._id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filter.status" clearable placeholder="全部" style="width: 130px" @change="load">
          <el-option v-for="(label, val) in ORDER_STATUS_LABEL" :key="val" :label="label" :value="val" />
        </el-select>
      </el-form-item>
      <el-form-item label="支付方式">
        <el-select
          v-model="filter.paymentMethod"
          clearable
          placeholder="全部"
          style="width: 130px"
          @change="load"
        >
          <el-option v-for="(label, val) in PAYMENT_METHOD_LABEL" :key="val" :label="label" :value="val" />
        </el-select>
      </el-form-item>
      <el-form-item label="下单日期">
        <el-date-picker
          v-model="filter.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DD"
          style="width: 240px"
          @change="load"
        />
      </el-form-item>
      <el-form-item>
        <el-button @click="resetFilters">重置</el-button>
        <el-button v-if="canCreate" type="primary" @click="openCreate">新建订单</el-button>
      </el-form-item>
    </el-form>

    <!-- ───── 列表 ───── -->
    <el-table :data="items" v-loading="loading" style="margin-top: 12px" :row-class-name="rowClass">
      <el-table-column label="订单号" width="120">
        <template #default="{ row }">
          <span class="muted">{{ String(row._id).slice(-6).toUpperCase() }}</span>
        </template>
      </el-table-column>
      <el-table-column label="学生" width="120">
        <template #default="{ row }">
          <span class="cell-strong">{{ (row.student && row.student.name) || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="课程产品" min-width="260">
        <template #default="{ row }">{{ itemsSummary(row) }}</template>
      </el-table-column>
      <el-table-column label="原价" width="110" align="right">
        <template #default="{ row }">¥ {{ formatMoney(row.originalPrice) }}</template>
      </el-table-column>
      <el-table-column label="成交价" width="110" align="right">
        <template #default="{ row }">
          <span :class="row.actualPrice < row.originalPrice ? 'cell-strong' : 'muted'">
            ¥ {{ formatMoney(row.actualPrice) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="实付" width="110" align="right">
        <template #default="{ row }">
          <span :class="row.paidAmount >= row.actualPrice && row.paidAmount > 0 ? 'cell-strong' : 'muted'">
            ¥ {{ formatMoney(row.paidAmount) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ ORDER_STATUS_LABEL[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="支付方式" width="100">
        <template #default="{ row }">
          <span class="muted">{{ PAYMENT_METHOD_LABEL[row.paymentMethod] || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="下单时间" width="160">
        <template #default="{ row }">{{ formatDate(row.createdAt, 'YYYY-MM-DD HH:mm') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link @click="openDetail(row)">详情</el-button>
          <el-button
            v-if="row.status === 'pending' && canCreate"
            size="small"
            link
            type="danger"
            @click="openCancel(row)"
          >
            取消
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top: 16px"
      @current-change="load"
    />

    <el-empty
      v-if="!loading && items.length === 0"
      description="暂无订单"
      :image-size="80"
      style="margin-top: 24px"
    />

    <!-- ───── 新建订单弹窗（员工线下收款一气呵成） ─────
         1) 选学生  2) 加产品（可多个，每个带数量）  3) 录支付方式 + 实付金额  4) 备注 → 提交
         后端在 create 阶段原子地标 paid 并按 items 创建 StudentProduct -->
    <el-dialog v-model="createDialog" title="新建订单（员工收款）" width="780px" :close-on-click-modal="false">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
        <template #title>
          客户在店里直接给钱？正常填完点「确认收款」即可，系统会同步给学生建好课包。
        </template>
      </el-alert>

      <el-form :model="createForm" label-width="100px" ref="createFormRef">
        <el-form-item label="学生" required>
          <el-select
            v-model="createForm.student"
            filterable
            placeholder="选择学生"
            style="width: 100%"
            :empty-values="[null, undefined, '']"
          >
            <el-option v-for="s in students" :key="s._id" :label="s.name" :value="s._id" />
          </el-select>
        </el-form-item>

        <el-form-item label="课程产品" required>
          <div class="picker">
            <el-select
              v-model="pickerProductId"
              filterable
              placeholder="选择课程产品加入订单"
              style="width: 100%"
              :empty-values="[null, undefined, '']"
              @change="onPickerAdd"
            >
              <el-option
                v-for="p in availableProducts"
                :key="p._id"
                :label="productLabel(p)"
                :value="p._id"
                :disabled="createForm.items.some((it) => it.courseProduct === p._id)"
              />
            </el-select>
          </div>
        </el-form-item>

        <!-- 已选产品列表（每行：产品名 + 三档价 + 数量） -->
        <el-form-item v-if="createForm.items.length" label=" ">
          <el-table :data="createForm.items" border size="small" class="items-table">
            <el-table-column label="产品" min-width="220">
              <template #default="{ row }">
                <div class="cell-strong">{{ row.name }}</div>
                <div class="muted">{{ row.totalLessons }} 节 / {{ row.validDays || '?' }} 天</div>
              </template>
            </el-table-column>
            <el-table-column label="单价" width="180">
              <template #default="{ row }">
                <div v-if="row.promotionActive" class="price-cell">
                  <span class="price-old">¥ {{ formatMoney(row.originalPrice) }}</span>
                  <span class="price-now">¥ {{ formatMoney(row.unitPrice) }}</span>
                  <el-tag type="danger" size="small">活动价</el-tag>
                </div>
                <div v-else class="price-cell">
                  <span class="price-old">¥ {{ formatMoney(row.originalPrice) }}</span>
                  <span class="price-now">¥ {{ formatMoney(row.unitPrice) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="数量" width="140">
              <template #default="{ row }">
                <el-input-number v-model="row.quantity" :min="1" :max="99" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="小计" width="120" align="right">
              <template #default="{ row }">
                <span class="cell-strong">¥ {{ formatMoney(row.unitPrice * row.quantity) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="" width="60" align="center">
              <template #default="{ $index }">
                <el-button link type="danger" size="small" @click="removeItem($index)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>

        <!-- 价格汇总 -->
        <el-form-item v-if="createForm.items.length" label="价格汇总">
          <div class="summary">
            <div>
              <span class="muted">原价合计：</span>
              <span class="cell-strong">¥ {{ formatMoney(totalOriginal) }}</span>
            </div>
            <div>
              <span class="muted">成交价：</span>
              <el-input-number
                v-model="createForm.actualPrice"
                :min="0"
                :max="totalOriginal"
                :precision="2"
                :step="10"
                size="small"
                style="width: 160px"
              />
              <span class="muted form-hint">默认 = 原价合计；可手动调低作为优惠</span>
            </div>
            <div>
              <span class="muted">实付金额：</span>
              <el-input-number
                v-model="createForm.paidAmount"
                :min="0"
                :max="createForm.actualPrice || totalOriginal"
                :precision="2"
                :step="10"
                size="small"
                style="width: 160px"
              />
              <span class="muted form-hint">默认 = 成交价；分期场景可填 < 成交价（订单会保持 pending）</span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="支付方式" required>
          <el-radio-group v-model="createForm.paymentMethod">
            <el-radio-button
              v-for="(label, val) in PAYMENT_METHOD_LABEL"
              :key="val"
              :value="val"
            >
              {{ label }}
            </el-radio-button>
          </el-radio-group>
          <div class="form-hint">默认现金。客户扫微信/支付宝付的也选对应项。</div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input
            v-model="createForm.remark"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="选填：优惠说明、客户留言等"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="createSaving"
          :disabled="!canSubmitCreate"
          @click="submitCreate"
        >
          确认收款
        </el-button>
      </template>
    </el-dialog>

    <!-- ───── 详情弹窗 ───── -->
    <el-dialog v-model="detailDialog" title="订单详情" width="640px">
      <el-descriptions v-if="current" :column="2" border size="small">
        <el-descriptions-item label="订单号">{{ String(current._id).slice(-6).toUpperCase() }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusTagType(current.status)" size="small">
            {{ ORDER_STATUS_LABEL[current.status] }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="学生">{{ current.student && current.student.name }}</el-descriptions-item>
        <el-descriptions-item label="支付方式">
          {{ PAYMENT_METHOD_LABEL[current.paymentMethod] || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="原价">¥ {{ formatMoney(current.originalPrice) }}</el-descriptions-item>
        <el-descriptions-item label="成交价">¥ {{ formatMoney(current.actualPrice) }}</el-descriptions-item>
        <el-descriptions-item label="实付">¥ {{ formatMoney(current.paidAmount) }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ formatDate(current.paidAt) || '—' }}</el-descriptions-item>
        <el-descriptions-item label="下单时间" :span="2">{{ formatDate(current.createdAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="current.remark" label="备注" :span="2">{{ current.remark }}</el-descriptions-item>
      </el-descriptions>

      <h4 style="margin: 16px 0 8px">订单明细</h4>
      <el-table v-if="current" :data="current.items" border size="small">
        <el-table-column label="课程产品" min-width="220">
          <template #default="{ row }">
            <div class="cell-strong">{{ row.name }}</div>
            <div class="muted" v-if="row.courseProduct && row.courseProduct.totalLessons">
              {{ row.courseProduct.totalLessons }} 节
            </div>
          </template>
        </el-table-column>
        <el-table-column label="单价" width="120" align="right">
          <template #default="{ row }">¥ {{ formatMoney(row.unitPrice) }}</template>
        </el-table-column>
        <el-table-column label="数量" width="80" align="center">
          <template #default="{ row }">{{ row.quantity }}</template>
        </el-table-column>
        <el-table-column label="小计" width="120" align="right">
          <template #default="{ row }">
            <span class="cell-strong">¥ {{ formatMoney(row.unitPrice * row.quantity) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- ───── 取消弹窗 ───── -->
    <el-dialog v-model="cancelDialog" title="取消订单" width="420px" :close-on-click-modal="false">
      <el-form :model="cancelForm" label-width="80px">
        <el-form-item label="订单号">
          <span class="muted">{{ current && String(current._id).slice(-6).toUpperCase() }}</span>
        </el-form-item>
        <el-form-item label="原因">
          <el-input
            v-model="cancelForm.reason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="选填：写明取消原因"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelDialog = false">不取消了</el-button>
        <el-button type="danger" :loading="cancelSaving" @click="submitCancel">确认取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { orderApi } from '@/api/order'
import { studentApi } from '@/api/student'
import { courseProductApi } from '@/api/courseProduct'
import { useAuthStore } from '@/stores/auth'
import { formatDate, formatMoney } from '@/utils/format'
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/utils/constants'

const auth = useAuthStore()

// ─── 权限 ───
// 平台超管直通；否则要求当前机构职位带 order.write 权限
const canCreate = computed(() => {
  if (auth.isPlatformAdmin) return true
  const cur = auth.orgs.find((o) => o.id === auth.currentOrgId)
  if (!cur) return false
  return (cur.positions || []).some((p) => (p.permissions || []).includes('order.write'))
})

// ─── 列表状态 ───
const items = ref([])
const students = ref([])
const products = ref([]) // 全部产品（弹窗用 isActive 过滤后再展示）
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const filter = reactive({
  student: '',
  status: '',
  paymentMethod: '',
  dateRange: []
})

// ─── 新建弹窗状态 ───
const createDialog = ref(false)
const createSaving = ref(false)
const createFormRef = ref(null)
const pickerProductId = ref('')
const createForm = reactive({
  student: '',
  items: [], // [{ courseProduct, name, quantity, unitPrice, originalPrice, totalLessons, validDays, promotionActive }]
  actualPrice: 0,
  paidAmount: 0,
  paymentMethod: 'cash', // 门店收银默认现金
  remark: ''
})

// 仅展示启用中的产品
const availableProducts = computed(() => (products.value || []).filter((p) => p.isActive !== false))

function productLabel(p) {
  if (!p) return ''
  const lessons = p.totalLessons ? `${p.totalLessons} 节` : '? 节'
  const days = p.validDays ? `/${p.validDays}天` : ''
  // 活动价产品展示「活动价 ¥X」以提示员工
  const promo = p.promotionActive && p.promotionPrice != null ? ` · 活动价¥${formatMoney(p.promotionPrice)}` : ''
  return `${p.name} · ${lessons}${days}${promo}`
}

// 选产品时把价格快照直接写入 items 行（与后端 service.pickUnitPrice 同口径）
function onPickerAdd(id) {
  const p = availableProducts.value.find((x) => x._id === id)
  pickerProductId.value = ''
  if (!p) return
  if (createForm.items.some((it) => it.courseProduct === p._id)) return
  const unitPrice = p.promotionActive && p.promotionPrice != null ? p.promotionPrice : p.discountPrice
  createForm.items.push({
    courseProduct: p._id,
    name: p.name,
    quantity: 1,
    unitPrice,
    originalPrice: p.originalPrice, // 用于"划线价"展示，与后端 originalPrice 概念不同
    totalLessons: p.totalLessons,
    validDays: p.validDays,
    promotionActive: !!p.promotionActive
  })
  recalcTotals()
}

function removeItem(idx) {
  createForm.items.splice(idx, 1)
  recalcTotals()
}

const totalOriginal = computed(() =>
  createForm.items.reduce((s, it) => s + (it.unitPrice || 0) * (it.quantity || 1), 0)
)

function recalcTotals() {
  // 新增/删除/改数量时把 actualPrice / paidAmount 同步到合计，让用户看到「默认全价」
  const sum = totalOriginal.value
  createForm.actualPrice = sum
  createForm.paidAmount = sum
}

const canSubmitCreate = computed(() =>
  !!createForm.student &&
  createForm.items.length > 0 &&
  !!createForm.paymentMethod &&
  createForm.paidAmount >= 0 &&
  createForm.actualPrice >= 0 &&
  createForm.actualPrice <= totalOriginal.value
)

async function submitCreate() {
  if (!canSubmitCreate.value) {
    return ElMessage.warning('请检查：学生、课程产品、支付方式、金额')
  }
  createSaving.value = true
  try {
    const payload = {
      student: createForm.student,
      items: createForm.items.map((it) => ({
        courseProduct: it.courseProduct,
        quantity: it.quantity
      })),
      actualPrice: createForm.actualPrice,
      paymentMethod: createForm.paymentMethod,
      paidAmount: createForm.paidAmount,
      remark: createForm.remark || undefined
    }
    const r = await orderApi.create(payload)
    const sps = r.data && r.data.studentProducts
    const msg = sps && sps.length
      ? `已收款，订单已支付，并为学生建好 ${sps.length} 个课包`
      : '订单已创建'
    ElMessage.success(msg)
    createDialog.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '创建订单失败')
  } finally {
    createSaving.value = false
  }
}

function openCreate() {
  createForm.student = ''
  createForm.items = []
  createForm.actualPrice = 0
  createForm.paidAmount = 0
  createForm.paymentMethod = 'cash'
  createForm.remark = ''
  pickerProductId.value = ''
  createDialog.value = true
}

// ─── 详情弹窗 ───
const detailDialog = ref(false)
const current = ref(null)

async function openDetail(row) {
  try {
    const r = await orderApi.detail(row._id)
    current.value = r.data
  } catch (e) {
    current.value = row // 兜底用列表行
  }
  detailDialog.value = true
}

// ─── 取消弹窗 ───
const cancelDialog = ref(false)
const cancelSaving = ref(false)
const cancelForm = reactive({ reason: '' })

function openCancel(row) {
  current.value = row
  cancelForm.reason = ''
  cancelDialog.value = true
}

async function submitCancel() {
  cancelSaving.value = true
  try {
    await orderApi.cancel(current.value._id, { reason: cancelForm.reason || undefined })
    ElMessage.success('订单已取消')
    cancelDialog.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '取消失败')
  } finally {
    cancelSaving.value = false
  }
}

// ─── 加载 ───
async function loadStudents() {
  try {
    const r = await studentApi.list({ pageSize: 500 })
    students.value = r.data?.items || r.data || []
  } catch (e) {
    students.value = []
  }
}

async function loadProducts() {
  try {
    const r = await courseProductApi.list({ pageSize: 500, isActive: 'true' })
    products.value = r.data?.items || r.data || []
  } catch (e) {
    products.value = []
  }
}

async function load() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (filter.student) params.student = filter.student
    if (filter.status) params.status = filter.status
    if (filter.paymentMethod) params.paymentMethod = filter.paymentMethod
    if (filter.dateRange && filter.dateRange.length === 2) {
      params.start = filter.dateRange[0]
      params.end = filter.dateRange[1]
    }
    const r = await orderApi.list(params)
    items.value = r.data.items || []
    total.value = r.data.total || 0
  } catch (e) {
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filter.student = ''
  filter.status = ''
  filter.paymentMethod = ''
  filter.dateRange = []
  page.value = 1
  load()
}

// ─── 列表展示辅助 ───
function itemsSummary(row) {
  if (!row.items || !row.items.length) return '—'
  return row.items
    .map((it) => {
      const name = (it.courseProduct && it.courseProduct.name) || it.name || '—'
      return it.quantity > 1 ? `${name} × ${it.quantity}` : name
    })
    .join('、')
}

function statusTagType(s) {
  if (s === 'paid') return 'success'
  if (s === 'pending') return 'warning'
  if (s === 'cancelled') return 'info'
  if (s === 'refunded') return 'danger'
  return ''
}

function rowClass({ row }) {
  if (row.status === 'paid') return 'paid-row'
  return ''
}

onMounted(() => {
  loadStudents()
  loadProducts()
  load()
})
</script>

<style scoped>
.orders-page { display: flex; flex-direction: column; }
.hint { color: #909399; font-size: 13px; margin: 4px 0 12px; line-height: 1.6; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; }

.cell-strong { font-weight: 600; color: #303133; }
.muted { color: #909399; font-size: 12px; }
.form-hint { font-size: 12px; color: #909399; margin-left: 8px; }

.picker { width: 100%; }

.items-table { margin-top: 0; }

.price-cell { display: flex; align-items: center; gap: 8px; }
.price-old { color: #c0c4cc; text-decoration: line-through; font-size: 12px; }
.price-now { color: #F56C6C; font-weight: 600; }

.summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 6px;
}

/* 已支付行加点浅绿底，与待支付/已取消形成视觉区分 */
:deep(.el-table .paid-row) {
  background: #f0f9eb !important;
}
:deep(.el-table .paid-row:hover > td) {
  background: #e1f3d8 !important;
}
</style>
