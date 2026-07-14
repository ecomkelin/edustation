'use strict'

const { body } = require('express-validator')

const update = [
  body('systemPrompt').optional().isString().isLength({ max: 16_000 }),
  body('temperature').optional().isFloat({ min: 0, max: 2 }),
  body('maxTokens').optional().isInt({ min: 256, max: 8000 })
]

module.exports = { update }