<!--
  TabGrowth.vue (2026-08-07)
  学生详情「成长」tab —— 积分流水 / 宠物事件
  两个轻量板块, 给教务一眼看出「学员在机构的活跃度 + 情感化运营痕迹」。
-->
<template>
  <div>
    <RelatedSection
      :fetch="(params, opts) => studentApi.related(studentId, 'pointsTransactions', params, opts)"
      :watch-key="studentId"
      title="积分流水（跨 org, 最近在前）"
      empty-text="该学员暂无积分变动"
    >
      <template #columns>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="PT_TYPE_TAG[row.type] || 'info'" size="small">
              {{ PT_TYPE_LABEL[row.type] || row.type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100" align="right">
          <template #default="{ row }">
            <span :class="{ up: row.amount > 0, down: row.amount < 0 }">
              {{ row.amount > 0 ? '+' : '' }}{{ row.amount }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="100" align="right">
          <template #default="{ row }">{{ row.balance }}</template>
        </el-table-column>
        <el-table-column label="原因" min-width="200">
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column label="发生时间" width="170">
          <template #default="{ row }">{{ fmt(row.occurredAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>

    <RelatedSection
      :fetch="(params, opts) => studentApi.related(studentId, 'petEvents', params, opts)"
      :watch-key="studentId"
      title="宠物事件（最近在前）"
      empty-text="该学员尚未领养宠物或暂无事件"
    >
      <template #columns>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="PET_EVENT_TAG[row.type] || 'info'" size="small">
              {{ PET_EVENT_LABEL[row.type] || row.type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="200">
          <template #default="{ row }">{{ row.title || '—' }}</template>
        </el-table-column>
        <el-table-column label="详情" min-width="240">
          <template #default="{ row }">
            <span v-if="row.detail">{{ row.detail }}</span>
            <span v-else style="color: #909399">—</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
      </template>
    </RelatedSection>
  </div>
</template>

<script setup>
import { studentApi } from '@/api/student'
import RelatedSection from '@/components/RelatedSection.vue'
import { formatDate } from '@/utils/format'

defineProps({
  studentId: { type: String, required: true }
})

// PointsTransaction.type
const PT_TYPE_LABEL = {
  consume: '兑换', attend: '考勤奖励', share: '分享', gift: '获赠',
  adjust: '手动调整', expire: '过期清零', welcome: '新人礼', other: '其他'
}
const PT_TYPE_TAG = {
  consume: 'info', attend: 'success', share: 'success', gift: 'warning',
  adjust: 'warning', expire: 'danger', welcome: 'success', other: 'info'
}
// PetEvent.type (按 pet-system-v3 实际 type; 历史值兜底为 info)
const PET_EVENT_LABEL = {
  adopt: '领养', feed: '喂养', hatch: '孵化', level_up: '升级',
  play: '互动', item_use: '用道具', rename: '改名', abandon: '弃养'
}
const PET_EVENT_TAG = {
  adopt: 'success', feed: 'warning', hatch: 'success', level_up: 'success',
  play: 'info', item_use: 'info', rename: 'info', abandon: 'danger'
}

function fmt(d) {
  return d ? formatDate(d) : '—'
}
</script>

<style scoped>
.up { color: #67c23a; font-weight: 600; }
.down { color: #f56c6c; font-weight: 600; }
</style>
