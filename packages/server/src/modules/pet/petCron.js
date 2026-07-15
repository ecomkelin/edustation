'use strict'

/**
 * 宠物饥饿衰减 + 死亡 cron（pet-system-v2 2026-06-21；2026-06-23 饱腹度改造）
 *
 * 行为（参照 D1：cron 写 + read 纯展示）：
 *   - 每 1 小时扫一次所有 org 的 PetAccount
 *   - 对 state='alive' 的宠物按 SiteConfig.pet.hungerDecayMinutes 计算应扣点数
 *   - 用 CAS（带 lastHungerDecayAt 守卫）保证并发安全
 *   - CAS 失败 retry 2 次；连续失败 log 告警
 *   - 当 currentHunger=0 且 (now - lastFedAt) >= deathThresholdDays：
 *     - 同一 tick 内：state=dead → state=egg (rebirth)
 *     - level=1, exp=0, hunger=maxHunger, lastFedAt=null
 *     - 写 PetEvent type=death + type=rebirth
 *
 * 衰减间隔（2026-06-23）：
 *   - 平台超管可配置 SiteConfig.pet.hungerDecayMinutes（默认 30 分钟/点）
 *   - 整数 ≥1，可设 1 分钟/点 或 1440 分钟/点（1 天/点）
 *   - 每个 tick 算 elapsedMinutes / hungerDecayMinutes = 应扣点数
 *
 * 设计：
 *   - 与 captcha.service 一样用 setInterval(...).unref()（不阻塞进程退出）
 *   - 手动 sweepNow() 暴露给 admin 端"立即跑一次"按钮（调试用）
 *
 * K8s 丢 tick 风险（参照 R1 应对）：
 *   - 单次 tick 内取 elapsed 全量补偿（不是按 tick 增量算）
 *   - 丢 1 个 tick = 最多 1h 衰减未扣，可接受
 */

const PetAccount = require('@models/PetAccount.model')
const PetSpecies = require('@models/PetSpecies.model')
const petEvent = require('./petEvent.service')
// 2026-07-13: siteConfigService 已不再用 (getHungerDecayMinutes 在 2026-06-23 删),
//   PetSpecies.hungerDecayMinutes 是单一来源
const cronRegistry = require('@modules/common/cronRegistry')
const cronLogger = require('@modules/common/cronLogger')
const cronLock = require('@modules/common/cronLock')

const SWEEP_INTERVAL_MS = 60 * 60 * 1000 // 1h
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const CAS_RETRY = 2 // CAS 失败重试次数

// 2026-06-23 饱腹度衰减间隔优先级 (用户决策 2026-06-23, C方案: 物种是唯一来源):
//   1) PetSpecies.hungerDecayMinutes  (物种决定, 默认 60)
//   2) SiteConfig.pet.hungerDecayMinutes (平台级兜底, 30)
async function resolveHungerDecayMinutes(pet, platformDefault) {
  if (pet.species) {
    const sp = await PetSpecies.findOne({ key: pet.species }).select('hungerDecayMinutes').lean()
    if (sp?.hungerDecayMinutes && sp.hungerDecayMinutes > 0) return sp.hungerDecayMinutes
  }
  return platformDefault
}

/**
 * 扫描所有 org 的 PetAccount，执行饥饿衰减 + 死亡判定。
 *
 * @returns {Promise<{scanned: number, decayed: number, died: number, errors: number}>}
 */
async function sweepAll() {
  const now = new Date()
  const stats = { scanned: 0, decayed: 0, died: 0, errors: 0 }

  // 2026-07-13 修: siteConfigService.getHungerDecayMinutes 在 2026-06-23 已删
  // (PetSpecies.hungerDecayMinutes 物种级统一控制, 平台级 fallback 用 species 默认值 60)
  // 之前是隐式抛错, 新 cronLogger 上线后每 1h tick 都会打 fail, 现在改硬编码 60
  const hungerDecayMinutes = 60
  const decayMs = hungerDecayMinutes * MINUTE_MS

  // 用 cursor 流式处理（万级 collection 不爆内存）
  const cursor = PetAccount.find({ state: 'alive' })
    .select('_id org student currentHunger lastFedAt lastHungerDecayAt deathThresholdDays maxHunger')
    .lean()
    .cursor({ batchSize: 200 })

  for await (const pet of cursor) {
    stats.scanned++
    try {
      // 2026-06-23: per-pet / species / 平台级 三级优先级解析
      const petDecayMinutes = await resolveHungerDecayMinutes(pet, hungerDecayMinutes)
      const result = await sweepOne(pet, now, petDecayMinutes * MINUTE_MS)
      if (result === 'decayed') stats.decayed++
      else if (result === 'died') stats.died++
      else if (result === 'die_error') stats.errors++  // dieAndRebirth 自身报错 (数据异常)
      // 'cas_failed' / null: 静默跳过, 不计数 (并发改了 state)
    } catch (e) {
      stats.errors++
      cronLogger.fail('petCron', e, { pet: pet._id })
    }
  }

  return stats
}

/**
 * 处理单个 pet 的衰减 + 死亡判定。
 * 不抛错（外层 sweepAll 兜底）。
 *
 * @returns {'decayed'|'died'|null} 本次操作结果（用于 sweepAll 统计）
 */
async function sweepOne(pet, now, decayMs) {
  // 计算自上次衰减以来经过的分钟数（向上取整，丢 tick 也能补齐）
  const lastDecayAt = pet.lastHungerDecayAt || pet.hatchedAt || pet.adoptedAt || now
  const elapsedMs = Math.max(0, now.getTime() - new Date(lastDecayAt).getTime())
  const elapsedMinutes = Math.floor(elapsedMs / MINUTE_MS)
  if (elapsedMinutes <= 0) return null // 不需要衰减

  // 2026-06-23: 每个 decayMs 扣 1 点（per-pet / species / 平台级 解析后传入）
  const decayAmount = Math.floor(elapsedMs / decayMs)
  if (decayAmount <= 0 && pet.currentHunger !== 0) return null

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
    if (!fresh || fresh.state !== 'alive') return null // 状态变了，跳过
    current = fresh
  }
  if (!casOk) {
    // eslint-disable-next-line no-console
    console.warn(`[petCron] CAS failed (hunger): pet=${pet._id}`)
    return null
  }

  // 2. 死亡判定：currentHunger=0 且 (now - lastFedAt) >= deathThresholdDays
  if (newHunger === 0 && pet.lastFedAt) {
    const daysAtZero = (now.getTime() - new Date(pet.lastFedAt).getTime()) / DAY_MS
    if (daysAtZero >= pet.deathThresholdDays) {
        const result = await dieAndRebirth(pet, now)
        if (result === 'ok') {
          return 'died'
        }
        // 'cas_failed': 并发改了 state, 静默跳过, 不算 died 也不算 error
        return null
      }
  }
  return 'decayed'
}

/**
 * 死亡 → 回蛋（同一 tick 内完成，状态可观察点 = egg）
 *
 * 2026-07-15 重构：去等阶后回蛋清 species（下次 hatch 全池重随机），
 * 不再依赖 PET_TIER_CONFIG。
 *
 * 原子化:
 *   1. atomic state update (CAS: state='alive' AND currentHunger=0)
 *   2. 写 death + rebirth 2 个 event, 用确定性 eventKey 幂等
 *   3. event 写失败仅 log, 不影响状态 (state 是 source of truth)
 *
 * @returns {Promise<'ok'|'cas_failed'>}
 */
async function dieAndRebirth(pet, now) {
  // 1. 原子状态更新 (CAS): 仅当 state 仍是 'alive' + hunger 仍是 0 才更新
  const updated = await PetAccount.findOneAndUpdate(
    { _id: pet._id, state: 'alive', currentHunger: 0 },
    {
      $set: {
        state: 'egg',
        stateChangedAt: now,
        eggAdoptedAt: now,
        species: null,       // 回蛋清 species，下次 hatch 全池重随机
        level: 1,
        experience: 0,
        currentHunger: pet.maxHunger,
        lastFedAt: null,
        lastHungerDecayAt: now
      }
    },
    { new: true }
  ).lean()

  if (!updated) {
    // CAS 失败: 状态已经被其他进程/操作改过, 跳过 (不算 died)
    return 'cas_failed'
  }

  // 2. 写 2 条事件 (幂等 — 用确定性 eventKey, 同分钟重试触发 duplicate key 被 recordEvent 吞掉)
  const minuteBucket = Math.floor(now.getTime() / 60_000)
  const deathEventKey = `pet_death_${pet._id}_${minuteBucket}`
  const rebirthEventKey = `pet_rebirth_${pet._id}_${minuteBucket}`
  const daysAtZero = pet.lastFedAt
    ? (now.getTime() - new Date(pet.lastFedAt).getTime()) / DAY_MS
    : null

  await petEvent.recordEvent({
    eventKey: deathEventKey,
    orgId: pet.org,
    studentId: pet.student,
    petAccountId: pet._id,
    type: 'death',
    payload: {
      hunger: pet.currentHunger,
      daysAtZero,
      reason: 'hunger'
    }
  })

  await petEvent.recordEvent({
    eventKey: rebirthEventKey,
    orgId: pet.org,
    studentId: pet.student,
    petAccountId: pet._id,
    type: 'rebirth',
    payload: { fromDeath: true }
  })

  return 'ok'
}

/**
 * 注册定时任务（require() 时自动启动）。
 * 2026-07-13: leaderElect=true — petCron 写 PetEvent (death/rebirth), 多副本会重复事件
 */
const helper = cronRegistry.register('petCron', SWEEP_INTERVAL_MS, { leaderElect: true })

const sweepTimer = setInterval(async () => {
  // 多副本场景: 抢不到锁就跳过
  if (!(await cronLock.acquire('petCron'))) {
    helper.skip()
    return
  }
  const start = helper.start()
  try {
    const stats = await sweepAll()
    // 始终打日志: pet cron 每个 tick 都跑, 用 errors 字段区分健康状态
    cronLogger.tick('petCron', stats)
    helper.finish(null, start, stats)
  } catch (e) {
    helper.finish(e, start)
    cronLogger.fail('petCron', e, { where: 'sweepAll' })
  } finally {
    await cronLock.release('petCron')
  }
}, SWEEP_INTERVAL_MS)
sweepTimer.unref()
helper.attachTimer(sweepTimer)

module.exports = {
  sweepAll,
  sweepOne,
  dieAndRebirth,
  // 调试/测试用
  _sweepTimer: sweepTimer
}

// 2026-07-13 R-4102: 手动 trigger 端点用
cronRegistry.setTickFn('petCron', () => sweepAll())
