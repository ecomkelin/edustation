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

// 2026-06-23 宠物系统: 平台级饱腹度衰减间隔端点已移除
//   衰减间隔完全由 PetSpecies.hungerDecayMinutes 控制（物种级）
//   旧路由 R-3202/R-3203 (GET/PUT /site-config/pet/hunger-decay-minutes) 已下线

module.exports = router
