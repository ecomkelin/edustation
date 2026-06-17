'use strict'

/**
 * 法律协议路由 (/api/v1/legal)
 *
 * 端点:
 *   GET  /platform                       公开 → manifest 清单 (不含 markdown 原文)
 *   GET  /platform/:key                  公开 → 单份 (markdown + html + frontmatter)
 *   GET  /me/pending                     鉴权 → 当前用户未对齐的协议清单
 *   POST /me/consents                    鉴权 → 批量落 UserConsent
 *   GET  /me/consents                    鉴权 → 我的同意历史
 *   GET  /orgs/:orgId/legal-docs         requirePermission('legal.read')
 *   GET  /orgs/:orgId/legal-docs/:key    公开 (家长 C 端要看)
 *   PUT  /orgs/:orgId/legal-docs/:key    requirePermission('legal.write') → 软停旧+创建新版
 *   GET  /orgs/:orgId/legal-docs/:key/history requirePermission('legal.read')
 *   POST /orgs/:orgId/legal-docs/:key/disable requirePermission('legal.write')
 *
 * 注意:
 *   - /platform 与 /orgs/:orgId/legal-docs/:key 的 GET 是**公开**的, 家长 / 未登录页都能读
 *   - 写操作走 requirePermission, 同时 service 层 orgId 校验做多租户隔离
 */

const router = require('express').Router()
const c = require('./legal.controller')
const v = require('./legal.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// ── 平台级 (公开, 不需要 authenticate) ──
router.get('/platform', asyncHandler(c.platformList))
router.get('/platform/:key', v.platformKeyParam, mws.validateRequest, asyncHandler(c.platformGet))

// ── 公开机构协议读 (家长 C 端用, 不需要 authenticate) ──
router.get('/orgs/:orgId/legal-docs/:key',
  v.orgKeyParam,
  mws.validateRequest,
  asyncHandler(c.orgGet)
)

// 以下需要 authenticate
router.use(mws.authenticate)

// ── /me 系列 (登录后, 不要求 orgId 强制) ──
router.get('/me/pending', asyncHandler(c.myPending))
router.post('/me/consents',
  v.recordConsentsBody,
  mws.validateRequest,
  asyncHandler(c.recordMyConsents)
)
router.get('/me/consents', asyncHandler(c.myConsents))

// ── 机构级 CRUD (需要 orgId + 权限码) ──
router.use(mws.requireOrg)

router.get('/orgs/:orgId/legal-docs',
  mws.requirePermission('legal.read'),
  v.orgIdParam,
  mws.validateRequest,
  asyncHandler(c.orgList)
)

router.put('/orgs/:orgId/legal-docs/:key',
  mws.requirePermission('legal.write'),
  v.orgKeyParam,
  v.upsertBody,
  mws.validateRequest,
  asyncHandler(c.orgUpsert)
)

router.get('/orgs/:orgId/legal-docs/:key/history',
  mws.requirePermission('legal.read'),
  v.orgKeyParam,
  mws.validateRequest,
  asyncHandler(c.orgHistory)
)

router.post('/orgs/:orgId/legal-docs/:key/disable',
  mws.requirePermission('legal.write'),
  v.orgKeyParam,
  mws.validateRequest,
  asyncHandler(c.orgDisable)
)

module.exports = router
