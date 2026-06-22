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
//
// upload 端点**不**加 storage.write 门控:
//   - 业务场景: 非超管用户上传自己头像/校徽/作品(各业务表单都有"上传新 XXX"按钮)
//   - 隔离已由 service 层按 req.orgId 强制, 非超管只能上传到本机构
//   - 体积/类型/防滥用已由 multer 限制(sizeLimit + allowedMime)
// bind / unbind / delete 仍需 storage.write:
//   - 显式 bind/unbind 是 admin 在 /files 页管理引用时用, 非超管用不到
//   - delete 是销毁性操作, 由前端 DestructiveConfirm + 密码二次确认保护
// R-3001 POST /storage/upload
router.post('/upload', upload.single('file'), asyncHandler(c.upload))
// R-3002 POST /storage/upload-many
router.post(
  '/upload-many',
  upload.array('files', config.storage.maxFilesPerUpload),
  asyncHandler(c.uploadMany)
)

// 列表 —— 任意已认证 + 带 x-org-id 的用户可调（org 隔离由 service 强制）
// R-3000 GET /storage/files
router.get('/files', asyncHandler(c.list))
// 详情
// R-3003 GET /storage/files/:id
router.get('/files/:id', asyncHandler(c.detail))
// 显式 bind / unbind（业务模块用 fileBind 自动调用；这里给手写流程备用）
// R-3004 POST /storage/files/:id/bind
router.post('/files/:id/bind', mws.requirePermission('storage.write'), asyncHandler(c.bind))
// R-3005 POST /storage/files/:id/unbind
router.post('/files/:id/unbind', mws.requirePermission('storage.write'), asyncHandler(c.unbind))
// 删除预检 —— 任意已认证用户可调(预检只读,真删走下方 DELETE 仍需 storage.write)
// R-3006 GET /storage/files/:id/removable-check
router.get('/files/:id/removable-check', asyncHandler(c.removableCheck))
// 物理删除（refCount=0 才让删）
// R-3007 DELETE /storage/files/:id
router.delete('/files/:id', mws.requirePermission('storage.write'), asyncHandler(c.remove))

module.exports = router
