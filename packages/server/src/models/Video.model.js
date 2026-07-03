'use strict'

const { Schema, model } = require('mongoose')

/**
 * 平台科普视频 (Video)
 *
 * 设计 (2026-07-03 立项):
 *   - 平台超管统一发布, 跨机构对所有家长可见 (org=null 平台级, 与 Article/Game 一致评级)
 *   - videoUrl 走 H5 (web-view 直接打开 mp4 / 第三方视频页 / B 站 embed URL 均可)
 *   - coverFile/coverUrl 二选一; 优先 coverFile (storage.File)
 *   - viewCount 详情/启动接口 +1 (D1: 直接 $inc)
 *   - 排序: publishedAt desc 优先
 *
 * 权限:
 *   - video.read / video.write (video 组, 挂在「平台超管」)
 *   - C 端公开 GET /videos /videos/:id 无需权限码; /videos/:id/play 启动计数
 */
const VideoSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null, index: true },

    // 标题 (前端卡片 + 详情/播放页顶部展示)
    title: { type: String, required: true, trim: true, maxlength: 80 },

    // 简介 (前端卡片副标题)
    intro: { type: String, trim: true, maxlength: 200, default: '' },

    // 视频 URL (mp4 直链 或 H5 embed 页; client web-view 直接打开)
    videoUrl: { type: String, required: true, trim: true, maxlength: 500 },

    // 封面图: storage.File 优先
    coverFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    // 兜底外链 (CDN/Unsplash 等)
    coverUrl: { type: String, trim: true, maxlength: 500, default: '' },

    // 分类 (e.g. 'science'/'nature'/'space'); 留空 = 全部
    category: { type: String, trim: true, maxlength: 50, default: '', index: true },

    // 标签 (e.g. ['黑洞','宇宙','天文'])
    tags: { type: [String], default: [] },

    // 时长秒数 (仅展示用, 不强约束播放)
    durationSeconds: { type: Number, default: 0, min: 0 },

    // 上下架 + 发布时间
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null, index: true },

    // 播放次数 (启动接口原子 +1)
    viewCount: { type: Number, default: 0 },

    // 编辑审计
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'videos' }
)

VideoSchema.index({ isPublished: 1, publishedAt: -1 })

module.exports = model('Video', VideoSchema)
