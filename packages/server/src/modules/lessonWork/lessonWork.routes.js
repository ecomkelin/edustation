'use strict'

const router = require('express').Router()
const c = require('./lessonWork.controller')
const s = require('./lessonWork.service')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('lessonWork.read'), asyncHandler(c.list))
router.post('/', mws.requirePermission('lessonWork.write'), s.upload.array('files', 20), asyncHandler(c.upload))
// 物理删除(「误操」场景):超管+密码二次确认(作品是孤儿数据,无关联检查)
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
