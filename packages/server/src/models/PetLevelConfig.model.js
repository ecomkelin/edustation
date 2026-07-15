'use strict'

const { Schema, model } = require('mongoose')
const { DEFAULT_LEVEL_CONFIG } = require('@shared/petConfig')

/**
 * 宠物等级配置（PetLevelConfig，2026-07-15 立项）
 *
 * per-org 单例（每机构一条）：控制该机构宠物的最大等级与每级所需经验曲线。
 *   - expToNext(L) = expBase + expIncrement * (L - 1)
 *   - 满级（maxLevel）后经验封顶、不再升级
 *
 * 无记录时 service 用 shared/petConfig.js#DEFAULT_LEVEL_CONFIG 兜底。
 * 平台超管与机构管理员（pet.write）均可编辑本机构配置。
 */
const PetLevelConfigSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true, index: true },

    maxLevel:     { type: Number, default: DEFAULT_LEVEL_CONFIG.maxLevel, min: 1, max: 100 },
    expBase:      { type: Number, default: DEFAULT_LEVEL_CONFIG.expBase, min: 1, max: 1000000 },
    expIncrement: { type: Number, default: DEFAULT_LEVEL_CONFIG.expIncrement, min: 0, max: 1000000 },

    meta: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    collection: 'pet_level_configs'
  }
)

module.exports = model('PetLevelConfig', PetLevelConfigSchema)
