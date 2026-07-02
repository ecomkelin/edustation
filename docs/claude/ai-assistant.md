# AI 智能客服 / 助手会话

> **何时读这个文件**：改 AI 助手、RAG、智能问答、Agent 会话持久化、平台层 AI 管理、家长端"消息 tab"、systemPrompt 注入、平台客服 (support-mode) 永久会话机制时读。
> **一行摘要**：SSE 流式 LLM chat + tool use + AgentConversation/AgentMessage 会话持久化 + 软删/置顶/30 上限 + 平台超管后台 + **2026-07-02 新增"平台客服"永久会话 (R-2830/31/32)**。

---

## 端点速查 (R-2800 ~ R-2832)

完整路由表见 [routes-server.md §MM=28](routes-server.md#mm28-agent-url-agent)。关键:
- R-2803 `POST /agent/chat/stream` — SSE 流式 chat (普通会话)
- **R-2830 `POST /agent/chat/support` — SSE 流式 (平台客服永久会话, 2026-07-02 立项)**
- **R-2831 `POST /agent/chat/support/reset` — 清空客服会话**
- **R-2832 `GET  /agent/chat/support/history` — 客服会话历史**

详细架构 / 软删 / 30 上限 / 平台超管后台, 见 [memory: ai-conv-softdelete-admin](~/.claude/projects/.../memory/ai-conv-softdelete-admin.md)。

## 目标

基于机构私有知识（科目、老师、学校）的智能问答 + 平台客服永久会话。

## 技术栈

- **LLM**: Anthropic / OpenAI 兼容接口
- **集成位置**：`packages/server/src/modules/agent/`
- **核心接口**：`POST /api/v1/agent/chat/stream` (SSE 流式) + **`POST /api/v1/agent/chat/support`** (R-2830 平台客服)

## 数据同步 (RAG 知识库)

业务数据（Subject, User, Org）变更时自动更新向量库。

## 会话持久化 (2026-06-18 落地)

详见 [memory: ai-conversation-persistence] / [memory: ai-conv-softdelete-admin] / [memory: ai-conv-empty-validator-bug] / [memory: ai-conversation-persistence]。

### 数据模型

**AgentConversation** ([packages/server/src/models/AgentConversation.model.js](packages/server/src/models/AgentConversation.model.js)):
- `org` (ObjectId<Org>, required, indexed) — 多租户隔离
- `user` (ObjectId<User>, required, indexed) — 谁拥有这个会话
- `title` / `summary` / `summaryUpdatedAt` / `messageCount` / `userMessageCount` / `toolCallCount`
- `firstMessageAt` / `lastMessageAt` / `lastUserMessageAt`
- `isArchived` / `isPinned` / `isDeleted` (软删) / `deletedBy` ('user' | 'platform')
- `model` / `lastLatencyMs` / `lastUsage` (Mixed)
- **`meta` (Mixed) — 2026-07-02 新增 `supportUser` 标记 + `kind: 'platform-support'`, 用于平台客服永久会话**

**AgentMessage** ([packages/server/src/models/AgentMessage.model.js](packages/server/src/models/AgentMessage.model.js)):
- `org` / `user` (ObjectId)
- `conversation` (ObjectId, indexed)
- `seq` (Number, 会话内自增, unique `{conversation, seq}`)
- `role` ('user' | 'assistant' | 'tool' | 'system')
- `content` (Mixed, blocks 数组 `{type: 'text' | 'file' | 'tool_call' | 'tool_result' | 'error'}`)
- `toolCalls` / `toolCallId` / `businessRefs`
- `hasError` / `errorMessage` / `isDeleted` / `deletedAt`

**索引**: `{ user, org, lastMessageAt: -1 }` / `{ user, org, isArchived, lastMessageAt: -1 }` / `{ conversation, seq }` unique

### 18 端点 (2026-07-02 状态)

- R-2800 ping / R-2801 旧 chat / R-2802 文件解析 / R-2803 **SSE 流式**
- R-2804 高风险工具执行 / R-2806 工具元数据
- R-2810-2815 会话 CRUD (list/create/detail/patch/delete/addMessage)
- R-2820-2822 平台超管后台
- **R-2830-2832 平台客服 (见下)**

### 软删 & 30 上限

- 软删同步 messages (避免孤儿消息)
- 普通用户 30 上限;超管豁免
- 首条 user 消息立改 title (让用户在列表里能识别)
- **support 会话不计入 30 上限** (system 永久)

### 已知 bug

- `conversationId=""` 被 `optional().isLength(min:1)` 挡掉，首条消息 400 "Invalid value" → 改 `optional({values:'falsy'})`；前端新会话按钮加 ElMessage 反馈

---

## 平台客服永久会话 (R-2830/31/32, 2026-07-02 立项)

### 动机

C 端家长在 4 tab 重构后,"消息" tab 顶部有一个 sticky **"AI 客服"** 卡,点进去跟一个"客服助理"对话。
- 不应该是每次点开都新建会话 (用户期望"同一个对话接着说")
- 不能算普通会话 (不能跟其他对话混在"最近对话"列表)
- 也不能被 30 上限卡 (system 永久)

### 设计: meta.supportUser 标记

每个用户在每个 org 下唯一 1 个"客服助理"永久会话,标记方式:

```js
{
  user: <userId>,
  org: <orgId>,
  title: '客服助手',          // 固定
  isPinned: true,             // 永远置顶 (普通会话列表过滤掉后, 这是 strip 出来的)
  meta: {
    supportUser: true,         // ★ 唯一标记
    kind: 'platform-support'
  },
  isDeleted: { $ne: true }
}
```

普通会话 `meta.supportUser` 字段不存在 → `meta.supportUser: { $ne: true }` 过滤掉,实现隔离。

### API 行为

| 端点 | 行为 |
|---|---|
| **R-2830** `POST /agent/chat/support` | 入口处 `findOrCreateSupport({userId, orgId})` (幂等) → 拿 conv → SSE 同 R-2803 但**注入客服 systemPrompt** (家长不可覆盖行为准则) |
| **R-2831** `POST /agent/chat/support/reset` | `AgentMessage.updateMany({conversation: $id}, {isDeleted: true})` + 重置 conv 统计字段;保留 conv 行, 下次点开还是同一个空会话 |
| **R-2832** `GET /agent/chat/support/history` | `findOrCreateSupport` + `AgentMessage.listByConversation(...)`;无 support 会话时返 `{conversation: null, messages: []}` (前端可惰性创建) |

### 与普通会话的差异

| 维度 | 普通会话 (R-2803) | 客服会话 (R-2830) |
|---|---|---|
| 解析 | `getOrCreate` (按 conversationId 拿/建) | `findOrCreateSupport` (按 meta.supportUser 拿/建) |
| 上限 | 30 个 (非超管) | **无上限** (system 永久) |
| 列表 | `meta.supportUser: {$ne: true}` 默认包含 | 默认**排除** (家长通过"消息 tab"专门入口访问) |
| 置顶 | 用户手动 isPinned | 永远 isPinned=true (但不出现在普通列表) |
| systemPrompt | 用户传 / 工具默认 | **后端硬编码注入**"客服助理"风格 (家长不可覆盖行为准则; 可覆盖具体问答风格) |
| 删除 | 软删 R-2814 | "新对话" 按钮调 R-2831 只**清消息**, 保留 conv 行 |

### 客服 systemPrompt (硬编码)

`packages/server/src/modules/agent/agent.controller.js#buildSupportSystemPrompt`:

```
你是「<机构名> · 客服助理」，负责回答家长关于课程、孩子学习情况和本校招生信息的问题。
你可以访问该家长在本校的订单、孩子、作品、考勤等数据，**通过 tool use 读取**，**禁止编造**不在工具返回值中的细节。
回答风格：
1. 简洁中文，亲切自然
2. 涉及孩子具体数据时必须引用对应 tool 的返回值
3. 如果家长问的问题超出权限或没有数据，坦率说明并引导其联系教务老师
4. 严禁在回复中透露其他家庭或孩子的信息
5. 不回答与本校业务无关的外部问题（如股市、天气）
```

**反 prompt injection 风险**: 用户的 input 进 LLM,但 systemPrompt 是后端硬编码, 家长无法通过 input 改写; tool 权限由后端按 user.positions 聚合校验。

### 前端调用 (R-2830 wrapper)

[packages/client/src/api/agent.js](packages/client/src/api/agent.js) 的 `supportStream(opts)` wrapper:
- H5 走 `fetch + ReadableStream + TextDecoder` 解析 SSE
- 自动注入 auth / org / active student 头
- 调 `POST /agent/chat/support` body 用 `messages` 数组 (与 R-2803 旧 wrapper 用 `message` 字段不同)
- 事件协议 `event: + data:` (兼容 `{delta, content, done, error}` payload 字段)
- refactor: 抽出 `readSseStream` 通用 helper, chatStream / supportStream 共用 SSE 解析逻辑

### Implementation notes

- `agent.conversation.service.js` 新增 3 函数:
  - `findOrCreateSupport({userId, orgId})` — 拿或建 (幂等, 不计 30 上限)
  - `resetSupport({userId, orgId})` — 清消息 + 重置统计, 保留 conv 行
  - `getSupportHistory({userId, orgId})` — 拉全部 messages
- `list()` 改造: 默认 `filter['meta.supportUser'] = {$ne: true}` (普通列表 strip 掉)
- `agent.controller.js` refactor: 抽出 `runChatStreamSSE(req, res, opts)` 共用 helper, chatStream + support 都调它 (resolveConv + systemPrompt 注入不同)
- `agent.routes.js`: R-2830/31/32 三个新路由, 复用 `mws.authenticate + mws.requireOrg` (无 PERM)

---

## 前端展示

- **C 端 (client)**: "消息 tab" (tab2) 顶部 sticky "AI 客服"卡 → 跳 /pages/tabbar/chat-detail?type=support
- **管理后台**: 可维护知识库 + 查看统计 + 平台层会话管理 UI

## 成本控制

- 缓存高频问题
- 限流
- 远期可迁移至本地大模型（Ollama）

## 实施阶段

- **阶段 3 后期**：搭建基础（RAG + 知识库 + chat 接口）
- **阶段 4**：完成流式交互（SSE）与用户体验优化
- **2026-07-02**: C 端 4 tab 重构,R-2830/31/32 平台客服永久会话上线
