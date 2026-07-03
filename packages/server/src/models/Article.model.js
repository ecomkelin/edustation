'use strict'

const { Schema, model } = require('mongoose')

/**
 * 平台科普文章 (Article)
 *
 * 设计 (2026-07-03 立项):
 *   - 平台超管统一发布, 跨机构对所有家长可见 (org=null 平台级, 类似 OrgPromotion)
 *   - 不分版本, 直接 isPublished 软控上下架
 *   - contentMarkdown 原文 (admin 编辑), contentHtml 服务端预编译 (前端直渲)
 *   - coverFile 可挂 File (storage 模块) 做封面图
 *   - viewCount 详情接口 +1 (D1: 直接 $inc, 后续考虑去 user+ip+day 加 cache)
 *   - 排序: publishedAt desc 优先
 *
 * 权限:
 *   - article.read / article.write / article.delete (article 组, 挂在「平台超管」)
 *   - C 端公开 GET /articles /articles/:id 无需权限码
 */
const ArticleSchema = new Schema(
  {
    // 平台级: org=null (不存任何机构 id). 留字段是为了未来"按机构发"扩展.
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null, index: true },

    // 标题 (前端卡片 + 详情顶部展示)
    title: { type: String, required: true, trim: true, maxlength: 100 },

    // 摘要 (前端卡片副标题; 列表只展示摘要不渲 markdown)
    summary: { type: String, trim: true, maxlength: 200, default: '' },

    // markdown 原文 + 预编译 HTML (前端 / client 详情页直接 v-html 不重复编译)
    contentMarkdown: { type: String, required: true, default: '' },
    contentHtml: { type: String, default: '' },

    // 封面图: 关联 storage.File (C 端 cover 显示用, 详情页用 bg-hero 渐变铺底)
    coverFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // 分类 (e.g. 'science', 'parenting', 'activity'); 留空 = 全部
    category: { type: String, trim: true, maxlength: 50, default: '', index: true },

    // 上下架 (软发布, 取代物理删除)
    isPublished: { type: Boolean, default: false, index: true },

    // 发布时间 (admin 端可定时; 草稿态 publishedAt=null, 发布后填)
    publishedAt: { type: Date, default: null, index: true },

    // 浏览次数 (详情接口原子 +1)
    viewCount: { type: Number, default: 0 },

    // 编辑审计
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'articles' }
)

// 公开列表按发布时间倒序
ArticleSchema.index({ isPublished: 1, publishedAt: -1 })
// 分类筛选
ArticleSchema.index({ isPublished: 1, category: 1, publishedAt: -1 })

module.exports = model('Article', ArticleSchema)
