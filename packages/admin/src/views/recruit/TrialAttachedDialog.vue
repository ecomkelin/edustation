<template>
  <el-dialog
    :model-value="visible"
    :title="`跟班试听 - ${bookingLabel}`"
    width="720px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
  >
    <el-alert type="info" :closable="false" show-icon class="mb">
      <template #title>
        选择已有的正常排课 (isTrialLesson=false), 把该潜客挂到这节课一起试听
      </template>
    </el-alert>

    <el-form :inline="true" class="search-row">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始"
        end-placeholder="结束"
        value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
        style="width: 320px"
        @change="load"
      />
      <el-input v-model="keyword" placeholder="搜索课节标题" style="width: 180px" clearable @keyup.enter="load" @clear="load" />
      <el-button type="primary" :icon="Search" @click="load">搜索</el-button>
    </el-form>

    <el-table
      v-loading="loading"
      :data="rows"
      border
      max-height="420"
      @row-click="onPick"
    >
      <el-table-column label="时间" width="170">
        <template #default="{ row }">
          {{ formatTime(row.plannedStartTime) }}
        </template>
      </el-table-column>
      <el-table-column label="开班">
        <template #default="{ row }">
          {{ row.courseInstance?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="第几节" width="80">
        <template #default="{ row }">{{ row.lessonNo }}</template>
      </el-table-column>
      <el-table-column label="老师">
        <template #default="{ row }">
          {{ row.teacher?.realName || row.teacher?.mobile || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="教室">
        <template #default="{ row }">
          {{ row.room?.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="标题" prop="title" show-overflow-tooltip />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" :loading="pickedId === row._id" @click.stop="onPick(row)">
            选择
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { trialBookingApi } from '@/api/trialBooking'
import { lessonScheduleApi } from '@/api/lessonSchedule'

const props = defineProps({
  visible: { type: Boolean, default: false },
  booking: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'scheduled'])

const loading = ref(false)
const rows = ref([])
const dateRange = ref(null)
const keyword = ref('')
const pickedId = ref(null)

const bookingLabel = computed(() => {
  if (!props.booking) return ''
  return `${props.booking.preStudent?.name || ''} - 第 ${props.booking.attemptNo} 次`.trim()
})

watch(() => props.visible, (v) => {
  if (v) {
    dateRange.value = null
    keyword.value = ''
    load()
  }
}, { immediate: true })

async function load() {
  loading.value = true
  try {
    const r = await lessonScheduleApi.list({
      from: dateRange.value?.[0] || undefined,
      to: dateRange.value?.[1] || undefined,
      keyword: keyword.value || undefined,
      isTrialLesson: 'false',
      pageSize: 50
    })
    rows.value = (r.data?.items || []).filter((s) => s.status !== 'cancelled' && s.status !== 'archived')
  } finally {
    loading.value = false
  }
}

async function onPick(row) {
  if (!props.booking) return
  pickedId.value = row._id
  try {
    await trialBookingApi.create({
      preStudent: (props.booking.preStudent?._id || props.booking.preStudent?.id || props.booking.preStudent),
      joinMode: 'attached',
      lessonSchedule: row._id,
      remark: `从跟班试听 (bookingId=${props.booking._id}) 创建`
    })
    ElMessage.success('已加入跟班试听')
    emit('scheduled')
    emit('update:visible', false)
  } finally {
    pickedId.value = null
  }
}

function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}
</script>

<style scoped>
.mb {
  margin-bottom: 16px;
}
.search-row {
  margin-bottom: 12px;
}
</style>
