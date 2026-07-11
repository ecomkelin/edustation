'use strict'

/**
 * Inbox 渠道适配器（v0.9 MVP）
 *
 * 设计要点：
 * 1. **Inbox 必到**：所有 publish 已经在 Notification.create 时落库；
 *    inbox adapter.send 是 no-op，仅返 sent（document 已创建）
 * 2. **永远 available**：无需能力检测
 * 3. **与 channels[] 一致**：publish 时已经写了 inbox 那一行 status=pending，
 *    dispatchAll 会把它更新为 sent（带 sentAt 时间戳），便于审计
 *
 * 后续 Phase 2+ 渠道适配器按此接口补：
 *   - wechatMini：调微信 subscribeMessage.send API
 *   - sms：阿里云 / 腾讯云短信网关
 *   - push：UniPush / Getui / JPush
 *   - websocket：WebSocket 长连接推送
 */

module.exports = {
  type: 'inbox',
  // inbox 永远可达（必到）
  isAvailable(/* recipient */) {
    return true
  },
  // inbox 的"发送"就是 doc 已创建；这里只返 sent 占位
  async send(notification /* , recipient, template, vars */) {
    return { externalId: String(notification._id) }
  }
}