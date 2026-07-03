'use strict'

const { Schema, model } = require('mongoose')

/**
 * 平台小游戏 (Game)
 *
 * 设计 (2026-07-03 立项):
 *   - 平台超管统一发布, 跨机构对所有家长可见 (org=null 平台级)
 *   - launchUrl 走 H5 (web-view 打开); 后续如要原生小游戏可以加 targetType='miniprogram' + 二维码
 *   - playCount 启动接口原子 +1 (D1: 直接 $inc; 后续按 user+day 加 cache)
 *   - thumbnail + coverFile 二选一; 优先 coverFile (storage.File), fallback thumbnail (外链)
 *   - 排序: publishedAt desc 优先
 *
 * 权限:
 *   - game.read / game.write / game.delete (game 组, 挂在「平台超管」)
 *   - C 端公开 GET /games /games/:id 无需权限码; /games/:id/play 启动计数
 */
const GameSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null, index: true },

    // 名称 (前端卡片标题)
    name: { type: String, required: true, trim: true, maxlength: 60 },

    // 简介 (前端卡片副标题)
    intro: { type: String, trim: true, maxlength: 200, default: '' },

    // 启动 URL (H5; client web-view 直接打开)
    launchUrl: { type: String, required: true, trim: true, maxlength: 500 },

    // 缩略图: storage.File 优先
    coverFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    // 兜底外链 (CDN/Unsplash 等); coverFile 为空时显示
    coverUrl: { type: String, trim: true, maxlength: 500, default: '' },

    // 标签 (e.g. ['思维','益智','反应']); 空数组 = 全部
    tags: { type: [String], default: [] },

    // 难度档 (e.g. 'easy'/'medium'/'hard'); 留空 = 通用
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', ''],
      default: ''
    },

    // 上下架 + 发布时间
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null, index: true },

    // 启动次数 (启动接口原子 +1)
    playCount: { type: Number, default: 0 },

    // 编辑审计
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'games' }
)

GameSchema.index({ isPublished: 1, publishedAt: -1 })

module.exports = model('Game', GameSchema)
