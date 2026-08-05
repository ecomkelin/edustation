<!--
  NotificationBell.vue - admin 顶栏铃铛红点 + 弹层
  - 数据源 R-4014 GET /notifications/me/staff/unread-count
  - 弹层内嵌精简 InboxList (点开看最近 8 条), 完整列表跳 /notifications/inbox
  - 2026-07-13 新增: 顶部红点改用 staff 接口 (不走家长 /me)
  - 红点轮询: 30s 一次 + 路由切换时主动 reload
  - 2026-07-13 修 [ElOnlyChild] no valid child node found:
    - 旧实现 ElBadge + ElPopover 并列双根, ElPopover 无显式 #reference 时 EP 会把
      上一个 sibling (即 ElBadge) 隐式当 reference. 异步刷新使 slot 短暂为空时
      ElOnlyChild warn (debugWarn 不报错, 但 dev 模式 console 噪音). 修法:
      整体包一层 <div class="bell-wrap">, ElBadge / ElPopover 都明确 root,
      ElPopover 显式 #reference 指向自己的 el-icon, 互不争抢 slot.
-->
<template>
  <div class="bell-wrap-outer">
    <el-badge :value="unreadCount" :hidden="!unreadCount" :max="99" class="bell-wrap">
      <el-icon class="bell-icon" @click="toggle"><Bell /></el-icon>
    </el-badge>

    <el-popover
      v-model:visible="open"
      placement="bottom-end"
      :width="380"
      :show-arrow="false"
      trigger="manual"
      popper-class="bell-popover"
    >
      <template #reference>
        <!-- 占位: ElPopover 的 reference 必须是有效 single node.
             ElBadge 已经在外面 render 了这颗 el-icon, 这里再放一个不可见的 placeholder
             让 ElOnlyChild 校验过. 视觉上没有 2 个铃铛 (第一个 absolute 占视觉). -->
        <span class="bell-popover-anchor" aria-hidden="true"></span>
      </template>
      <div class="bell-panel" v-loading="loading">
        <div class="bell-panel__head">
          <span class="bell-panel__title">通知</span>
          <el-button v-if="unreadCount" link size="small" @click="markAllRead">全部已读</el-button>
        </div>
        <div class="bell-panel__list">
          <div v-if="!items.length" class="bell-panel__empty">暂无未读消息</div>
          <div
            v-for="row in items"
            :key="row._id"
            class="bell-panel__item"
            :class="{ 'is-unread': row.status === 'unread' }"
            @click="onItem(row)"
          >
            <div class="bell-panel__item-title">{{ row.title }}</div>
            <div class="bell-panel__item-body">{{ row.body }}</div>
            <div class="bell-panel__item-meta">
              <span>{{ typeLabels[row.type] || row.type }}</span>
              <span>{{ formatTime(row.createdAt) }}</span>
            </div>
          </div>
        </div>
        <div class="bell-panel__foot">
          <el-button link size="small" type="primary" @click="goInbox">查看全部</el-button>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script>
import { Bell } from '@element-plus/icons-vue'
import { notificationApi } from '@/api/notification'

const TYPE_LABELS = {
  task_assigned: '任务分配',
  task_rejected: '任务打回',
  task_approved: '任务通过',
  task_cancelled: '任务取消',
  task_due: '任务到期',
  lesson_preparing: '排课准备',
  lesson_prepare_reminder: '上课通知',
  order_paid: '订单已付',
  order_refunded: '订单退款',
  evaluation_published: '课评发布',
  system_notice: '系统通知'
}

export default {
  name: 'NotificationBell',
  components: { Bell },
  data() {
    return {
      open: false,
      loading: false,
      unreadCount: 0,
      items: [],
      timer: null,
      unAfterEachHook: null,
      typeLabels: TYPE_LABELS
    }
  },
  mounted() {
    this.reload()
    // 2026-07-13: 30s 轮询红点; 路由切换时再 reload 一次
    this.timer = setInterval(this.reload, 30000)
    // 2026-08-05: afterEach 返回清理函数, beforeUnmount 必须调 — 否则登出跳 /login 后
    //   泄漏的回调仍会触发 reload → 401 → refresh 死循环.
    if (this.$router && this.$router.afterEach) {
      this.unAfterEachHook = this.$router.afterEach(() => {
        this.reload()
      })
    }
  },
  beforeUnmount() {
    if (this.timer) clearInterval(this.timer)
    // 2026-08-05: 清理 afterEach 钩子 (Vue Router 4 不会随组件 unmount 自动清)
    if (this.unAfterEachHook) {
      try { this.unAfterEachHook() } catch (_) { /* ignore */ }
      this.unAfterEachHook = null
    }
  },
  methods: {
    async reload() {
      // 2026-08-05: 未认证直接停轮询 (登出后 accessToken 已清)
      //   http 拦截器会对未认证请求 reject 'UNAUTHENTICATED', 这里检测到就停 timer
      //   避免 30s 空转 + afterEach 触发的无效 reload.
      const { useAuthStore } = await import('@/stores/auth')
      if (!useAuthStore().accessToken) {
        if (this.timer) { clearInterval(this.timer); this.timer = null }
        return
      }
      try {
        const r = await notificationApi.staffUnreadCount()
        this.unreadCount = r.data?.count || 0
      } catch (e) {
        // 静默 (401 已由 http 拦截器处理; UNAUTHENTICATED 是登出后正常态)
      }
    },
    async toggle() {
      this.open = !this.open
      if (this.open) await this.loadPanel()
    },
    async loadPanel() {
      this.loading = true
      try {
        const r = await notificationApi.staffList({ page: 1, pageSize: 8, status: 'unread' })
        this.items = r.data?.items || []
      } finally {
        this.loading = false
      }
    },
    async onItem(row) {
      if (row.status === 'unread') {
        try {
          await notificationApi.markRead(row._id)
          this.unreadCount = Math.max(0, this.unreadCount - 1)
          row.status = 'read'
        } catch (e) {
          // 静默
        }
      }
      const link = row.payload && row.payload.deeplink
      if (link) {
        this.open = false
        this.$router.push(link)
      }
    },
    async markAllRead() {
      await notificationApi.staffMarkAllRead()
      this.unreadCount = 0
      this.items = []
      this.$message.success('已全部标为已读')
    },
    goInbox() {
      this.open = false
      this.$router.push('/notifications/inbox')
    },
    formatTime(d) {
      if (!d) return ''
      const dt = new Date(d)
      const now = new Date()
      const sameDay = dt.toDateString() === now.toDateString()
      if (sameDay) {
        return dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }
      return `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    }
  }
}
</script>

<style>
.bell-wrap-outer {
  display: inline-flex;
  align-items: center;
  position: relative;
}
.bell-wrap { display: inline-flex; }
/* ElPopover 的 reference slot 占位; 视觉无, 仅供 ElOnlyChild 校验有合法子节点 */
.bell-popover-anchor {
  position: absolute;
  inset: 0;
  width: 1px;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}
.bell-icon {
  font-size: 20px;
  color: #fff;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.15s;
}
.bell-icon:hover { background: rgba(255, 255, 255, 0.1); }

.bell-popover { padding: 0 !important; }
.bell-panel { width: 100%; }
.bell-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #ebeef5;
}
.bell-panel__title { font-weight: 600; }
.bell-panel__list {
  max-height: 380px;
  overflow-y: auto;
}
.bell-panel__empty {
  text-align: center;
  color: #c0c4cc;
  padding: 36px 0;
  font-size: 13px;
}
.bell-panel__item {
  padding: 10px 14px;
  border-bottom: 1px solid #f5f7fa;
  cursor: pointer;
  transition: background 0.15s;
}
.bell-panel__item:hover { background: #f5f7fa; }
.bell-panel__item.is-unread { background: #ecf5ff; }
.bell-panel__item-title {
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 2px;
}
.bell-panel__item-body {
  color: #606266;
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}
.bell-panel__item-meta {
  display: flex;
  justify-content: space-between;
  color: #909399;
  font-size: 11px;
}
.bell-panel__foot {
  padding: 8px 14px;
  border-top: 1px solid #ebeef5;
  text-align: right;
}
</style>