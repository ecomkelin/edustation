'use strict'

const router = require('express').Router()
const c = require('./category.controller')
const v = require('./category.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const ApiError = require('@utils/ApiError')

// 平台超管专属
router.use(mws.authenticate)

router.use((req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!req.user.isPlatformAdmin) return next(ApiError.forbidden('仅平台超管可访问字典库'))
  next()
})

router.get('/', asyncHandler(c.list))
router.get('/tree', asyncHandler(c.tree))
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))
router.get('/:id/removable-check', v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))
router.post('/', v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除(「误操」场景):此模块整个 router 已是 requirePlatformAdmin 包裹,
// 这里再叠加 requirePlatformPassword 做密码二次确认。service 已校验
// 「子级为 0 + Org 引用为 0」才能删。
router.delete('/:id', v.idParam, mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
