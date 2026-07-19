'use strict'

const { Schema, model } = require('mongoose')
const { PET_VISUAL_TYPES } = require('@shared/enums')

/**
 * 宠物形象图鉴（PetSpecies，2026-06-21 pet-system-v2-ext）
 *
 * 平台级共享：全部由平台超管统一管理；所有机构共用一份图鉴。
 *
 * PetAccount.species 存 key 字符串（不存 ObjectId 引用），便于：
 *   1. 物种删除/重命名不影响已生成 PetAccount（前端 fallback emoji）
 *   2. 跨机构数据兼容（同 key 全平台语义一致）
 *
 * 2026-07-15 重构：
 *   - 删 tier 字段（无等阶）
 *   - visualType 收敛为 'video'（宠物本体只用视频；svgContent 保留仅兜底渲染）
 *   - rollSpecies 全池加权随机（不再按 tier 分池）
 *
 * 2026-07-16：
 *   - 删 image 视觉类型（enum 只剩 svg/video）+ 删 imageFile 字段
 *   - 新增 levelVisuals[]（per-species 逐级形象覆盖；未列出的等级按 fallback 链
 *     levelVisuals[level] → levelVisuals[level-1] → ... → 视觉总默认（visualType/svgContent/videoFile））。
 *     1 级兜底：fallback 链必然命中物种自身视觉（seed + 编辑校验保证 species 视觉字段非空）。
 *
 * 2026-07-18：
 *   - 删 maxLevel 字段（最高等级由 levelVisuals[] 数组本身决定：max(levelVisuals[].level)，
 *     空数组时用 DEFAULT_SPECIES_MAX_LEVEL=1 兜底，即"蛋态默认"只能保持 1 级；
 *     经验曲线仍由 per-org PetLevelConfig 统一管理）。
 *   - 删 maxLevel 后，「最高等级」这一信息完全冗余 — 每级形象列表本身已描述支持到多少级。
 *
 * 2026-07-18 第四期：升级特效 (levelUpEffect)
 *   - 在 levelVisuals[] 每条子文档里嵌一个可选的 levelUpEffect 子字段 {visualType, svgContent, videoFile}
 *   - 与「持续循环播放的形象 (levelVisuals[L].visualType+内容)」对称，但语义是**瞬时事件**而非状态：
 *     升级到 L 时**一次性**播放该等级的特效；播放结束即回到 L 的 currentVisual 持续循环
 *   - 没配 = 升级时无特效（直接换形象）；不向 fallback 链上溯（不像 visual 有 1→0 的递归）
 *   - 同 species 内嵌：复用 partial unique 索引 (按 level 唯一)；file ref 维护也走 per-level field
 *     命名空间 `levelVisual.<L>.levelUpEffect`
 *
 * 字段：
 *   - key / name / visualType / videoFile (+ svgContent 兜底)
 *   - levelVisuals[{level,visualType,svgContent,videoFile, levelUpEffect?}]（逐级形象 + 可选升级特效）
 *   - weight  (破壳加权随机权重)
 *   - hungerDecayMinutes / isActive / description / meta
 *   - createdBy / updatedBy  (审计)
 */
const PetSpeciesSchema = new Schema(
  {
    // 唯一 key（全局唯一，无 org 维度）
    key: { type: String, required: true, trim: true, unique: true },

    // 中文名（玩家可见）
    name: { type: String, required: true, trim: true, maxlength: 64 },

    // 视觉类型（重构后宠物本体固定 'video'；enum 保留 svg 兜底渲染）
    visualType: { type: String, enum: PET_VISUAL_TYPES, required: true, default: 'video' },

    // svg 时存内联字符串
    svgContent: { type: String, default: null, maxlength: 50000 },

    // 2026-07-12: video 时存 File ref（mp4/webm 等，列表/详情预览）
    videoFile: { type: Schema.Types.ObjectId, ref: 'File', default: null },

    // 2026-07-16: per-species 逐级形象覆盖（每等级一条；空数组 → 全部等级用 species 视觉字段）
    // fallback 链：levelVisuals[level] → levelVisuals[level-1] → ... → 物种自身视觉字段
    // 2026-07-18: 最高等级由本数组派生 (max(levelVisuals[].level))，数组外不再存 maxLevel
    // 2026-07-18 第四期: 每条子文档可选嵌 levelUpEffect — 升级到该等级时一次性播放的特效视频/SVG
    //   与形象区分：形象 = 持续循环状态；特效 = 升级瞬时事件。未配 = 升级时无特效。
    levelVisuals: {
      type: [
        new Schema(
          {
            _id: false,
            level:      { type: Number, required: true, min: 1, max: 100 },
            visualType: { type: String, enum: PET_VISUAL_TYPES, required: true },
            svgContent: { type: String, default: null, maxlength: 50000 },
            videoFile:  { type: Schema.Types.ObjectId, ref: 'File', default: null },
            // 2026-07-18 第四期: 升级特效 (瞬时事件, 跟形象区分)。整段缺省 / 字段 null = 无特效。
            // 注意：整个子字段缺省视为未配，不参与 file ref 维护；只 visualType+内容双全才有效。
            levelUpEffect: {
              type: new Schema(
                {
                  _id: false,
                  visualType: { type: String, enum: PET_VISUAL_TYPES, default: null },
                  svgContent: { type: String, default: null, maxlength: 50000 },
                  videoFile:  { type: Schema.Types.ObjectId, ref: 'File', default: null }
                },
                { _id: false }
              ),
              default: null
            }
          },
          { _id: false }
        )
      ],
      default: []
    },

    // 破壳加权随机权重
    weight: { type: Number, default: 100, min: 0, max: 10000 },

    // 2026-06-23: 物种级饱腹度衰减间隔（分钟/点），破壳时继承到 PetAccount
    //   默认 60 分钟/点（用户决策）；cron 优先级: PetAccount.hungerDecayMinutes > species > 平台级 fallback
    hungerDecayMinutes: { type: Number, default: 60, min: 1, max: 10080 },

    // 软启用
    isActive: { type: Boolean, default: true, index: true },

    // 描述
    description: { type: String, default: null, maxlength: 500 },

    // 扩展位
    meta: { type: Schema.Types.Mixed, default: {} },

    // 审计
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    collection: 'pet_species'
  }
)

// isActive 已在字段上 index: true；无需额外复合索引（去 tier 后列表仅按 isActive/keyword）

// 2026-07-16: per-species levelVisuals 同 level 必须唯一
// 2026-07-19: 索引改成普通 (非 unique) — 跨文档全局唯一是错误的
// 旧设计 { 'levelVisuals.level': 1 } unique 是**跨文档全局唯一**, 不同物种不能同时有 Lv.1 覆盖
// mongo 的复合 { _id + levelVisuals.level } unique 对数组元素不生效, 仍允许同 species dup level
// 唯一性完全交给 service 层 normalizeLevelVisuals (seenLevels 去重) + update 路径预检
// 保留普通索引加速 "按 level 查物种" 类查询
PetSpeciesSchema.index(
  { 'levelVisuals.level': 1 },
  { partialFilterExpression: { 'levelVisuals.0': { $exists: true } } }
)

module.exports = model('PetSpecies', PetSpeciesSchema)