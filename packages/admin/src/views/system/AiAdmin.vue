<template>
  <div class="ai-admin-page">
    <h2 class="page-title">AI 管理<PageHelp title="AI 管理 · 页面说明" :max-width="420">AI 助手相关的运营/合规/审计工具,仅平台超管可访问。当前包含:<br />· 会话管理 (跨机构/跨用户查询、批量<strong>清理已软删的会话</strong> · 物理删除不可恢复; 未软删的会自动跳过)<br />· 参数设置 (systemPrompt / Temperature / Max tokens 全 SaaS 统一生效, 客户端不可调)<br /><span style="color:#909399">后续会扩展知识库维护、调用统计、异常审计等模块。</span></PageHelp></h2>

    <el-tabs v-model="activeTab" class="ai-admin-tabs">
      <el-tab-pane label="会话管理" name="conversations">
        <AiConversations />
      </el-tab-pane>
      <el-tab-pane label="参数设置" name="params">
        <AgentConfig />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AiConversations from './ai/AiConversations.vue'
import AgentConfig from './ai/AgentConfig.vue'
import PageHelp from '@/components/PageHelp.vue'

const activeTab = ref('conversations')
</script>

<style scoped>
.ai-admin-page { display: flex; flex-direction: column; gap: 8px; }
.page-title { margin: 0; font-size: 18px; font-weight: 600; }
.subtitle { color: #606266; font-size: 13px; line-height: 1.7; margin: 0 0 8px; }
.feature-list { margin: 4px 0; padding-left: 24px; }
.muted { color: #909399; }
.ai-admin-tabs :deep(.el-tabs__content) { padding-top: 8px; }
</style>
