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

module.exports = { chat }
