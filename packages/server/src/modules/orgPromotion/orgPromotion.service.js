'use strict'

const mongoose = require('mongoose')
const OrgPromotion = require('@models/OrgPromotion.model')
const Org = require('@models/Org.model')
const ApiError = require('@utils/ApiError')
const { REF_ENTITY } = require('@models/File.model')
const fileBind = require('@modules/storage/fileBind')

/**
 * 机构推广信息 (OrgPromotion) 业务逻辑
 *
 * 关键设计:
 *   - 1 Org : 0..1 OrgPromotion (org 字段 unique)
 *   - GET 时不存在 → 返回空文档 (前端可借此判断"还没填推广")
 *   - PUT 时 upsert (findOneAndUpdate({org}, {$set}, {upsert, new}))
 *   - File ref 字段 (environmentImages / certificates / wechatQrcode / sharePoster) 走
 *     fileBind.diffArray / diffSingle 维护引用, 与 Org.logo / User.avatar 一致
 *
 * 权限:
 *   - 本模块读/写都要求 org-promotion.read / org-promotion.write
 *   - 路径挂在 /api/v1/orgs/:orgId/promotion, 由 routes 层做参数校验 + 权限校验
 */

/* 白名单: 允许 PUT 写入的字段 (其他字段会被 service 过滤掉, 防止恶意写入) */
const UPDATABLE_FIELDS = [
  // A. 基础展示
  'description', 'brandStory', 'teachingFeatures', 'facultyIntro',
  'environmentImages', 'businessHours', 'businessScope',
  // B. 联系方式
  'hotline', 'serviceWechat', 'serviceQq', 'email', 'website',
  'wechatPublic', 'wechatQrcode',
  // C. 自媒体
  'douyin', 'xiaohongshu', 'videoAccount',
  // D. 地图
  'longitude', 'latitude', 'nearbyLandmark',
  // E. 资质
  'registeredCapital', 'certificates', 'honors',
  // F. SEO
  'seoTitle', 'seoKeywords', 'seoDescription',
  // G. 第三方
  'baiduAnalyticsId', 'wechatMiniAppId',
  // 分享
  'sharePoster'
]

/* File ref 字段配置: 哪个字段走 diffSingle, 哪个走 diffArray */
const FILE_REF_SINGLE = ['wechatQrcode', 'sharePoster']
const FILE_REF_ARRAY = ['environmentImages', 'certificates']

/**
 * 取某机构的推广信息; 不存在则返回空文档 (org=null, 其余默认)
 * 前端 GET 后判断 `org` 字段: null=还没填, ObjectId=已填
 */
async function get(orgId) {
  if (!mongoose.isValidObjectId(orgId)) throw ApiError.badRequest('orgId 不合法')

  // 校验机构存在 (前端若传错 orgId, 返回 404 而不是空数据)
  const org = await Org.findById(orgId).select('_id').lean()
  if (!org) throw ApiError.notFound('机构不存在')

  const promo = await OrgPromotion.findOne({ org: orgId }).lean()
  if (promo) return promo

  // 没填过 → 返回空文档 (org=null 表示 "该机构还没有推广信息")
  return {
    org: null,
    description: '',
    brandStory: '',
    teachingFeatures: [],
    facultyIntro: '',
    environmentImages: [],
    businessHours: '',
    businessScope: [],
    hotline: '',
    serviceWechat: '',
    serviceQq: '',
    email: '',
    website: '',
    wechatPublic: '',
    wechatQrcode: null,
    douyin: '',
    xiaohongshu: '',
    videoAccount: '',
    longitude: null,
    latitude: null,
    nearbyLandmark: '',
    registeredCapital: '',
    certificates: [],
    honors: [],
    seoTitle: '',
    seoKeywords: '',
    seoDescription: '',
    baiduAnalyticsId: '',
    wechatMiniAppId: '',
    sharePoster: null
  }
}

/**
 * 更新某机构的推广信息 (upsert 风格)。
 * payload: 前端提交的字段 (走白名单过滤)
 * options.fileBindOrgId: 上传图片时用的源 org (req.orgId), 用于 fileBind 跨租户校验
 *   - 关键: 不是被编辑的 orgId, 而是**上传图片时** x-org-id 对应的 org
 *   - 与 org.service.update 同一约定, 防止"在 A scope 上传, 给 B org PUT"时 isOurFile 误判
 */
async function update(orgId, payload, options = {}) {
  if (!mongoose.isValidObjectId(orgId)) throw ApiError.badRequest('orgId 不合法')
  const org = await Org.findById(orgId).select('_id').lean()
  if (!org) throw ApiError.notFound('机构不存在')

  // 白名单过滤
  const set = {}
  for (const k of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      set[k] = payload[k]
    }
  }
  if (Object.keys(set).length === 0) {
    // 没传任何可写字段 → 当成"读"返回 (前端可能调 PUT 不带 body)
    return get(orgId)
  }

  // upsert (不存在则创建, org 字段为 unique)
  const before = await OrgPromotion.findOne({ org: orgId }).lean()
  const updated = await OrgPromotion.findOneAndUpdate(
    { org: orgId },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean()

  // File ref 维护: 单值走 diffSingleById (wechatQrcode/sharePoster 都是 ObjectId<Ref:File>),
  // 数组走 diffArrayById (environmentImages/certificates)
  const bindOrgId = options.fileBindOrgId || orgId
  for (const field of FILE_REF_SINGLE) {
    if (!Object.prototype.hasOwnProperty.call(set, field)) continue
    try {
      await fileBind.diffSingleById({
        orgId: bindOrgId,
        oldId: before ? before[field] : null,
        newId: set[field],
        entity: REF_ENTITY.ORG_PROMOTION,
        entityId: orgId,
        field
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[orgPromotion.update] ${field} diffSingleById FAILED:`, e)
    }
  }
  for (const field of FILE_REF_ARRAY) {
    if (!Object.prototype.hasOwnProperty.call(set, field)) continue
    try {
      await fileBind.diffArrayById({
        orgId: bindOrgId,
        oldIds: before ? (before[field] || []) : [],
        newIds: set[field] || [],
        entity: REF_ENTITY.ORG_PROMOTION,
        entityId: orgId,
        field
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[orgPromotion.update] ${field} diffArrayById FAILED:`, e)
    }
  }

  return updated
}

module.exports = { get, update }
