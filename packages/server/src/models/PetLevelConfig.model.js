'use strict'

const { Schema, model } = require('mongoose')
const { DEFAULT_LEVEL_CONFIG } = require('@shared/petConfig')

/**
 * 宠物等级配置（PetLevelConfig，2026-07-15 立项）
 *
 * per-org 单例（每机构一条）：**统一管理**该机构宠物的每级所需晋升经验。
 *   - 公式默认：expToNext(L) = expBase + expIncrement * (L - 1)
 *   - 逐级覆盖：levelExpOverrides[level] 命中时优先于公式，用于手动调整某一级
 *   - 最高等级由 PetSpecies.levelVisuals[].max 派生（2026-07-16 起迁出 per-org，2026-07-18 删 PetSpecies.maxLevel 字段；空数组 → DEFAULT_SPECIES_MAX_LEVEL=1 兜底, 即"蛋态默认"只能 1 级）
 *
 * 无记录时 service 用 shared/petConfig.js#DEFAULT_LEVEL_CONFIG 兜底。
 * 平台超管与机构管理员（pet.write）均可编辑本机构配置。
 *
 * 2026-07-16：新增 levelExpOverrides 数组字段，删后端代码无 / 删前端仍按公式兜底 → 后向兼容 0 成本。
 */
const PetLevelConfigSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true, index: true },

    expBase:      { type: Number, default: DEFAULT_LEVEL_CONFIG.expBase, min: 1, max: 1000000 },
    expIncrement: { type: Number, default: DEFAULT_LEVEL_CONFIG.expIncrement, min: 0, max: 1000000 },

    /**
     * 逐级覆盖：[{ level: Number, exp: Number }]（升序，唯一 level）
     * 命中时 expToNext(L) 直接返回该值，绕过公式。
     * 未列出的等级仍走 expBase+expIncrement*(L-1)；删光整张表退到默认值。
     */
    levelExpOverrides: {
      type: [{
        level: { type: Number, required: true, min: 1, max: 100 },
        exp:   { type: Number, required: true, min: 1, max: 1000000 }
      }],
      default: []
    },

    meta: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    collection: 'pet_level_configs'
  }
)

module.exports = model('PetLevelConfig', PetLevelConfigSchema)
