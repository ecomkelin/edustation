'use strict'

const router = require('express').Router()
const c = require('./org.controller')
const v = require('./org.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const ApiError = require('@utils/ApiError')
const orgPromoRouter = require('@modules/orgPromotion/orgPromotion.routes')

// 平台超管专属
router.use(mws.authenticate)

// 平台超管也可能没切到具体机构（看全机构列表时）。
// requireOrg 对超管是"可选"语义：有 x-org-id 就用，没有就 req.orgId = null。
// 加上 requireOrg 主要是让 controller 能拿到 req.orgId（fileBind 跨租户校验要用）。
router.use(mws.requireOrg)

// 机构推广信息 (OrgPromotion) —— 必须在 platform-admin 门控**之前**挂载
// 否则机构 admin 也会被"仅平台超管"挡住。自身走 org-promotion.* 权限码。
router.use('/:id/promotion', orgPromoRouter)

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
