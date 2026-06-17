<template>
  <div class="markdown-view" v-html="compiled"></div>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * 通用 markdown / HTML 渲染组件.
 *
 * 优先使用 props.html (服务端已编译, 例如 LegalDoc.contentHtml 或 平台协议 frontmatter.html);
 * 否则把 props.markdown 用 marked 编译, 然后 DOMPurify 净化防 XSS.
 *
 * - 协议是机构 admin 自由编辑的, 必须做 sanitize
 * - script / iframe / on* 事件等危险标签由 DOMPurify 默认 profile 过滤
 */
const props = defineProps({
  /** 已编译的 HTML 字符串 (服务端 marked.parse 的结果) */
  html: { type: String, default: '' },
  /** 原始 markdown (前端编辑时实时预览用) */
  markdown: { type: String, default: '' }
})

// marked v12 兼容配置: gfm 表格 / 单行 \n 不转 <br/> (合同条款排版友好)
marked.setOptions({ gfm: true, breaks: false })

const compiled = computed(() => {
  const raw = props.html
    || (props.markdown ? marked.parse(props.markdown) : '')
  // 协议正文允许常见标签 + a/img/table, 不允许 script/iframe/on*
  return DOMPurify.sanitize(raw)
})
</script>

<style scoped>
.markdown-view {
  font-size: 14px;
  line-height: 1.75;
  color: #303133;
}
.markdown-view :deep(h1) {
  font-size: 22px;
  font-weight: 600;
  margin: 24px 0 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #eaecef;
}
.markdown-view :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  margin: 20px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eaecef;
}
.markdown-view :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 16px 0 8px;
}
.markdown-view :deep(p) { margin: 8px 0; }
.markdown-view :deep(ul),
.markdown-view :deep(ol) { padding-left: 24px; margin: 8px 0; }
.markdown-view :deep(li) { margin: 4px 0; }
.markdown-view :deep(strong) { color: #303133; font-weight: 600; }
.markdown-view :deep(code) {
  padding: 2px 6px;
  background: #f5f7fa;
  border-radius: 3px;
  font-size: 13px;
  color: #c7254e;
}
.markdown-view :deep(pre) {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  overflow-x: auto;
}
.markdown-view :deep(pre code) { background: transparent; color: inherit; padding: 0; }
.markdown-view :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid #e4e7ed;
  background: #fafafa;
  color: #606266;
}
.markdown-view :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}
.markdown-view :deep(th),
.markdown-view :deep(td) {
  border: 1px solid #ebeef5;
  padding: 8px 12px;
  text-align: left;
}
.markdown-view :deep(th) { background: #f5f7fa; font-weight: 600; }
.markdown-view :deep(a) { color: #409EFF; text-decoration: none; }
.markdown-view :deep(a:hover) { text-decoration: underline; }
.markdown-view :deep(hr) { border: 0; border-top: 1px solid #ebeef5; margin: 16px 0; }
</style>
