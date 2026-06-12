'use strict'

const router = require('express').Router()
const c = require('./studentWork.controller')
const s = require('./studentWork.service')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// 列表（分页；支持 lessonAttendance / lessonSchedule / courseInstance / subject / student 过滤）
router.get('/', mws.requirePermission('studentWork.read'), asyncHandler(c.list))
// 单条详情（C 端 detail.vue 用，替代原来从 list 过滤的 hack）
router.get('/:id', mws.requirePermission('studentWork.read'), asyncHandler(c.detail))
// 上传：multipart, files 字段名=files
router.post(
  '/',
  mws.requirePermission('studentWork.write'),
  s.upload.array('files', 20),
  asyncHandler(c.upload)
)
// 员工编辑：改 title / description / fileUrls / level
// 4 个 snapshot 字段不可改（service 层强制 strip + schema immutable）
router.patch('/:id', mws.requirePermission('studentWork.write'), asyncHandler(c.update))
// 物理删除（"误操"场景）：超管+密码二次确认（作品是孤儿数据，无关联检查）
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
