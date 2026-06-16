'use strict'

const router = require('express').Router()
const c = require('./region.controller')
const v = require('./region.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const ApiError = require('@utils/ApiError')

// 所有路由都要登录;区划数据是跨机构公共字典,但写操作仅平台超管。
// 读端点(list / tree / detail / removable-check)对所有已认证用户放开:
//   - 个人中心"现居地" / 机构管理"地区"等业务表单都要拉 tree,非超管也要用
//   - 左侧菜单 /regions 仍由 requirePlatform 门控,非超管进不去字典管理页
// 写端点(create / update / delete)平台超管专属,见下方逐条 requirePlatformAdmin
router.use(mws.authenticate)

router.get('/', asyncHandler(c.list))
router.get('/tree', asyncHandler(c.tree))
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))
router.get('/:id/removable-check', v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))
router.post('/', mws.requirePlatformAdmin, v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePlatformAdmin, v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除(「误操」场景):平台超管专属,叠加 requirePlatformPassword 做密码二次确认。
// service 已校验「子级为 0 + Org 引用为 0」才能删。
router.delete(
  '/:id',
  mws.requirePlatformAdmin,
  v.idParam,
  mws.requirePlatformPassword,
  asyncHandler(c.remove)
)

module.exports = router
