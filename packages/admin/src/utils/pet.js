/**
 * 宠物工具函数（2026-06-23）
 *
 * 饱腹度衰减间隔决策 (C 方案, 2026-06-23):
 *   - 物种级 (PetSpecies.hungerDecayMinutes) 是唯一来源
 *   - 平台级 (SiteConfig.pet.hungerDecayMinutes) 仅在物种缺失时兜底
 *   - 去掉 per-pet 字段（管理员改物种后所有该物种宠物立即跟随）
 */

/**
 * 计算宠物的实际饱腹度衰减间隔（分钟/点）。
 *
 * 优先级（用户决策 2026-06-23 C 方案）：
 *   1) PetSpecies.hungerDecayMinutes (物种决定, 默认 60)
 *   2) 平台级 fallback (SiteConfig.pet.hungerDecayMinutes, 默认 30)
 *
 * @param {Object} pet - PetAccount 对象（含 speciesRecord 可选）
 * @param {Number} platformDefault - 平台级默认（分钟/点）
 * @returns {Number} 分钟数（始终 ≥ 1）
 */
export function effectiveHungerDecayMinutes(pet, platformDefault = 30) {
  if (!pet) return platformDefault
  if (pet.speciesRecord?.hungerDecayMinutes && pet.speciesRecord.hungerDecayMinutes > 0) {
    return pet.speciesRecord.hungerDecayMinutes
  }
  return platformDefault
}