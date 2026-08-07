<!--
  tabs/TabWork.vue (2026-08-07)
  用户详情「工作记录」tab —— 任务 / 招生 / 财务 / 文件 四类工作痕迹。
-->
<template>
  <div>
    <RelatedSection
      :user-id="userId"
      domain="tasks"
      title="任务（发起 / 执行 / 监督，不含已归档）"
      empty-text="该账号没有相关任务"
    >
      <template #columns>
        <el-table-column label="标题" min-width="200">
          <template #default="{ row }">
            <el-link type="primary" underline="never" @click="go(`/tasks/${row.id}`)">{{ row.title }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="他的角色" width="170">
          <template #default="{ row }">
            <el-tag v-for="r in row.roles" :key="r" size="small" effect="plain" style="margin-right: 4px">
              {{ TASK_ROLE_LABEL[r] || r }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="TASK_STATUS_TAG[row.status] || 'info'" size="small">
              {{ TASK_STATUS_LABELS[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="他的进度" width="100">
          <template #default="{ row }">
            <span v-if="row.myStatus">{{ TASK_ASSIGNEE_STATUS_LABELS[row.myStatus] || row.myStatus }}</span>
            <span v-else class="dim">—</span>
          </template>
        </el-table-column>
        <el-table-column label="到期" width="170">
          <template #default="{ row }">{{ fmt(row.dueAt) }}</template>
        </el-table-column>
        <el-table-column v-if="showOrg" label="机构" min-width="160">
          <template #default="{ row }">{{ row.org ? row.org.name : '—' }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="parents"
      title="家长档案（推广 / 录入 / 跟进）"
      empty-text="该账号没有经手的家长档案"
    >
      <template #columns>
        <el-table-column label="家长" min-width="140">
          <template #default="{ row }">{{ row.name || '（未转化，无账号）' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="他的角色" width="180">
          <template #default="{ row }">
            <el-tag v-for="r in row.roles" :key="r" size="small" effect="plain" style="margin-right: 4px">
              {{ RECRUIT_ROLE_LABEL[r] || r }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生命周期" width="110">
          <template #default="{ row }">
            <el-tag :type="PARENT_LIFECYCLE_TAG_TYPE[row.lifecycle] || 'info'" size="small">
              {{ PARENT_LIFECYCLE_LABEL[row.lifecycle] || row.lifecycle }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近跟进" width="170">
          <template #default="{ row }">{{ fmt(row.lastContactedAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="childLeads"
      title="潜客（录入 / 邀约 / 跟进）"
      empty-text="该账号没有经手的潜客"
    >
      <template #columns>
        <el-table-column prop="name" label="孩子" min-width="120" />
        <el-table-column label="家长手机" width="130">
          <template #default="{ row }">{{ row.parent ? row.parent.phone : '—' }}</template>
        </el-table-column>
        <el-table-column label="他的角色" width="180">
          <template #default="{ row }">
            <el-tag v-for="r in row.roles" :key="r" size="small" effect="plain" style="margin-right: 4px">
              {{ RECRUIT_ROLE_LABEL[r] || r }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="CHILD_LEAD_STATUS_TAG_TYPE[row.status] || 'info'" size="small">
              {{ CHILD_LEAD_STATUS_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近跟进" width="170">
          <template #default="{ row }">{{ fmt(row.lastContactedAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="trialBookings"
      title="试听（上课 / 谈单 / 创建）"
      empty-text="该账号没有经手的试听"
    >
      <template #columns>
        <el-table-column label="孩子" min-width="120">
          <template #default="{ row }">{{ row.childLead ? row.childLead.name : '—' }}</template>
        </el-table-column>
        <el-table-column label="他的角色" width="180">
          <template #default="{ row }">
            <el-tag v-for="r in row.roles" :key="r" size="small" effect="plain" style="margin-right: 4px">
              {{ RECRUIT_ROLE_LABEL[r] || r }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="第几次" width="80">
          <template #default="{ row }">第 {{ row.attemptNo }} 次</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="TRIAL_BOOKING_STATUS_TAG_TYPE[row.status] || 'info'" size="small">
              {{ TRIAL_BOOKING_STATUS_LABEL[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.outcome" :type="TRIAL_OUTCOME_TAG_TYPE[row.outcome] || 'info'" size="small">
              {{ TRIAL_OUTCOME_LABEL[row.outcome] }}
            </el-tag>
            <span v-else class="dim">—</span>
          </template>
        </el-table-column>
        <el-table-column label="试听时间" width="170">
          <template #default="{ row }">{{ fmt(row.scheduledAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="financeTx"
      title="经手的财务流水"
      empty-text="该账号没有录入过财务流水"
    >
      <template #columns>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="FINANCE_TX_TYPE_TAG_TYPE[row.type] || 'info'" size="small">
              {{ FINANCE_TX_TYPE_LABEL[row.type] || row.type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="账本" min-width="130">
          <template #default="{ row }">{{ row.account || '—' }}</template>
        </el-table-column>
        <el-table-column label="收支原因" min-width="130">
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column label="发生时间" width="170">
          <template #default="{ row }">{{ fmt(row.occurredAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="giftedProducts"
      title="经手的赠课"
      empty-text="该账号没有送过课包"
    >
      <template #columns>
        <el-table-column label="学员" width="120">
          <template #default="{ row }">{{ row.student ? row.student.name : '—' }}</template>
        </el-table-column>
        <el-table-column label="课程产品" min-width="150">
          <template #default="{ row }">{{ row.courseProduct || '—' }}</template>
        </el-table-column>
        <el-table-column label="课时" width="100">
          <template #default="{ row }">{{ row.remainingLessons }} / {{ row.totalLessons }}</template>
        </el-table-column>
        <el-table-column label="赠送原因" min-width="150">
          <template #default="{ row }">{{ row.giftReason || '—' }}</template>
        </el-table-column>
        <el-table-column label="赠送时间" width="170">
          <template #default="{ row }">{{ fmt(row.giftedAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="refunds"
      title="经手的退款"
      empty-text="该账号没有经手过退款"
    >
      <template #columns>
        <el-table-column label="订单" width="120">
          <template #default="{ row }">
            <!-- Order 没有单号字段, 用 _id 后 6 位当人读标识 -->
            <span class="mono">#{{ row.id.slice(-6) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="学员" width="120">
          <template #default="{ row }">{{ row.student ? row.student.name : '—' }}</template>
        </el-table-column>
        <el-table-column label="订单状态" width="110">
          <template #default="{ row }">{{ ORDER_STATUS_LABEL[row.status] || row.status }}</template>
        </el-table-column>
        <el-table-column label="他经手的退款" min-width="220">
          <template #default="{ row }">
            <div v-for="(r, i) in row.myRefunds" :key="i" class="refund-line">
              <b>{{ formatMoney(r.amount) }}</b>
              <span class="dim">{{ fmt(r.refundedAt) }}</span>
              <span class="dim">{{ r.reason }}</span>
            </div>
          </template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :user-id="userId"
      domain="files"
      title="上传的文件"
      empty-text="该账号没有上传过文件"
    >
      <template #columns>
        <el-table-column label="文件名" min-width="220">
          <template #default="{ row }">{{ row.originalName || '（无名）' }}</template>
        </el-table-column>
        <el-table-column label="用途" width="120">
          <template #default="{ row }">{{ row.scope }}</template>
        </el-table-column>
        <el-table-column label="大小" width="100" align="right">
          <template #default="{ row }">{{ fileSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="引用" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.isOrphan" type="warning" size="small">孤儿</el-tag>
            <span v-else>{{ row.refCount }} 处</span>
          </template>
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
import RelatedSection from './RelatedSection.vue'
import { formatDate, formatMoney } from '@/utils/format'
import {
  ORDER_STATUS_LABEL,
  PARENT_LIFECYCLE_LABEL,
  PARENT_LIFECYCLE_TAG_TYPE,
  CHILD_LEAD_STATUS_LABEL,
  CHILD_LEAD_STATUS_TAG_TYPE,
  TRIAL_BOOKING_STATUS_LABEL,
  TRIAL_BOOKING_STATUS_TAG_TYPE,
  TRIAL_OUTCOME_LABEL,
  TRIAL_OUTCOME_TAG_TYPE,
  FINANCE_TX_TYPE_LABEL,
  FINANCE_TX_TYPE_TAG_TYPE
} from '@/utils/constants'
import { TASK_STATUS_LABELS, TASK_ASSIGNEE_STATUS_LABELS } from '@shared/enums.mjs'

defineProps({
  userId: { type: String, required: true },
  showOrg: { type: Boolean, default: false }
})

const router = useRouter()

// 后端 related 里给每行算好的 roles[]，这里只做中文化
const TASK_ROLE_LABEL = { creator: '发起人', assignee: '执行人', supervisor: '监督人' }
const RECRUIT_ROLE_LABEL = {
  promoter: '推广人',
  creator: '录入人',
  lastContact: '最近跟进',
  inviteTeacher: '邀约老师',
  teacher: '上课老师',
  consultant: '谈单老师'
}

const TASK_STATUS_TAG = {
  draft: 'info',
  assigned: 'info',
  in_progress: 'warning',
  partial_submitted: 'warning',
  submitted: 'primary',
  approved: 'success',
  rejected: 'danger',
  expired: 'danger',
  cancelled: 'info'
}

function fmt(d) {
  return d ? formatDate(d) : '—'
}
function fileSize(n) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
function go(p) {
  router.push(p)
}
</script>

<style scoped>
.dim { color: #909399; font-size: 12px; margin-left: 6px; }
.mono { font-family: monospace; color: #606266; }
.refund-line { line-height: 1.6; }
</style>
