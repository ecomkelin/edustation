'use strict'

const { body, param } = require('express-validator')

/**
 * POST /agent/chat 校验
 */
const chat = [
  body('messages').isArray({ min: 1 }).withMessage('messages 必须是非空数组'),
  body('messages.*.role')
    .isIn(['system', 'user', 'assistant'])
    .withMessage('messages[].role 必须是 system/user/assistant'),
  body('messages.*.content').isString().isLength({ min: 1, max: 32_000 }),
  body('systemPrompt').optional().isString().isLength({ max: 8_000 }),
  body('knowledgeContext').optional().isString().isLength({ max: 16_000 }),
  body('temperature').optional().isFloat({ min: 0, max: 2 }),
  body('maxTokens').optional().isInt({ min: 1, max: 8_000 })
]

/**
 * POST /agent/chat/stream 校验
 * 与 chat 类似, 但允许 attachments 与 tool 角色消息
 */
const chatStream = [
  body('messages').isArray({ min: 1 }).withMessage('messages 必须是非空数组'),
  body('messages.*.role')
    .isIn(['system', 'user', 'assistant', 'tool'])
    .withMessage('messages[].role 必须是 system/user/assistant/tool'),
  body('messages.*.content')
    .optional() // tool 消息 content 可为空字符串
    .isString()
    .isLength({ max: 50_000 }),
  body('messages.*.tool_calls')
    .optional()
    .isArray(),
  body('messages.*.tool_call_id').optional().isString(),
  body('attachments').optional().isArray({ max: 10 }),
  body('attachments.*.fileId').isString().isLength({ min: 1 }),
  body('attachments.*.fileName').optional().isString().isLength({ max: 255 }),
  body('attachments.*.mime').optional().isString().isLength({ max: 100 }),
  body('systemPrompt').optional().isString().isLength({ max: 8_000 }),
  body('temperature').optional().isFloat({ min: 0, max: 2 }),
  body('maxTokens').optional().isInt({ min: 1, max: 8_000 })
]

/**
 * POST /agent/parse-file 校验
 */
const parseFile = [
  body('fileId').isString().isLength({ min: 1 }).withMessage('fileId 必填')
]

/**
 * POST /agent/execute 校验
 */
const execute = [
  body('toolName').isString().isLength({ min: 1, max: 100 }).withMessage('toolName 必填'),
  body('args').optional().isObject(),
  body('confirmed').optional().isBoolean()
]

/* ─── 会话 (conversation) 相关校验 (2026-06) ─────── */

/**
 * POST /agent/conversations
 * Body: { title? }
 */
const createConversation = [
  body('title').optional().isString().isLength({ max: 100 })
]

/**
 * GET /agent/conversations/:id
 */
const getConversation = [param('id').isString().isLength({ min: 1 })]

/**
 * PATCH /agent/conversations/:id
 * Body: { title?, summary?, isArchived?, isPinned? }
 */
const patchConversation = [
  param('id').isString().isLength({ min: 1 }),
  body('title').optional().isString().isLength({ max: 100 }),
  body('summary').optional().isString().isLength({ max: 500 }),
  body('isArchived').optional().isBoolean(),
  body('isPinned').optional().isBoolean()
]

/**
 * DELETE /agent/conversations/:id
 */
const deleteConversation = [param('id').isString().isLength({ min: 1 })]

/**
 * POST /agent/conversations/:id/messages
 * Body: { role, content: blocks[], toolCalls?, toolCallId?, hasError?, errorMessage? }
 */
const addMessage = [
  param('id').isString().isLength({ min: 1 }),
  body('role').isIn(['user', 'assistant', 'tool', 'system']).withMessage('role 必须是 user/assistant/tool/system'),
  body('content').optional().isArray(),
  body('toolCalls').optional(),
  body('toolCallId').optional().isString().isLength({ max: 100 }),
  body('hasError').optional().isBoolean(),
  body('errorMessage').optional().isString().isLength({ max: 2000 })
]

/**
 * POST /agent/chat/stream 与 /agent/execute 增加可选 conversationId
 *  复用 chatStream / execute 的校验, 加上 conversationId 字段
 *
 * 关键: 允许 conversationId 是空字符串 ""
 *  - 前端新会话时 activeConversationId 是 '', 后端 controller 内 !conversationId 判 true 走 lazy create
 *  - 不允许空串会让首条消息直接 400 "Invalid value" (2026-06-18 反馈)
 *  - optional({ values: 'falsy' }) 把 undefined / null / '' 都视为"未传"
 */
const chatStreamWithConv = [
  ...chatStream,
  body('conversationId')
    .optional({ values: 'falsy' })
    .isString()
    .isLength({ min: 1, max: 100 })
]

const executeWithConv = [
  ...execute,
  body('conversationId')
    .optional({ values: 'falsy' })
    .isString()
    .isLength({ min: 1, max: 100 })
]

/* ─── 平台超管: 会话管理校验 (2026-06-18) ─────── */

/**
 * GET /agent/admin/conversations
 * 全部 query 字段可选
 */
const adminListConversations = [
  // (无 body, 不需校验; query 解析后 controller 自行处理)
]

/**
 * GET /agent/admin/conversations/:id
 */
const adminGetConversation = [param('id').isString().isLength({ min: 1 })]

/**
 * POST /agent/admin/conversations/batch-delete (平台超管 · 物理删)
 * Body: { ids: [String, ...] }
 * (2026-06-18) 用户决策: 超管删 = 不可恢复的物理删, 不再提供 batch-restore
 */
const adminBatchDelete = [
  body('ids').isArray({ min: 1, max: 200 }).withMessage('ids 必须是非空数组 (最多 200)'),
  body('ids.*').isString().isLength({ min: 1 })
]

module.exports = {
  chat,
  chatStream,
  chatStreamWithConv,
  parseFile,
  execute,
  executeWithConv,
  createConversation,
  getConversation,
  patchConversation,
  deleteConversation,
  addMessage,
  // 平台超管
  adminListConversations,
  adminGetConversation,
  adminBatchDelete
}