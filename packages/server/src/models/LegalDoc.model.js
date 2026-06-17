'use strict'

const { Schema, model } = require('mongoose')

/**
 * 机构级法律文档 (LegalDoc)
 *
 * 设计 (2026-06 立项):
 *   - 平台级协议 (用户协议 / 隐私 / 未成年人 / Cookie / 平台 SaaS) 由
 *     `shared/legal/*.md` + frontmatter 版本号承载, 改文件即等同发版,
 *     不进数据库. 见 `utils/legalCatalog.js`.
 *   - 机构级协议 (购买协议 / 退费规则 / 关于本机构 / FAQ / 积分规则 /
 *     分享规则 / 联系方式) 由本模型承载, 机构 admin 在后台可编辑.
 *   - 新增/编辑走"软停旧版 + 创建新版"模式 (service.update 内部 semver bump),
 *     保证 (org, key) 只有一份 isActive=true; 旧版本保留作审计 / 历史快照.
 *   - 不允许物理删除, 只能 isActive=false (UserConsent 还可能指向旧版本,
 *     物理删除会破坏审计链).
 *
 * 字段:
 *   - org: 所属机构, 多租户隔离
 *   - key: 文档类型枚举, 见 KEY_ENUM
 *   - title: 标题 (前端列表 + 同意弹窗显示)
 *   - contentMarkdown: 原文 (后台编辑保存)
 *   - contentHtml: 服务端预编译 HTML (前端 / client 直接渲染, 不再 markdown 解析)
 *   - version: semver, 'x.y.z'; 同步在 UserConsent 留痕
 *   - isActive: 当前生效版; (org, key, isActive=true) partial unique
 *   - isRequired: 是否强制勾选同意 (true 表示 client 触发对应 scope 时必勾)
 *   - requireScope: 'order' = 下单时拦截; 'login' = 首登时拦截; 'none' = 仅展示
 *     业务约定: purchase-agreement / refund-policy → order; 其他默认 none
 *   - updatedBy: 最近一次编辑人, 用于审计 + 操作日志
 *
 * 权限:
 *   - legal.read / legal.write (legal 组, 挂"管理员""教务")
 *   - 家长 / 老师 / 财务 不需要权限码, 公开端点读 isActive=true 即可
 */
const LegalDocSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },

    // 文档类型 (枚举, service 层硬卡)
    key: {
      type: String,
      required: true,
      enum: [
        'purchase-agreement',  // 课程购买协议 (下单必勾)
        'refund-policy',       // 退费规则 (下单必勾)
        'org-about',           // 关于本机构 (展示)
        'org-faq',             // 常见问题 (展示)
        'points-rule',         // 积分规则 (展示)
        'share-rule',          // 分享行为规范 (展示)
        'org-contact'          // 联系方式补充 (展示)
      ]
    },
    title: { type: String, required: true, trim: true, maxlength: 100 },

    // markdown 原文 + 预编译 HTML
    contentMarkdown: { type: String, required: true },
    contentHtml: { type: String, default: '' },

    // 语义化版本号 (x.y.z); update 时 patch 段自动递增
    version: { type: String, required: true, default: '1.0.0' },

    // 当前生效版; (org, key, isActive=true) partial unique
    isActive: { type: Boolean, default: true, index: true },

    // 强制勾选同意 (true 表示 client 在对应 scope 触发时必勾)
    isRequired: { type: Boolean, default: false },

    // 拦截作用域: order=下单时; login=首登时; none=仅展示
    requireScope: { type: String, enum: ['order', 'login', 'none'], default: 'none' },

    // 编辑审计
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'legal_docs' }
)

// partial unique: 同一 (org, key) 只能有一份 isActive=true
LegalDocSchema.index(
  { org: 1, key: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
)
// 历史版本查询 (按机构 + key + 时间倒序)
LegalDocSchema.index({ org: 1, key: 1, version: -1 })

module.exports = model('LegalDoc', LegalDocSchema)
