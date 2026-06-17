'use strict'

const { body, param } = require('express-validator')

const KEY_ENUM = [
  'purchase-agreement', 'refund-policy', 'org-about', 'org-faq',
  'points-rule', 'share-rule', 'org-contact'
]

const platformKeyParam = [
  param('key').isString().isLength({ min: 1, max: 64 })
]

const orgIdParam = [
  param('orgId').isMongoId().withMessage('orgId 需为合法 id')
]

const orgKeyParam = [
  param('orgId').isMongoId().withMessage('orgId 需为合法 id'),
  param('key').isIn(KEY_ENUM).withMessage(`key 必须是 ${KEY_ENUM.join('/')}`)
]

const upsertBody = [
  body('title').optional().isString().isLength({ max: 100 }),
  body('contentMarkdown').isString().isLength({ min: 1, max: 200000 }).withMessage('contentMarkdown 必填且 ≤ 200000 字'),
  body('version').optional().matches(/^\d+\.\d+\.\d+$/).withMessage('version 必须是 x.y.z'),
  body('isRequired').optional().isBoolean(),
  body('requireScope').optional().isIn(['order', 'login', 'none'])
]

const recordConsentsBody = [
  body('consents').isArray({ min: 1, max: 20 }).withMessage('consents 必须是 1-20 项的数组'),
  body('consents.*.key').isString().isLength({ min: 1, max: 64 }),
  body('consents.*.type').isIn(['platform', 'org']),
  body('consents.*.version').matches(/^\d+\.\d+\.\d+$/),
  body('consents.*.org').optional({ nullable: true }).isMongoId()
]

module.exports = {
  KEY_ENUM,
  platformKeyParam,
  orgIdParam,
  orgKeyParam,
  upsertBody,
  recordConsentsBody
}
