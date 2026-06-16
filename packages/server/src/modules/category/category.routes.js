'use strict'

const router = require('express').Router()
const c = require('./category.controller')
const v = require('./category.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const ApiError = require('@utils/ApiError')

// 字典库 (Category) 是**全局共享**的（无 org 字段, 跨机构复用).
// 设计:
//   - GET (list/tree/detail/removable-check): 任何登录用户可调用 (本机构也要用 LeadTag/Channel/Subject 字典)
//   - POST / PUT: 仅平台超管 (统一维护字典, 本机构无自助维护入口)
//   - DELETE: 仅平台超管 + 密码二次确认
//
// 2026-06 修复: 之前 router.use(requirePlatformAdmin) 把所有 GET 也挡了,
// 导致非超管进潜客管理页面 (Parents.vue) 拉 LeadTag/Channel 字典报 2 次 403.
router.use(mws.authenticate)

// 平台超管守卫: 只挂在「写」路由前, 不能用 router.use(...)
// (若用中间件, 会让 GET 也被 403, 复刻 subject/position 的同款坑)
const platformAdminOnly = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!req.user.isPlatformAdmin) return next(ApiError.forbidden('仅平台超管可维护字典库'))
  next()
}

router.get('/', asyncHandler(c.list))
router.get('/tree', asyncHandler(c.tree))
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))
router.get('/:id/removable-check', v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))
router.post('/', platformAdminOnly, v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', v.idParam, platformAdminOnly, v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除(「误操」场景):超管 + 密码二次确认; service 已校验
// 「子级为 0 + Org 引用为 0」才能删。
router.delete('/:id', v.idParam, platformAdminOnly, mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
