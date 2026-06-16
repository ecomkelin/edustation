'use strict'

const { Schema, model } = require('mongoose')

/**
 * 机构推广信息 (OrgPromotion)
 *
 * 设计 (2026-06 拆分)：
 *   - 1 Org : 0..1 OrgPromotion (业务上 1:1，绝大多数机构都会有一份)
 *   - 与 Org 表拆开的理由：
 *       1. 字段数差异大 (Org 10 字段 vs Promotion 20+ 字段)
 *       2. 更新频率差异大 (Org 半年改一次，Promotion 每周都改活动/二维码/文案)
 *       3. 权限分层天然清晰 (Org 仅平台超管，Promotion 机构 admin 即可)
 *       4. 未来扩展 (装修模板 / 多语言 / 校区级推广) 不动 Org 表
 *   - 1:1 用 org 字段 unique 实现；写入时 upsert 风格 (get-or-create)
 *
 * 字段分组 (从"对推广有没有用"角度筛选):
 *   A. 基础展示 — 家长/潜客看到的"机构是谁"
 *   B. 联系方式 — 招生场景用 (与 Org.contactPhone 区分, hotline=对外宣传, contactPhone=内部对接)
 *   C. 自媒体   — 公众号/抖音/小红书
 *   D. 地图位置 — longitude / latitude 供小程序"导航到这"用
 *   E. 资质合规 — licenseNumber 在 Org 上有 (超管写), 这里是"对外公示的额外描述"
 *                       certificates / honors 是上传图片/文字, 机构可改
 *   F. SEO      — seoTitle / seoKeywords / seoDescription 用于分享卡片 / 未来 H5 官网
 *   G. 第三方集成 — 百度统计 / 微信小程序 appid
 *
 * 关联:
 *   - Org (org 字段, unique)
 *   - File (environmentImages / gallery / certificates / sharePoster / wechatQrcode 都是 Ref<File> 数组或单值)
 *
 * 权限码:
 *   - org-promotion.read  (org-promotion 组)
 *   - org-promotion.write (org-promotion 组)
 *   挂在「管理员」「教务」系统职位, 不挂「老师」「家长」「财务」
 */
const OrgPromotionSchema = new Schema(
  {
    // 所属机构 (1:1 unique)
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true, index: true },

    // ─── A. 基础展示 ───
    // 机构简介 (200-500 字, 官网/H5 首页第一屏)
    description: { type: String, default: '' },
    // 品牌故事 (创办理念, 朋友圈分享用)
    brandStory: { type: String, default: '' },
    // 教学特色 (tag 数组, 例 ["小班教学", "名师授课"])
    teachingFeatures: { type: [String], default: [] },
    // 师资介绍 (简版, 不是逐个老师)
    facultyIntro: { type: String, default: '' },
    // 校区环境图 (File ref 数组, 走统一 storage)
    environmentImages: { type: [Schema.Types.ObjectId], ref: 'File', default: [] },
    // 营业时间 (例 "周一至周五 9:00-21:00 / 周末 9:00-18:00")
    businessHours: { type: String, default: '' },
    // 经营范围 (tag 数组, 例 ["钢琴", "声乐", "乐理"])
    businessScope: { type: [String], default: [] },

    // ─── B. 联系方式 (招生场景) ───
    // 招生热线 (与 Org.contactPhone 区分: hotline=对外宣传, contactPhone=内部对接)
    hotline: { type: String, trim: true, default: '' },
    // 客服微信号
    serviceWechat: { type: String, trim: true, default: '' },
    // 客服 QQ
    serviceQq: { type: String, trim: true, default: '' },
    // 电子邮箱
    email: { type: String, trim: true, default: '' },
    // 官方网站
    website: { type: String, trim: true, default: '' },
    // 公众号名称
    wechatPublic: { type: String, trim: true, default: '' },
    // 公众号二维码图片 (File ref 单值)
    wechatQrcode: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // ─── C. 自媒体 ───
    // 抖音号 / 小红书账号 / 视频号名称
    douyin: { type: String, trim: true, default: '' },
    xiaohongshu: { type: String, trim: true, default: '' },
    videoAccount: { type: String, trim: true, default: '' },

    // ─── D. 地图位置 ───
    longitude: { type: Number, default: null },
    latitude: { type: Number, default: null },
    // 附近地标 (例 "万达广场旁")
    nearbyLandmark: { type: String, trim: true, default: '' },

    // ─── E. 资质/荣誉 (机构可改, 与 Org.licenseNumber 互补) ───
    // 注册资金 (展示用, 例 "100万")
    registeredCapital: { type: String, trim: true, default: '' },
    // 资质证书图 (File ref 数组)
    certificates: { type: [Schema.Types.ObjectId], ref: 'File', default: [] },
    // 荣誉 (文字数组, 例 ["2024 年度优秀教培机构"])
    honors: { type: [String], default: [] },

    // ─── F. SEO ───
    seoTitle: { type: String, default: '' },
    seoKeywords: { type: String, default: '' },
    seoDescription: { type: String, default: '' },

    // ─── G. 第三方集成 ───
    // 百度统计 ID
    baiduAnalyticsId: { type: String, trim: true, default: '' },
    // 微信小程序 appid (机构自己的小程序, 跟 SaaS 主小程序区分)
    wechatMiniAppId: { type: String, trim: true, default: '' },

    // ─── 分享 ───
    // 分享海报模板 (File ref 单值)
    sharePoster: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'org_promotions' }
)

module.exports = model('OrgPromotion', OrgPromotionSchema)
