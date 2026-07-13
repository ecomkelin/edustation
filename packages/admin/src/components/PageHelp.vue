<template>
  <!--
    页面说明 hover-tooltip 组件 (2026-07-13)

    用途: 取代页面顶部平铺的 <el-alert>, 默认折叠仅显示 ⓘ icon,
          hover 时弹出完整说明气泡.

    用法:
      <h2>游离用户<PageHelp>不属于任何机构的账号…</PageHelp></h2>
      <h2>站点配置<PageHelp title="页面说明">
        <strong>权限</strong>: 仅平台超管可改
      </PageHelp></h2>

    关键: body 用 default slot 接收 (而非 prop), 因为 body 内常有
          `<br />` `<code>` `<strong>` 等子节点 + 中文双引号,
          走 attribute 会被 HTML parser 拒 (U+0022 等限制).

    Props:
      - title:   气泡内粗体标题 (默认"页面说明")
      - maxWidth: 气泡内文最大宽度 px (默认 360)
  -->
  <el-tooltip
    placement="top-start"
    raw-content
    :show-after="0"
    effect="light"
    v-bind="$attrs"
  >
    <template #content>
      <div :style="contentStyle">
        <b>{{ title }}</b><br />
        <slot />
      </div>
    </template>
    <el-icon class="page-help-icon"><InfoFilled /></el-icon>
  </el-tooltip>
</template>

<script>
export default {
  name: 'PageHelp',
  inheritAttrs: false,
  props: {
    title: { type: String, default: '页面说明' },
    maxWidth: { type: Number, default: 360 }
  },
  computed: {
    contentStyle() {
      return { maxWidth: `${this.maxWidth}px`, lineHeight: 1.6 }
    }
  }
}
</script>

<style scoped>
.page-help-icon {
  margin-left: 8px;
  cursor: pointer;
  color: #909399;
  font-size: 16px;
  vertical-align: middle;
  transition: color 0.15s;
}
.page-help-icon:hover { color: #409eff; }
</style>
