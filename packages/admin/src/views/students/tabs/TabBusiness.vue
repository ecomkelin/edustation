<!--
  TabBusiness.vue (2026-08-07)
  学生详情「业务」tab —— 在册开班 / 考勤 / 课包 / 订单 / 作品
  每个板块一个 R-0409 domain, 懒加载 + 各自分页。
-->
<template>
  <div>
    <RelatedSection
      :fetch="(params, opts) => studentApi.related(studentId, 'enrollments', params, opts)"
      :watch-key="studentId"
      title="在册开班（含历史）"
      empty-text="该学员未报名任何开班"
    >
      <template #columns>
        <el-table-column label="开班" min-width="180">
          <template #default="{ row }">
            <span v-if="row.courseInstance">
              <el-link v-if="!row.courseInstance.deletedAt" type="primary" underline="never" @click="goInstance(row.courseInstance.id)">
                {{ row.courseInstance.name }}
              </el-link>
              <span v-else>
                {{ row.courseInstance.name }}
                <el-tag type="info" size="small" style="margin-left: 6px">已删除</el-tag>
              </span>
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="课程产品" min-width="140">
          <template #default="{ row }">{{ row.courseInstance ? row.courseInstance.courseProduct : '—' }}</template>
        </el-table-column>
        <el-table-column label="学科" width="120">
          <template #default="{ row }">{{ row.courseInstance ? row.courseInstance.subject : '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="ENROLL_STATUS_TAG[row.status] || 'info'" size="small">
              {{ ENROLL_STATUS_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开课日期" width="120">
          <template #default="{ row }">{{ day(row.courseInstance && row.courseInstance.startDate) }}</template>
        </el-table-column>
        <el-table-column label="报名时间" width="170">
          <template #default="{ row }">{{ fmt(row.enrolledAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :fetch="(params, opts) => studentApi.related(studentId, 'lessonAttendances', params, opts)"
      :watch-key="studentId"
      title="考勤（近期在前）"
      empty-text="该学员暂无考勤记录"
    >
      <template #columns>
        <el-table-column label="课节" min-width="220">
          <template #default="{ row }">
            <span v-if="row.lesson">
              <el-link type="primary" underline="never" @click="goSchedule(row.lesson.id)">
                {{ row.lesson.title || `第 ${row.lesson.lessonNo} 节` }}
              </el-link>
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="上课时间" width="170">
          <template #default="{ row }">{{ fmt(row.lesson && row.lesson.plannedStartTime) }}</template>
        </el-table-column>
        <el-table-column label="考勤状态" width="110">
          <template #default="{ row }">
            <el-tag :type="ATTEND_STATUS_TAG[row.status] || 'info'" size="small">
              {{ ATTEND_STATUS_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="课评" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.evaluated" type="success" size="small">已评</el-tag>
            <span v-else style="color: #909399">—</span>
          </template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :fetch="(params, opts) => studentApi.related(studentId, 'studentProducts', params, opts)"
      :watch-key="studentId"
      title="课包（剩余课时多的在前）"
      empty-text="该学员暂无课包"
    >
      <template #columns>
        <el-table-column label="课程产品" min-width="160">
          <template #default="{ row }">{{ row.courseProduct || '—' }}</template>
        </el-table-column>
        <el-table-column label="来源" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.source === 'gift'" type="warning" size="small">赠课</el-tag>
            <el-tag v-else-if="row.source === 'order'" type="success" size="small">购课</el-tag>
            <span v-else style="color: #909399">—</span>
          </template>
        </el-table-column>
        <el-table-column label="剩余 / 总课时" width="140" align="right">
          <template #default="{ row }">
            <span :class="{ 'low': row.remainingLessons > 0 && row.remainingLessons <= 3 }">
              {{ row.remainingLessons }} / {{ row.totalLessons }}
            </span>
            <span v-if="row.remainingLessons === 0" class="dim">(已耗尽)</span>
          </template>
        </el-table-column>
        <el-table-column label="已用" width="80" align="right">
          <template #default="{ row }">{{ row.used }}</template>
        </el-table-column>
        <el-table-column label="到期日" width="120">
          <template #default="{ row }">{{ day(row.expireDate) }}</template>
        </el-table-column>
        <el-table-column label="备注" min-width="140">
          <template #default="{ row }">
            <span v-if="row.giftReason">{{ row.giftReason }}</span>
            <span v-else style="color: #909399">—</span>
          </template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :fetch="(params, opts) => studentApi.related(studentId, 'orders', params, opts)"
      :watch-key="studentId"
      title="订单（最近在前）"
      empty-text="该学员暂无订单"
    >
      <template #columns>
        <el-table-column label="订单" width="130">
          <template #default="{ row }">
            <span class="mono">#{{ row.id.slice(-6) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="课程" min-width="180">
          <template #default="{ row }">
            <div v-for="(it, i) in row.items" :key="i" class="order-item">
              <span>{{ it.courseProduct || '—' }}</span>
              <span class="dim">× {{ it.quantity }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="实付" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.actualPrice || row.paidAmount || 0) }}</template>
        </el-table-column>
        <el-table-column label="退款" width="110" align="right">
          <template #default="{ row }">
            <span v-if="row.refundedAmount > 0" class="refunded">{{ formatMoney(row.refundedAmount) }}</span>
            <span v-else style="color: #909399">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="ORDER_STATUS_TAG[row.status] || 'info'" size="small">
              {{ ORDER_STATUS_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :fetch="(params, opts) => studentApi.related(studentId, 'works', params, opts)"
      :watch-key="studentId"
      title="作品（不含已归档）"
      empty-text="该学员暂无作品"
    >
      <template #columns>
        <el-table-column label="标题" min-width="180">
          <template #default="{ row }">
            <el-link type="primary" underline="never" @click="goWork(row.id)">{{ row.title }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="学科" width="120">
          <template #default="{ row }">{{ row.subject || '—' }}</template>
        </el-table-column>
        <el-table-column label="等级" width="80">
          <template #default="{ row }">{{ row.level || '—' }}</template>
        </el-table-column>
        <el-table-column label="评分" width="80">
          <template #default="{ row }">{{ row.rating || '—' }}</template>
        </el-table-column>
        <el-table-column label="上传人" width="100">
          <template #default="{ row }">{{ row.uploadedBy || '—' }}</template>
        </el-table-column>
        <el-table-column label="上传时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { studentApi } from '@/api/student'
import RelatedSection from '@/components/RelatedSection.vue'
import { formatDate, formatMoney } from '@/utils/format'

defineProps({
  studentId: { type: String, required: true }
})

const router = useRouter()

// CourseEnrollment.status
const ENROLL_STATUS_LABEL = { enrolled: '在册', completed: '结业', withdrawn: '退班', archived: '归档', cancelled: '取消' }
const ENROLL_STATUS_TAG = { enrolled: 'success', completed: 'info', withdrawn: 'warning', archived: 'info', cancelled: 'danger' }
// LessonAttendance.status
const ATTEND_STATUS_LABEL = { scheduled: '已排课', completed: '出勤', absent: '缺勤', leave: '请假', madeup: '已补课', cancelled: '取消' }
const ATTEND_STATUS_TAG = { scheduled: 'info', completed: 'success', absent: 'danger', leave: 'warning', madeup: 'success', cancelled: 'info' }
// Order.status
const ORDER_STATUS_LABEL = { pending: '待支付', paid: '已支付', refunded: '已退款', partially_refunded: '部分退款', cancelled: '已取消', completed: '已完成' }
const ORDER_STATUS_TAG = { pending: 'warning', paid: 'success', refunded: 'danger', partially_refunded: 'warning', cancelled: 'info', completed: 'success' }

function fmt(d) {
  return d ? formatDate(d) : '—'
}
function day(d) {
  return d ? formatDate(d, 'YYYY-MM-DD') : '—'
}

function goInstance(id) {
  router.push({ path: '/course', query: { tab: 'instances', focus: id } })
}
function goSchedule(id) {
  router.push({ path: '/schedule/list', query: { focus: id } })
}
function goWork(id) {
  router.push({ path: `/student-works/${id}` })
}
</script>

<style scoped>
.dim { color: #909399; font-size: 12px; margin-left: 4px; }
.mono { font-family: monospace; color: #606266; }
.order-item { line-height: 1.6; }
.refunded { color: #f56c6c; font-weight: 600; }
.low { color: #e6a23c; font-weight: 600; }
</style>
