'use strict'

const { body } = require('express-validator')
const { isValidPermission } = require('@shared/permissions')

const create = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('职位名称 1-50 字'),
  body('permissions').optional().isArray(),
  body('permissions.*').optional().custom((v) => {
    if (!isValidPermission(v)) throw new Error(`权限码 ${v} 不存在`)
    return true
  }),
  body('clientLevel').optional().isInt({ min: 0, max: 99 }).withMessage('clientLevel 必须是 0-99 的整数')
]

const update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('permissions').optional().isArray(),
  body('permissions.*').optional().custom((v) => {
    if (!isValidPermission(v)) throw new Error(`权限码 ${v} 不存在`)
    return true
  }),
  body('clientLevel').optional().isInt({ min: 0, max: 99 }).withMessage('clientLevel 必须是 0-99 的整数')
]

const setPermissions = [
  body('permissions').isArray().withMessage('permissions 必须是数组'),
  body('permissions.*').custom((v) => {
    if (!isValidPermission(v)) throw new Error(`权限码 ${v} 不存在`)
    return true
  })
]

const sync = [
  body('sourceOrgId').isMongoId().withMessage('源机构 id 不合法'),
  body('positionIds').isArray({ min: 1, max: 200 }).withMessage('positionIds 必填，1-200 个'),
  body('positionIds.*').isMongoId().withMessage('positionIds 含非法 id')
]

module.exports = { create, update, setPermissions, sync }
