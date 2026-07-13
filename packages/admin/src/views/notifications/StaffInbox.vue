<!--
  StaffInbox.vue (admin 端) - 员工收件箱
  - 数据源 R-4013 ~ R-4016: /api/v1/notifications/me/staff/*
  - 2026-07-13 新增: 与 R-4002~R-4007 家长 /me 平行
  - 列表 / 红点 / 一键已读 / 一键归档 / 单条已读+跳转 deeplink
  - 顶部「全部 / 未读 / 已归档」三态切换
-->
<template>
  <div class="page-inbox">
    <div class="page-inbox__header">
      <h2>我的通知</h2>
      <p class="page-inbox__desc">
        任务分配、审批打回、排课准备等员工侧消息。所有通知默认存留 90 天。
      </p>
    </div>

    <div class="page-inbox__toolbar">
      <el-radio-group v-model="filter.tab" @change="load">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="unread">未读 ({{ unreadCount }})</el-radio-button>
        <el-radio-button value="archived">已归档</el-radio-button>
      </el-radio-group>
      <div class="page-inbox__toolbar-right">
        <el-button v-if="filter.tab === 'unread'" :disabled="!unreadCount" @click="markAllRead">全部标为已读</el-button>
        <el-button v-if="filter.tab !== 'archived'" @click="archiveAll">归档全部</el-button>
        <el-button @click="load">刷新</el-button>
      </div>
    </div>

    <div v-loading="loading" class="page-inbox__list">
      <div v-if="!items.length" class="page-inbox__empty">
        {{ filter.tab === 'unread' ? '没有未读消息' : filter.tab === 'archived' ? '没有归档消息' : '收件箱空空如也' }}
      </div>
      <div
        v-for="row in items"
        :key="row._id"
        class="page-inbox__item"
        :class="{ 'is-unread': row.status === 'unread', 'is-archived': row.archivedAt }"
        @click="onItem(row)"
      >
        <div class="page-inbox__item-head">
          <span class="page-inbox__item-title">{{ row.title }}</span>
          <el-tag v-if="row.status === 'unread'" size="small" type="danger" effect="dark">未读</el-tag>
          <el-tag v-else-if="row.status === 'read'" size="small" type="info">已读</el-tag>
          <span class="page-inbox__item-time">{{ formatTime(row.createdAt) }}</span>
        </div>
        <div class="page-inbox__item-body">{{ row.body }}</div>
        <div class="page-inbox__item-foot">
          <el-tag size="small" effect="plain">{{ typeLabels[row.type] || row.type }}</el-tag>
          <el-button
            v-if="row.payload && row.payload.deeplink"
            size="small"
            type="primary"
            link
            @click.stop="go(row)"
          >
            前往查看
          </el-button>
        </div>
      </div>
    </div>

    <div class="page-inbox__pager">
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

// 2026-07-13: type 友好标签, 与 InboxList.vue (C 端) 对齐
const TYPE_LABELS = {
  task_assigned: '任务分配',
  task_rejected: '任务打回',
  task_approved: '任务通过',
  task_cancelled: '任务取消',
  task_due: '任务到期',
  lesson_preparing: '排课准备',
  lesson_prepare_reminder: '上课通知',
  lesson_remind_24h: '上课提醒',
  order_paid: '订单已付',
  order_refunded: '订单退款',
  evaluation_published: '课评发布',
  point_grant: '积分到账',
  pet_critical: '宠物异常',
  access_stranger: '陌生人告警',
  system_notice: '系统通知'
}

export default {
  name: 'StaffInbox',
  data() {
    return {
      filter: {
        tab: 'all',
        page: 1,
        pageSize: 20
      },
      items: [],
      total: 0,
      loading: false,
      unreadCount: 0,
      typeLabels: TYPE_LABELS
    }
  },
  watch: {
    '$route.query.tab': {
      immediate: true,
      handler(v) {
        if (v === 'unread' || v === 'archived') this.filter.tab = v
      }
    }
  },
  mounted() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const params = {
          page: this.filter.page,
          pageSize: this.filter.pageSize
        }
        if (this.filter.tab === 'unread') params.status = 'unread'
        if (this.filter.tab === 'archived') params.archived = 'true'
        const r = await notificationApi.staffList(params)
        this.items = r.data?.items || []
        this.total = r.data?.total || 0
        await this.loadUnreadCount()
      } finally {
        this.loading = false
      }
    },
    async loadUnreadCount() {
      try {
        const r = await notificationApi.staffUnreadCount()
        this.unreadCount = r.data?.count || 0
      } catch (e) {
        // 静默失败, 不阻塞列表
      }
    },
    async onItem(row) {
      if (row.status === 'unread') {
        try {
          await notificationApi.markRead(row._id)
          row.status = 'read'
          this.unreadCount = Math.max(0, this.unreadCount - 1)
        } catch (e) {
          // 静默
        }
      }
      this.go(row)
    },
    go(row) {
      const link = row.payload && row.payload.deeplink
      if (link) this.$router.push(link)
    },
    async markAllRead() {
      await notificationApi.staffMarkAllRead()
      ElMessage.success('已全部标为已读')
      await this.load()
    },
    async archiveAll() {
      await notificationApi.staffArchiveAll()
      ElMessage.success('已全部归档')
      await this.load()
    },
    formatTime(d) {
      if (!d) return ''
      const dt = new Date(d)
      const now = new Date()
      const sameDay = dt.toDateString() === now.toDateString()
      if (sameDay) {
        return dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }
      return `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
    }
  }
}
</script>

<style scoped>
.page-inbox { padding: 16px; }
.page-inbox__header h2 { margin: 0 0 4px; }
.page-inbox__desc { color: #909399; font-size: 13px; margin: 0 0 16px; }
.page-inbox__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
.page-inbox__toolbar-right { display: flex; gap: 8px; }
.page-inbox__list {
  background: #fff;
  border-radius: 6px;
  padding: 8px;
  min-height: 240px;
}
.page-inbox__empty {
  text-align: center;
  color: #c0c4cc;
  padding: 60px 0;
  font-size: 14px;
}
.page-inbox__item {
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
  cursor: pointer;
  transition: background 0.15s;
}
.page-inbox__item:last-child { border-bottom: none; }
.page-inbox__item:hover { background: #f5f7fa; }
.page-inbox__item.is-unread { background: #ecf5ff; }
.page-inbox__item.is-unread:hover { background: #d9ecff; }
.page-inbox__item.is-archived { color: #909399; background: #fafafa; }
.page-inbox__item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.page-inbox__item-title { font-weight: 500; flex: 1; }
.page-inbox__item-time { color: #909399; font-size: 12px; }
.page-inbox__item-body {
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
.page-inbox__item-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-inbox__pager {
  margin-top: 12px;
  text-align: right;
}
</style>