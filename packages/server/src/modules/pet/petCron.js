'use strict'

/**
 * 宠物饥饿衰减 + 死亡 cron（pet-system-v2 2026-06-21）
 *
 * 行为（参照 D1：cron 写 + read 纯展示）：
 *   - 每 1 小时扫一次所有 org 的 PetAccount
 *   - 对 state='alive' 的宠物按当前阶 decayPerDay 扣 currentHunger
 *   - 用 CAS（带 lastHungerDecayAt 守卫）保证并发安全
 *   - CAS 失败 retry 1 次；连续失败 log 告警
 *   - 当 currentHunger=0 且 (now - lastFedAt) >= deathThresholdDays：
 *     - 同一 tick 内：state=dead → state=egg (rebirth)
 *     - level=1, exp=0, hunger=maxHunger, lastFedAt=null
 *     - 写 PetEvent type=death + type=rebirth
 *
 * 设计：
 *   - 与 captcha.service 一样用 setInterval(...).unref()（不阻塞进程退出）
 *   - 手动 sweepNow() 暴露给 admin 端"立即跑一次"按钮（调试用）
 *
 * K8s 丢 tick 风险（参照 R1 应对）：
 *   - 单次 tick 内取 elapsedDays 全量补偿（不是按 tick 增量算）
 *   - 丢 1 个 tick = 最多 1h 衰减未扣，可接受
 */

const PetAccount = require('@models/PetAccount.model')
const petEvent = require('./petEvent.service')
const petConfig = require('@shared/petConfig')

const SWEEP_INTERVAL_MS = 60 * 60 * 1000 // 1h
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const CAS_RETRY = 2 // CAS 失败重试次数

/**
 * 扫描所有 org 的 PetAccount，执行饥饿衰减 + 死亡判定。
 *
 * @returns {Promise<{scanned: number, decayed: number, died: number, errors: number}>}
 */
async function sweepAll() {
  const now = new Date()
  const stats = { scanned: 0, decayed: 0, died: 0, errors: 0 }

  // 用 cursor 流式处理（万级 collection 不爆内存）
  const cursor = PetAccount.find({ state: 'alive' })
    .select('_id org student tier currentHunger lastFedAt lastHungerDecayAt deathThresholdDays maxHunger eggTier')
    .lean()
    .cursor({ batchSize: 200 })

  for await (const pet of cursor) {
    stats.scanned++
    try {
      await sweepOne(pet, now)
    } catch (e) {
      stats.errors++
      // eslint-disable-next-line no-console
      console.warn(`[petCron] sweep failed: pet=${pet._id} err=${e.message}`)
    }
  }

  return stats
}

/**
 * 处理单个 pet 的衰减 + 死亡判定。
 * 不抛错（外层 sweepAll 兜底）。
 */
async function sweepOne(pet, now) {
  const cfg = petConfig.PET_TIER_CONFIG[pet.tier]
  if (!cfg) return // 异常数据，跳过

  const decayPerHour = cfg.decayPerDay / 24 // 按小时衰减速率
  // 计算自上次衰减以来经过的小时数（向上取整，丢 tick 也能补齐）
  const lastDecayAt = pet.lastHungerDecayAt || pet.hatchedAt || pet.adoptedAt || now
  const elapsedMs = Math.max(0, now.getTime() - new Date(lastDecayAt).getTime())
  const elapsedHours = Math.floor(elapsedMs / HOUR_MS)
  if (elapsedHours <= 0) return // 不需要衰减

  const decayAmount = Math.floor(decayPerHour * elapsedHours)
  if (decayAmount <= 0 && !(pet.currentHunger === 0)) return

  // 1. 应用衰减（CAS）
  const newHunger = Math.max(0, pet.currentHunger - decayAmount)
  let current = pet
  let casOk = false
  for (let i = 0; i < CAS_RETRY; i++) {
    const result = await PetAccount.findOneAndUpdate(
      {
        _id: current._id,
        state: 'alive',
        currentHunger: current.currentHunger,
        lastHungerDecayAt: current.lastHungerDecayAt
      },
      {
        $set: {
          currentHunger: newHunger,
          lastHungerDecayAt: now
        }
      },
      { new: true }
    ).lean()
    if (result) {
      casOk = true
      break
    }
    // 失败：重读
    const fresh = await PetAccount.findById(current._id).lean()
    if (!fresh || fresh.state !== 'alive') return // 状态变了，跳过
    current = fresh
  }
  if (!casOk) {
    // eslint-disable-next-line no-console
    console.warn(`[petCron] CAS failed (hunger): pet=${pet._id}`)
    return
  }

  // 2. 死亡判定：currentHunger=0 且 (now - lastFedAt) >= deathThresholdDays
  if (newHunger === 0 && pet.lastFedAt) {
    const daysAtZero = (now.getTime() - new Date(pet.lastFedAt).getTime()) / DAY_MS
    if (daysAtZero >= pet.deathThresholdDays) {
      await dieAndRebirth(pet, now)
    }
  }
}

/**
 * 死亡 → 同阶回蛋（同一 tick 内完成，状态可观察点 = egg）
 */
async function dieAndRebirth(pet, now) {
  const cfg = petConfig.PET_TIER_CONFIG[pet.tier]
  if (!cfg) return

  // 写 death 事件
  await petEvent.recordEvent({
    orgId: pet.org,
    studentId: pet.student,
    petAccountId: pet._id,
    type: 'death',
    payload: {
      tier: pet.tier,
      hunger: pet.currentHunger,
      daysAtZero: pet.lastFedAt
        ? (now.getTime() - new Date(pet.lastFedAt).getTime()) / DAY_MS
        : null,
      reason: 'hunger'
    }
  })

  // 原子更新：state=egg, level=1, exp=0, hunger=maxHunger, lastFedAt=null
  // species 保留（D2: 死亡是同阶回蛋，species 保留作为"它仍是同一只"的情感延续）
  const updated = await PetAccount.findOneAndUpdate(
    { _id: pet._id, state: 'alive' },
    {
      $set: {
        state: 'egg',
        stateChangedAt: now,
        eggTier: pet.tier, // 同阶回蛋
        eggAdoptedAt: now,
        level: 1,
        experience: 0,
        currentHunger: pet.maxHunger,
        lastFedAt: null,
        lastHungerDecayAt: now
        // species / unlocked / equipped / tier 全部保留
      }
    },
    { new: true }
  ).lean()

  if (!updated) {
    // eslint-disable-next-line no-console
    console.warn(`[petCron] dieAndRebirth failed: pet=${pet._id}`)
    return
  }

  // 写 rebirth 事件
  await petEvent.recordEvent({
    orgId: pet.org,
    studentId: pet.student,
    petAccountId: pet._id,
    type: 'rebirth',
    payload: { tier: pet.tier, fromDeath: true }
  })
}

/**
 * 注册定时任务（require() 时自动启动）。
 */
const sweepTimer = setInterval(async () => {
  try {
    const stats = await sweepAll()
    // eslint-disable-next-line no-console
    console.log(`[petCron] sweep: scanned=${stats.scanned} decayed=${stats.decayed} died=${stats.died} errors=${stats.errors}`)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[petCron] sweepAll failed: ${e.message}`)
  }
}, SWEEP_INTERVAL_MS)
sweepTimer.unref()

module.exports = {
  sweepAll,
  sweepOne,
  dieAndRebirth,
  // 调试/测试用
  _sweepTimer: sweepTimer
}
