'use strict'

const router = require('express').Router()
const c = require('./org.controller')
const v = require('./org.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const ApiError = require('@utils/ApiError')

// 平台超管专属
router.use(mws.authenticate)

router.use((req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!req.user.isPlatformAdmin) return next(ApiError.forbidden('仅平台超管可管理机构'))
  next()
})

router.get('/', asyncHandler(c.list))
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))
router.get('/:id/candidate-principals', v.idParam, mws.validateRequest, asyncHandler(c.candidatePrincipals))
router.post('/', v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 注意：机构不允许物理删除（机构下业务数据太多，物理删除会留下大量悬空引用）。
// 业务上请用 toggle-active 接口做"启用/停用"。
router.post('/:id/toggle-active', v.idParam, v.toggleActive, mws.validateRequest, asyncHandler(c.toggleActive))

module.exports = router
