# AI 智能客服 / 助手会话

> **何时读这个文件**：改 AI 助手、RAG、智能问答、Agent 会话持久化、平台层 AI 管理时读。
> **一行摘要**：基于机构私有知识（科目、老师、学校）的智能问答 — RAG 模式 + AgentConversation/AgentMessage 会话持久化。

---

## 目标

基于机构私有知识（科目、老师、学校）的智能问答。

## 技术栈

- **RAG 模式**：向量数据库（Chroma）+ 大模型 API（OpenAI/通义千问）
- **集成位置**：`../packages/server/src/modules/agent/`
- **核心接口**：`POST /api/v1/agent/chat`（初期非流式，后续升级为 SSE 流式）

## 数据同步

业务数据（Subject, User, Org）变更时自动更新向量库。

## 会话持久化（2026-06-18 落地）

详见 [memory: ai-conversation-persistence] / [memory: ai-conv-softdelete-admin-admin] / [memory: ai-conv-empty-validator-bug]。

### 数据模型

- **AgentConversation**：会话元数据（org / user / title / createdAt / updatedAt / deletedAt）
- **AgentMessage**：单条消息（conversation / role / content / createdAt）

### 6 端点

- 创建会话（lazy create on first chatStream）
- 列出当前用户会话
- 获取会话详情（含 messages）
- 软删会话
- 流式 chatStream（SSE）
- 平台层：跨机构会话管理（筛选 / 批量 / 详情抽屉）

### 软删 & 30 上限

- 软删同步 messages（避免孤儿消息）
- 普通用户 30 上限；超管豁免
- 首条 user 消息立改 title（让用户在列表里能识别）

### 已知 bug

- `conversationId=""` 被 `optional().isLength(min:1)` 挡掉，首条消息 400 "Invalid value" → 改 `optional({values:'falsy'})`；前端新会话按钮加 ElMessage 反馈

## 前端展示

- **客户小程序**：内嵌聊天界面
- **管理后台**：可维护知识库 + 查看统计 + 平台层会话管理 UI

## 成本控制

- 缓存高频问题
- 限流
- 远期可迁移至本地大模型（Ollama）

## 实施阶段

- **阶段 3 后期**：搭建基础（RAG + 知识库 + chat 接口）
- **阶段 4**：完成流式交互（SSE）与用户体验优化
