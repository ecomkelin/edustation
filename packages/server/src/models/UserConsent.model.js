'use strict'

const { Schema, model } = require('mongoose')

/**
 * 用户同意协议记录 (UserConsent)
 *
 * 设计 (2026-06 立项):
 *   - append-only 集合: 用户每次接受某协议某版本都写一条新记录
 *     绝不 update, 也不允许物理删除 (PIPL 审计强制留痕)
 *   - 同一 (user, docKey, version) 只允许一条记录, 防止重复写入
 *   - 平台级协议 org=null, 在所有机构通用; 机构级 org=ObjectId, 仅本机构内有效
 *
 * 计算"该用户当前是否需要重新同意"的公式 (见 legal.service.computePendingConsents):
 *   平台级 required 清单
 *   ── 减去 ──
 *   该用户 UserConsent 中 docType=platform 按 docKey 取 max(version) 已对齐当前生效版的项
 *   ── 加上 (若传 orgId) ──
 *   该机构 LegalDoc isRequired+requireScope='login' 减去该用户该机构已对齐版本
 *
 * 字段:
 *   - user / org / docKey / docType / version: 4 元定位
 *   - title: 接受时的标题快照, 审计可读 (协议改名也能回放当时叫什么)
 *   - ip / userAgent: 操作来源, 供合规审计
 *   - meta: 扩展 (例如设备指纹 / 来源页面)
 *   - createdAt: 自动写入, immutable
 */
const UserConsentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // 平台级: null; 机构级: 该机构 _id
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null, index: true },

    // 文档 key (与 LegalDoc.key / legalCatalog 中 platform key 一致)
    docKey: { type: String, required: true },
    // 'platform' = shared/legal/*.md; 'org' = LegalDoc collection
    docType: { type: String, required: true, enum: ['platform', 'org'] },

    version: { type: String, required: true },

    // 快照, 协议改名后审计可还原当时标题
    title: { type: String, default: '' },

    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    // ─── 主体扩展 (2026-06 立项, accessControl 模块) ─────────────
    // 用于人脸同意书等 polymorphic 场景 (例: 家长代学员签 face-consent-student)
    // 老数据 subjectType='user', subject=null 维持原语义
    // subjectType ∈ ['user', 'student', 'authorized_pickup', 'staff']
    subjectType: {
      type: String,
      enum: ['user', 'student', 'authorized_pickup', 'staff'],
      default: 'user',
      index: true
    },
    // 主体 ObjectId (user 字段是签署人; subject 是协议所约束的对象, 可能不同)
    subject: {
      type: Schema.Types.ObjectId,
      refPath: 'subjectType',
      default: null,
      index: true
    },

    // 撤回标记 (PIPL 强制留痕: 不物理删 UserConsent, 仅标记撤回)
    withdrawAt: { type: Date, default: null, index: true },
    withdrawBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    withdrawIp: { type: String, default: '' },

    meta: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'user_consents'
  }
)

// (user, docKey, version) 唯一: 同一用户对同一协议同一版本只能同意一次
// partialFilterExpression: 只对未撤回的记录去重 (撤回后可重签新版)
UserConsentSchema.index(
  { user: 1, docKey: 1, version: 1 },
  {
    unique: true,
    partialFilterExpression: { withdrawAt: null }
  }
)
// 查"该用户最近一次同意某协议": user + docKey + createdAt 倒序
UserConsentSchema.index({ user: 1, docKey: 1, createdAt: -1 })
// 查"该主体在哪些协议上签了字": subjectType + subject + docKey
UserConsentSchema.index({ subjectType: 1, subject: 1, docKey: 1, createdAt: -1 })

module.exports = model('UserConsent', UserConsentSchema)
