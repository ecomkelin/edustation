'use strict'

/**
 * 站点配置路由 (/api/v1/site-config)
 *
 * 端点:
 *   GET  /                公开 (admin Footer + client 备案 footer 要)
 *   PUT  /                requirePlatformAdmin (仅平台超管可改)
 *
 * 不区分机构; 此为平台级单例.
 */

const router = require('express').Router()
const c = require('./siteConfig.controller')
const v = require('./siteConfig.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// R-3200 GET /site-config
router.get('/', asyncHandler(c.get))

// R-3201 PUT /site-config
router.put(
  '/',
  mws.authenticate,
  mws.requirePlatformAdmin,
  v.update,
  mws.validateRequest,
  asyncHandler(c.update)
)

module.exports = router
