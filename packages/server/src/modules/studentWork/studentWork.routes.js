'use strict'

const router = require('express').Router()
const c = require('./studentWork.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// 列表（分页；支持 lessonAttendance / lessonSchedule / courseInstance / subject / student 过滤）
router.get('/', mws.requirePermission('studentWork.read'), asyncHandler(c.list))
// 单条详情（C 端 detail.vue 用，替代原来从 list 过滤的 hack）
router.get('/:id', mws.requirePermission('studentWork.read'), asyncHandler(c.detail))
// 创建：JSON 入参 { lessonAttendance, title, fileIds: [id...], description?, level? }
//   文件已由前端先调 /storage/upload-many?scope=work 拿 fileIds，此处不接 multipart
router.post('/', mws.requirePermission('studentWork.write'), asyncHandler(c.upload))
// 员工编辑：改 title / description / fileUrls / level
// 4 个 snapshot 字段不可改（service 层强制 strip + schema immutable）
router.patch('/:id', mws.requirePermission('studentWork.write'), asyncHandler(c.update))
// 物理删除（"误操"场景）：超管+密码二次确认（作品是孤儿数据，无关联检查）
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// 预检：作品无业务引用, 始终 canRemove=true
router.get('/:id/removable-check', mws.requirePermission('studentWork.read'), asyncHandler(c.removableCheck))

module.exports = router
