'use strict'

/**
 * Markdown 编译工具 (基于 marked, 后端统一编译)
 *
 * 用于 Article.contentMarkdown → contentHtml (前端详情页 v-html 直接渲染)
 * 跟 legal/legalCatalog 同 marked 实例.
 *
 * 注意:
 *   - marked 异步 vs 同步: 18.x 默认异步, 但内容是纯静态文本时同步也能用;
 *     这里走同步 parse (不传 async callback)
 *   - 出错时回退到原始 markdown 包 <pre>, 不让 500 挂详情页
 */
const { marked } = require('marked')

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
  mangle: false
})

/**
 * markdown -> html (同步; 出错时降级到 <pre> 原文, 不抛 500).
 *
 * @param {string} md markdown 原文
 * @returns {string} 编译后的 HTML
 */
function compileMarkdownSafe(md) {
  if (!md || typeof md !== 'string') return ''
  try {
    return marked.parse(md)
  } catch (e) {
    // 兜底: <pre> 包原文 (前端详情页仍可见内容)
    return `<pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(md)}</pre>`
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

module.exports = { compileMarkdownSafe }
