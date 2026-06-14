'use strict'

const { body } = require('express-validator')

exports.create = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('名称 1-50 字'),
  body('category').optional({ nullable: true }).isMongoId().withMessage('category 需为合法 id'),
  body('objectives').optional().isArray().withMessage('objectives 需为数组'),
  body('objectives.*').optional().isString().isLength({ max: 200 }),
  body('posterFileId').optional({ nullable: true }).isMongoId().withMessage('posterFileId 需为合法 id'),
  body('description').optional({ nullable: true }).isString(),
  body('videoFileId').optional({ nullable: true }).isMongoId().withMessage('videoFileId 需为合法 id')
]

exports.update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('category').optional({ nullable: true }).isMongoId().withMessage('category 需为合法 id'),
  body('objectives').optional().isArray(),
  body('objectives.*').optional().isString().isLength({ max: 200 }),
  body('posterFileId').optional({ nullable: true }).isMongoId().withMessage('posterFileId 需为合法 id'),
  body('description').optional({ nullable: true }).isString(),
  body('videoFileId').optional({ nullable: true }).isMongoId().withMessage('videoFileId 需为合法 id')
]

const sync = [
  body('sourceOrgId').isMongoId().withMessage('源机构 id 不合法'),
  body('subjectIds').isArray({ min: 1, max: 200 }).withMessage('subjectIds 必填，1-200 个'),
  body('subjectIds.*').isMongoId().withMessage('subjectIds 含非法 id')
]

module.exports = { create: exports.create, update: exports.update, sync }
