'use strict'

/**
 * 宠物装饰 service（pet-system-v2 2026-06-21 + pet-system-v2-ext 2026-06-21）
 *
 * 职责：
 *   - 列出图鉴（按 slot 分组 / 标注已解锁 / 已装备）
 *   - 装备 / 卸下（equip 接口）
 *
 * 解锁规则（由 pet.service.feed / hatch 触发）：
 *   - hat/scarf/clothes/accessory  → 升 Lv 自动解锁（unlockType=level）
 *   - halo/background              → 升阶自动解锁（unlockType=tier；D4 不自动装备）
 *
 * 装备校验（equip 接口）：
 *   - itemKey 必须存在
 *   - item.slot 必须等于请求 slot
 *   - itemKey 必须 ∈ pet.unlocked[slot]
 *   - 卸下（itemKey=null）总是允许
 *
 * 2026-06-21 pet-system-v2-ext：装饰从 shared/petItems.js 静态 → PetItem DB；
 *   equip/listCatalog/listAllCatalog 全部走 petCatalog 读。
 */

const PetAccount = require('@models/PetAccount.model')
const petEvent = require('./petEvent.service')
const petService = require('./pet.service')
const petCatalog = require('@modules/pet/petCatalog.service')
const ApiError = require('@utils/ApiError')
const { PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS } = require('@shared/enums')

/**
 * 列出图鉴 + 当前 PetAccount 的解锁 / 装备状态。
 *
 * @param {String} orgId
 * @param {String} studentId
 * @returns {Promise<{items: Object, pet: Object}>}
 */
async function listCatalog({ orgId, studentId }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')

  const pet = await petService.getMine({ orgId, studentId })
  if (!pet) throw ApiError.notFound('未领养宠物')

  const unlocked = pet.unlocked || {}
  const equipped = pet.equipped || {}

  // 按 slot 分组：从 DB 读全部 items
  const allItems = await petCatalog.listItems({ orgId, isActive: true })
  const bySlot = {}
  for (const slot of PET_ITEM_SLOTS) {
    bySlot[slot] = {
      slot,
      slotLabel: PET_ITEM_SLOT_LABELS[slot],
      items: allItems.filter((it) => (it.slot || it.type) === slot).map((it) => ({
        key: it.key,
        name: it.name,
        description: it.description,
        image: it.image || (it.imageFile && it.imageFile.url) || null,
        imageFile: it.imageFile || null,
        unlockTier: it.unlockTier,
        unlockLevel: it.unlockLevel,
        compatibleSpecies: it.compatibleSpecies || [],
        unlocked: (unlocked[slot] || []).includes(it.key),
        equipped: equipped[slot] === it.key
      }))
    }
  }

  return { items: bySlot, pet }
}

/**
 * 装备 / 卸下装饰。
 */
async function equip({ orgId, studentId, slot, itemKey }) {
  if (!orgId || !studentId) throw ApiError.badRequest('缺少 orgId/studentId')
  if (!slot) throw ApiError.badRequest('缺少 slot')
  if (!PET_ITEM_SLOTS.includes(slot)) throw ApiError.badRequest('slot 不合法')
  if (itemKey !== null && itemKey !== undefined) {
    if (typeof itemKey !== 'string' || itemKey.length === 0) {
      throw ApiError.badRequest('itemKey 不合法')
    }
  }

  const pet = await PetAccount.findOne({ org: orgId, student: studentId })
  if (!pet) throw ApiError.notFound('未领养宠物')
  if (pet.state !== 'alive') throw ApiError.unprocessable('当前不是存活状态，无法换装')

  // 卸下：清空该 slot
  if (itemKey === null || itemKey === undefined) {
    const prevKey = pet.equipped?.[slot] || null
    if (!prevKey) {
      return { petAccount: await petService.decoratePet(pet.toObject()), event: null, changed: false }
    }
    const updated = await PetAccount.findOneAndUpdate(
      { _id: pet._id },
      { $set: { [`equipped.${slot}`]: null } },
      { new: true }
    ).lean()
    const event = await petEvent.recordEvent({
      orgId,
      studentId,
      petAccountId: pet._id,
      type: 'unequip',
      payload: { slot, itemKey: prevKey, fromItemKey: prevKey }
    })
    return { petAccount: await petService.decoratePet(updated), event, changed: true }
  }

  // 装备：校验
  const item = await petCatalog.getItem({ orgId, key: itemKey })
  if (!item) throw ApiError.badRequest('itemKey 不存在')
  const itemSlot = item.slot || item.type
  if (itemSlot !== slot) {
    throw ApiError.unprocessable(`该物品是 ${PET_ITEM_SLOT_LABELS[itemSlot]}，不能装备到 ${PET_ITEM_SLOT_LABELS[slot]} 槽位`)
  }

  const unlockedList = pet.unlocked?.[slot] || []
  if (!unlockedList.includes(itemKey)) {
    throw ApiError.unprocessable('该物品尚未解锁')
  }

  const prevKey = pet.equipped?.[slot] || null
  const updated = await PetAccount.findOneAndUpdate(
    { _id: pet._id },
    { $set: { [`equipped.${slot}`]: itemKey } },
    { new: true }
  ).lean()
  if (!updated) throw ApiError.conflict('换装失败，请重试')

  const event = await petEvent.recordEvent({
    orgId,
    studentId,
    petAccountId: pet._id,
    type: 'equip',
    payload: { slot, itemKey, fromItemKey: prevKey }
  })
  return { petAccount: await petService.decoratePet(updated), event, changed: true, fromItemKey: prevKey }
}

/**
 * 平台图鉴只读列表（admin 用 + 客户端"图鉴"页）。
 * 不需要 PetAccount；返回所有 item + 分 slot 列表。
 */
async function listAllCatalog({ orgId }) {
  const items = await petCatalog.listItems({ orgId, isActive: true })
  const bySlot = {}
  for (const slot of PET_ITEM_SLOTS) {
    bySlot[slot] = {
      slot,
      slotLabel: PET_ITEM_SLOT_LABELS[slot],
      items: items.filter((it) => (it.slot || it.type) === slot)
    }
  }
  return bySlot
}

module.exports = {
  listCatalog,
  equip,
  listAllCatalog
}