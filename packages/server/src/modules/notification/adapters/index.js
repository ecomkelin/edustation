'use strict'

/**
 * 渠道适配器索引（v0.9 MVP）
 *
 * 按 channel 名导出 adapter 实例。
 * Phase 2+ 接入新渠道时在此处 require + 注册。
 */

const inbox = require('./inbox.adapter')
// Phase 2 启用：
// const wechatMini = require('./wechatMini.adapter')
// Phase 3 启用：
// const sms = require('./sms.adapter')
// const wechatPublic = require('./wechatPublic.adapter')
// Phase 4 启用：
// const push = require('./push.adapter')
// const websocket = require('./websocket.adapter')

module.exports = {
  inbox
  // ,
  // wechatMini,
  // sms,
  // wechatPublic,
  // push,
  // websocket
}