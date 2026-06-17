'use strict'

/**
 * 平台级协议清单 (唯一权威源)
 *
 * 设计:
 *   - 5 份协议: 用户协议 / 隐私政策 / 未成年人 / Cookie / 平台 SaaS
 *   - 每份对应一个 .md 文件, frontmatter 含 version / effectiveAt / required / title
 *   - 此清单 vs 文件实际存在: 启动时 legalCatalog.load 以本清单为准, 文件缺失则 throw
 *   - 文件存在但没在清单: 静默忽略 (废弃版本可保留 .md 但不在清单中)
 *
 * required=true 表示首登时强制接受 (登录响应里出现在 pendingConsents 中);
 * required=false 表示仅供展示 (例如平台 SaaS 协议是机构 ↔ 平台之间的, 家长无需同意).
 */
module.exports = [
  { key: 'user-agreement', file: 'user-agreement.md', required: true },
  { key: 'privacy-policy', file: 'privacy-policy.md', required: true },
  { key: 'minor-info', file: 'minor-info.md', required: true },
  { key: 'cookie-policy', file: 'cookie-policy.md', required: true },
  { key: 'platform-saas-agreement', file: 'platform-saas-agreement.md', required: false }
]
