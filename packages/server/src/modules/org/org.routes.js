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
router.delete('/:id', v.idParam, asyncHandler(c.remove))
router.post('/:id/toggle-active', v.idParam, v.toggleActive, mws.validateRequest, asyncHandler(c.toggleActive))

module.exports = router
