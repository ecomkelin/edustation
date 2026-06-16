'use strict'

const { body, param } = require('express-validator')

/**
 * 机构推广信息 (OrgPromotion) 校验
 *
 * 端点:
 *   - GET  /orgs/:id/promotion
 *   - PUT  /orgs/:id/promotion
 *
 * 路由挂载: org.routes.js 用 `router.use('/:id/promotion', orgPromoRouter)` 接入,
 *   inner router 用 `mergeParams: true` 把外层 `:id` 合并进 req.params。
 *   所以内层 validator 必须 validate `param('id')` (不是 `param('orgId')`),
 *   否则 express-validator 找不到该 param, 报 "orgId 需为合法 id"。
 *
 * 字段说明见 OrgPromotion.model.js 头注释。
 * 数组/对象类型做"形状"校验, 不做穷举 (业务上扩展字段走 meta 兜底)。
 */

const update = [
  // ── A. 基础展示 ──
  body('description').optional().isString().isLength({ max: 2000 }).withMessage('机构简介 ≤ 2000 字'),
  body('brandStory').optional().isString().isLength({ max: 2000 }).withMessage('品牌故事 ≤ 2000 字'),
  body('teachingFeatures').optional().isArray({ max: 30 }).withMessage('教学特色 ≤ 30 项'),
  body('teachingFeatures.*').optional().isString().isLength({ max: 50 }),
  body('facultyIntro').optional().isString().isLength({ max: 2000 }),
  body('environmentImages').optional().isArray({ max: 30 }).withMessage('环境图 ≤ 30 张'),
  body('environmentImages.*').optional().isMongoId(),
  body('businessHours').optional().isString().isLength({ max: 200 }),
  body('businessScope').optional().isArray({ max: 30 }).withMessage('经营范围 ≤ 30 项'),
  body('businessScope.*').optional().isString().isLength({ max: 50 }),

  // ── B. 联系方式 ──
  body('hotline').optional().isString().isLength({ max: 50 }),
  body('serviceWechat').optional().isString().isLength({ max: 50 }),
  body('serviceQq').optional().isString().isLength({ max: 20 }),
  body('email').optional().isString().isLength({ max: 100 }),
  body('website').optional().isString().isLength({ max: 200 }),
  body('wechatPublic').optional().isString().isLength({ max: 50 }),
  body('wechatQrcode').optional({ nullable: true }).isMongoId(),

  // ── C. 自媒体 ──
  body('douyin').optional().isString().isLength({ max: 50 }),
  body('xiaohongshu').optional().isString().isLength({ max: 50 }),
  body('videoAccount').optional().isString().isLength({ max: 50 }),

  // ── D. 地图 ──
  body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
  body('nearbyLandmark').optional().isString().isLength({ max: 100 }),

  // ── E. 资质荣誉 ──
  body('registeredCapital').optional().isString().isLength({ max: 50 }),
  body('certificates').optional().isArray({ max: 30 }).withMessage('资质证书 ≤ 30 张'),
  body('certificates.*').optional().isMongoId(),
  body('honors').optional().isArray({ max: 50 }),
  body('honors.*').optional().isString().isLength({ max: 100 }),

  // ── F. SEO ──
  body('seoTitle').optional().isString().isLength({ max: 100 }),
  body('seoKeywords').optional().isString().isLength({ max: 200 }),
  body('seoDescription').optional().isString().isLength({ max: 500 }),

  // ── G. 第三方 ──
  body('baiduAnalyticsId').optional().isString().isLength({ max: 50 }),
  body('wechatMiniAppId').optional().isString().isLength({ max: 50 }),

  // ── 分享 ──
  body('sharePoster').optional({ nullable: true }).isMongoId()
]

// 注意: 用 `param('id')` (外层 mount 时的路径段), 不是 `param('orgId')`.
// mergeParams: true 会把外层 :id 合并进来, controller 也用 req.params.id 取值。
const orgIdParam = [
  param('id').isMongoId().withMessage('orgId 需为合法 id')
]

module.exports = { update, orgIdParam }
