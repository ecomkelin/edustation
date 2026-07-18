<!--
  Detail.vue (admin 端) - 员工通知详情页
  - 数据源: R-4019 GET /api/v1/notifications/:id
  - 2026-07-18 新增: 之前 StaffInbox.onItem 直接跳 deeplink, 没给用户看完整 body 的机会
  - 与 C 端 detail 平行; markRead 在 onMounted 触发, deeplink 在 footer 按钮显式触发
  - 路由: /notifications/inbox/:id
-->
<template>
  <div v-loading="loading" class="page-notif-detail">
    <div v-if="!item && !loading" class="page-notif-detail__empty">
      <el-empty description="消息不存在或已被删除" />
    </div>

    <template v-else-if="item">
      <el-page-header :icon="ArrowLeft" content="返回收件箱" @back="onBack" class="page-notif-detail__header" />

      <el-card shadow="never" class="page-notif-detail__hero">
        <div class="page-notif-detail__hero-row">
          <span class="page-notif-detail__emoji">{{ iconOf(item.type) }}</span>
          <div class="page-notif-detail__hero-meta">
            <el-tag size="small" effect="plain">{{ typeLabels[item.type] || item.type }}</el-tag>
            <el-tag v-if="item.archivedAt" size="small" type="info">已归档</el-tag>
            <el-tag v-else-if="item.status === 'unread'" size="small" type="danger">未读</el-tag>
            <el-tag v-else-if="item.status === 'read'" size="small">已读</el-tag>
          </div>
        </div>
        <h2 class="page-notif-detail__title">{{ item.title || item.type }}</h2>
      </el-card>

      <el-card shadow="never" class="page-notif-detail__body-card">
        <pre class="page-notif-detail__body">{{ item.body }}</pre>
      </el-card>

      <el-card shadow="never" class="page-notif-detail__meta-card">
        <template #header><span>📋 元信息</span></template>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="接收时间">{{ formatDateTime(item.createdAt) }}</el-descriptions-item>
          <el-descriptions-item v-if="item.readAt" label="阅读时间">{{ formatDateTime(item.readAt) }}</el-descriptions-item>
          <el-descriptions-item v-if="item.archivedAt" label="归档时间">{{ formatDateTime(item.archivedAt) }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabels[item.type] || item.type }} ({{ item.type }})</el-descriptions-item>
          <el-descriptions-item label="分类">{{ item.category }}</el-descriptions-item>
          <el-descriptions-item v-if="item.payload && item.payload.entityType" label="关联业务">
            {{ item.payload.entityType }}
          </el-descriptions-item>
          <el-descriptions-item v-if="item.payload && item.payload.deeplink" label="跳转链接">
            <code>{{ item.payload.deeplink }}</code>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card v-if="channels.length" shadow="never" class="page-notif-detail__channels-card">
        <template #header><span>📡 发送渠道</span></template>
        <el-table :data="channels" size="small" border>
          <el-table-column prop="channel" label="渠道">
            <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="channelTagType(row)" size="small">{{ channelStatusLabel(row) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sentAt" label="时间" width="180">
            <template #default="{ row }">{{ formatDateTime(row.sentAt) }}</template>
          </el-table-column>
          <el-table-column prop="error" label="错误">
            <template #default="{ row }">{{ row.error || '—' }}</template>
          </el-table-column>
        </el-table>
      </el-card>

      <div class="page-notif-detail__footer">
        <el-button v-if="!item.archivedAt" type="danger" plain @click="onDelete">删除</el-button>
        <el-button @click="onBack">返回</el-button>
        <el-button
          v-if="item.payload && item.payload.deeplink"
          type="primary"
          @click="onGoDeeplink"
        >
          前往查看 →
        </el-button>
      </div>
    </template>
  </div>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { notificationApi } from '@/api/notification'

// 与 StaffInbox.typeLabels 对齐 + 扩展
const TYPE_LABELS = {
  task_assigned: '任务分配',
  task_rejected: '任务打回',
  task_approved: '任务通过',
  task_cancelled: '任务取消',
  task_due: '任务到期',
  task_comment: '任务评论',
  lesson_preparing: '排课准备',
  lesson_prepare_reminder: '上课通知',
  lesson_remind_24h: '上课提醒',
  lesson_remind_1h: '课前 1h 提醒',
  lesson_absent: '缺勤',
  order_paid: '订单已付',
  order_refunded: '订单退款',
  evaluation_published: '课评发布',
  point_grant: '积分到账',
  point_deduct: '积分扣减',
  pet_critical: '宠物异常',
  access_stranger: '陌生人告警',
  system_notice: '系统通知'
}

const TYPE_ICON = {
  task_assigned: '📋',
  task_rejected: '↩️',
  task_approved: '✅',
  task_cancelled: '🚫',
  task_due: '📝',
  task_comment: '💬',
  lesson_preparing: '🎒',
  lesson_prepare_reminder: '📚',
  lesson_remind_24h: '📅',
  lesson_remind_1h: '⏰',
  lesson_absent: '⚠️',
  order_paid: '💰',
  order_refunded: '↩️',
  evaluation_published: '⭐',
  point_grant: '🎁',
  point_deduct: '💸',
  pet_critical: '🐾',
  access_stranger: '🚨',
  system_notice: '📢'
}

const CHANNEL_LABELS = {
  inbox: '站内',
  wechatMini: '微信小程序',
  wechatPublic: '微信公众号',
  sms: '短信',
  push: 'App 推送',
  websocket: '实时'
}

const CHANNEL_STATUS_LABELS = {
  pending: '发送中',
  sent: '已送达',
  failed: '失败',
  skipped: '已跳过'
}

const CHANNEL_REASON_LABELS = {
  opted_out: '已关闭',
  no_capability: '未开通',
  rate_limited: '频率受限',
  invalid_target: '目标无效',
  no_adapter: '无适配器'
}

export default {
  name: 'NotificationDetail',
  data() {
    return {
      ArrowLeft,
      typeLabels: TYPE_LABELS,
      loading: true,
      item: null
    }
  },
  computed: {
    channels() {
      return (this.item && this.item.channels) || []
    }
  },
  mounted() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const r = await notificationApi.detail(this.$route.params.id)
        this.item = r.data || null
        // 2026-07-18: 进入详情页自动 markRead (若 unread)
        if (this.item && this.item.status === 'unread') {
          try {
            await notificationApi.markRead(this.item._id)
            this.item.status = 'read'
            this.item.readAt = new Date().toISOString()
          } catch (e) {
            // 静默
          }
        }
      } catch (e) {
        this.item = null
      } finally {
        this.loading = false
      }
    },
    iconOf(type) {
      return TYPE_ICON[type] || '🔔'
    },
    channelLabel(ch) {
      return CHANNEL_LABELS[ch] || ch
    },
    channelStatusLabel(ch) {
      if (ch.reason && CHANNEL_REASON_LABELS[ch.reason]) {
        return `${CHANNEL_STATUS_LABELS[ch.status] || ch.status} · ${CHANNEL_REASON_LABELS[ch.reason]}`
      }
      return CHANNEL_STATUS_LABELS[ch.status] || ch.status
    },
    channelTagType(ch) {
      if (ch.status === 'sent') return 'success'
      if (ch.status === 'pending') return 'warning'
      if (ch.status === 'failed') return 'danger'
      return 'info'
    },
    formatDateTime(d) {
      if (!d) return '—'
      const t = new Date(d)
      const pad = (n) => String(n).padStart(2, '0')
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
    },
    onBack() {
      this.$router.push('/notifications/inbox')
    },
    onGoDeeplink() {
      const dl = this.item && this.item.payload && this.item.payload.deeplink
      if (dl) this.$router.push(dl)
    },
    async onDelete() {
      try {
        await ElMessageBox.confirm(
          '确定要删除这条消息吗？删除后将不再显示。',
          '删除消息',
          { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
        )
      } catch {
        return
      }
      try {
        await notificationApi.archive(this.item._id)
        ElMessage.success('已删除')
        this.onBack()
      } catch (e) {
        ElMessage.error('删除失败')
      }
    }
  }
}
</script>

<style scoped>
.page-notif-detail {
  padding: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.page-notif-detail__header { margin-bottom: 16px; }
.page-notif-detail__hero { margin-bottom: 12px; }
.page-notif-detail__hero-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.page-notif-detail__emoji { font-size: 36px; }
.page-notif-detail__hero-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.page-notif-detail__title {
  font-size: 22px;
  font-weight: 600;
  margin: 0;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.page-notif-detail__body-card { margin-bottom: 12px; }
.page-notif-detail__body {
  font-size: 15px;
  line-height: 1.7;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: inherit;
}
.page-notif-detail__meta-card,
.page-notif-detail__channels-card { margin-bottom: 12px; }
.page-notif-detail__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 0 24px;
  border-top: 1px solid #ebeef5;
  margin-top: 16px;
}
</style>
