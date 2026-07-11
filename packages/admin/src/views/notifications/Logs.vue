<!--
  Notification Logs.vue (admin 端) - 发送流水
  - 数据源 R-4012 GET /notifications/admin/logs
  - 字段: sentAt / channel / status / notification(标题预览) / error
  - 筛选: channel / status / 时间范围
  - 分页 + 重试按钮 (P2 实现, MVP 只读)
  - NotificationLog TTL 30 天自动清理
-->
<template>
  <div class="page-logs">
    <div class="page-logs__header">
      <h2>通知发送流水</h2>
      <p class="page-logs__desc">
        所有通知渠道的发送记录（inbox / wechatMini / sms / push / websocket）。30 天自动归档。
      </p>
    </div>

    <div class="page-logs__toolbar">
      <el-select v-model="filter.channel" placeholder="渠道" clearable style="width: 140px" @change="load">
        <el-option v-for="c in channelOptions" :key="c" :label="c" :value="c" />
      </el-select>
      <el-select v-model="filter.status" placeholder="状态" clearable style="width: 140px" @change="load">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-table :data="items" v-loading="loading" border stripe style="width: 100%">
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ formatTime(row.sentAt) }}</template>
      </el-table-column>
      <el-table-column prop="channel" label="渠道" width="110">
        <template #default="{ row }">
          <el-tag :type="row.channel === 'inbox' ? 'success' : 'info'" size="small">{{ row.channel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="通知" min-width="240">
        <template #default="{ row }">
          <div class="page-logs__notif">
            <div class="page-logs__notif-title">{{ row.request && row.request.templateTitle || row.notification || '-' }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="error" label="错误" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.error" class="page-logs__error">{{ row.error }}</span>
          <span v-else class="page-logs__muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="retryCount" label="重试" width="70" align="center" />
    </el-table>

    <div class="page-logs__pager">
      <el-pagination
        v-model:current-page="filter.page"
        v-model:page-size="filter.pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @current-change="load"
        @size-change="load"
      />
    </div>
  </div>
</template>

<script>
import { ElMessage } from 'element-plus'
import { notificationApi } from '@/api/notification'

const CHANNELS = ['inbox', 'wechatMini', 'wechatPublic', 'sms', 'push', 'websocket']
const STATUSES = ['pending', 'sent', 'failed', 'skipped']

export default {
  name: 'NotificationLogs',
  data() {
    return {
      loading: false,
      items: [],
      total: 0,
      filter: {
        page: 1,
        pageSize: 20,
        channel: '',
        status: ''
      },
      channelOptions: CHANNELS,
      statusOptions: STATUSES
    }
  },
  mounted() {
    this.load()
  },
  methods: {
    statusTagType(s) {
      if (s === 'sent') return 'success'
      if (s === 'failed') return 'danger'
      if (s === 'skipped') return 'info'
      return 'warning'
    },
    formatTime(d) {
      if (!d) return '-'
      const t = new Date(d)
      const pad = (n) => String(n).padStart(2, '0')
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
    },
    async load() {
      this.loading = true
      try {
        const params = {
          page: this.filter.page,
          pageSize: this.filter.pageSize
        }
        if (this.filter.channel) params.channel = this.filter.channel
        if (this.filter.status) params.status = this.filter.status
        const res = await notificationApi.listLogs(params)
        const data = res && res.data ? res.data : res
        this.items = (data && data.items) || []
        this.total = (data && data.total) || 0
      } catch (e) {
        ElMessage.error('加载失败')
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.page-logs {
  padding: 16px;

  &__header {
    margin-bottom: 16px;
    h2 { margin: 0 0 4px; }
  }
  &__desc {
    color: #606266;
    font-size: 14px;
    margin: 0;
  }
  &__toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  &__notif-title {
    font-weight: 500;
    color: #303133;
  }
  &__error {
    color: #f56c6c;
    font-family: monospace;
    font-size: 12px;
  }
  &__muted {
    color: #909399;
  }
  &__pager {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>