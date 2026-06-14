'use strict'

const path = require('path')
const fs = require('fs')
const multer = require('multer')
const router = require('express').Router()
const c = require('./storage.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const config = require('@config/index')

// ─── multer（内存模式，只收 buffer，交给 driver 写盘） ──────────────────────
// 与 driver 解耦：driver 拿到 buffer 后决定写 local 还是 s3。
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxFileSize }
})

router.use(mws.authenticate, mws.requireOrg)

// 上传（单 / 多）
//   POST /storage/upload         字段名 file
//   POST /storage/upload-many    字段名 files (max 20)
router.post(
  '/upload',
  mws.requirePermission('storage.write'),
  upload.single('file'),
  asyncHandler(c.upload)
)
router.post(
  '/upload-many',
  mws.requirePermission('storage.write'),
  upload.array('files', config.storage.maxFilesPerUpload),
  asyncHandler(c.uploadMany)
)

// 列表
router.get('/files', mws.requirePermission('storage.read'), asyncHandler(c.list))
// 详情
router.get('/files/:id', mws.requirePermission('storage.read'), asyncHandler(c.detail))
// 显式 bind / unbind（业务模块用 fileBind 自动调用；这里给手写流程备用）
router.post('/files/:id/bind', mws.requirePermission('storage.write'), asyncHandler(c.bind))
router.post('/files/:id/unbind', mws.requirePermission('storage.write'), asyncHandler(c.unbind))
// 删除预检
router.get('/files/:id/removable-check', mws.requirePermission('storage.read'), asyncHandler(c.removableCheck))
// 物理删除（refCount=0 才让删）
router.delete('/files/:id', mws.requirePermission('storage.write'), asyncHandler(c.remove))

module.exports = router
