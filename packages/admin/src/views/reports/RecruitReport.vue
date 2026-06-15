<template>
  <div class="recruit-report">
    <el-card class="header-card" shadow="never">
      <div class="header-row">
        <h3>招生看板</h3>
        <el-date-picker
          v-model="range"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          @change="loadAll"
        />
      </div>
    </el-card>

    <el-tabs v-model="activeTab" class="report-tabs">
      <!-- 推广人员 ROI -->
      <el-tab-pane label="推广人员 ROI" name="promoter">
        <el-card shadow="never">
          <el-table
            v-loading="loading.promoter"
            :data="promoterItems"
            border
            stripe
            :empty-text="loading.promoter ? '加载中' : '暂无数据'"
          >
            <el-table-column label="推广人" min-width="120">
              <template #default="{ row }">
                {{ row.realName }}
                <span class="muted" v-if="row.mobile"> ({{ row.mobile }})</span>
              </template>
            </el-table-column>
            <el-table-column label="录入家长" width="120" align="right" prop="parentCount" />
            <el-table-column label="孩子数" width="100" align="right" prop="childLeadCount" />
            <el-table-column label="已转化" width="100" align="right" prop="convertedCount">
              <template #default="{ row }">
                <el-tag type="success" size="small">{{ row.convertedCount }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="已流失" width="100" align="right" prop="lostCount">
              <template #default="{ row }">
                <el-tag type="danger" size="small" v-if="row.lostCount > 0">{{ row.lostCount }}</el-tag>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="转化率" width="120" align="right" prop="conversionRate">
              <template #default="{ row }">
                <span :class="rateClass(row.conversionRate)">{{ row.conversionRate }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 试听老师转化率 -->
      <el-tab-pane label="试听老师转化率" name="teacher">
        <el-card shadow="never">
          <el-table
            v-loading="loading.teacher"
            :data="teacherItems"
            border
            stripe
            :empty-text="loading.teacher ? '加载中' : '暂无数据'"
          >
            <el-table-column label="试听老师" min-width="120">
              <template #default="{ row }">
                {{ row.realName }}
                <span class="muted" v-if="row.mobile"> ({{ row.mobile }})</span>
              </template>
            </el-table-column>
            <el-table-column label="试听过" width="100" align="right" prop="trialCount" />
            <el-table-column label="到店" width="100" align="right" prop="arrivedCount">
              <template #default="{ row }">{{ row.arrivedCount }}</template>
            </el-table-column>
            <el-table-column label="完成" width="100" align="right" prop="completedCount" />
            <el-table-column label="已报名" width="100" align="right" prop="enrolledCount">
              <template #default="{ row }">
                <el-tag type="success" size="small">{{ row.enrolledCount }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="转化率" width="120" align="right" prop="conversionRate">
              <template #default="{ row }">
                <span :class="rateClass(row.conversionRate)">{{ row.conversionRate }}%</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import http from '@/api/http'

const activeTab = ref('promoter')
const range = ref([])
const promoterItems = ref([])
const teacherItems = ref([])
const loading = reactive({ promoter: false, teacher: false })

onMounted(() => {
  loadAll()
})

async function loadAll() {
  await Promise.all([loadPromoter(), loadTeacher()])
}

async function loadPromoter() {
  loading.promoter = true
  try {
    const params = {}
    if (range.value && range.value[0]) {
      params.from = range.value[0]
      params.to = range.value[1]
    }
    const r = await http.get('/reports/recruit-promoter', { params })
    promoterItems.value = r.data?.items || []
  } finally {
    loading.promoter = false
  }
}

async function loadTeacher() {
  loading.teacher = true
  try {
    const params = {}
    if (range.value && range.value[0]) {
      params.from = range.value[0]
      params.to = range.value[1]
    }
    const r = await http.get('/reports/recruit-teacher-conversion', { params })
    teacherItems.value = r.data?.items || []
  } finally {
    loading.teacher = false
  }
}

function rateClass(rate) {
  if (rate >= 30) return 'rate-high'
  if (rate >= 10) return 'rate-mid'
  return 'rate-low'
}
</script>

<style scoped>
.recruit-report { padding: 16px; }
.header-card { margin-bottom: 16px; }
.header-row { display: flex; justify-content: space-between; align-items: center; }
.header-row h3 { margin: 0; }
.report-tabs { background: #fff; padding: 8px 16px; border-radius: 4px; }
.muted { color: #909399; font-size: 12px; }
.rate-high { color: #67c23a; font-weight: 600; }
.rate-mid { color: #e6a23c; font-weight: 500; }
.rate-low { color: #909399; }
</style>
