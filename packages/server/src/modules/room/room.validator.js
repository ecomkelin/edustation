'use strict'

const { body } = require('express-validator')

exports.create = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }),
  body('capacity').optional().isInt({ min: 1 }),
  body('location').optional().isString().isLength({ max: 100 }),
  body('description').optional().isString().isLength({ max: 200 })
]

exports.update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('capacity').optional().isInt({ min: 1 }),
  body('location').optional().isString().isLength({ max: 100 }),
  body('description').optional().isString().isLength({ max: 200 }),
  body('isActive').optional().isBoolean()
]
