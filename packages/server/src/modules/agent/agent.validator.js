'use strict'

const { body } = require('express-validator')

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

module.exports = { chat, chatStream, parseFile, execute }