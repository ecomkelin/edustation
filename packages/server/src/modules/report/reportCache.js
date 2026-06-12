'use strict'

/**
 * 经营看板进程内缓存（reportCache）
 *
 * 设计目标
 *  ─ 首页 / 5 块二级看板每次打开都会触发多个 $facet / $lookup 聚合，单次 200ms~2s。
 *  ─ 同一机构同一时间窗下，多人 / 多 tab 看到的数据 60s 内没有变化。
 *  ─ 用进程内 Map 做一层轻量缓存：60s TTL + 写操作精准失效。
 *
 * 不做的事
 *  ─ 不做跨实例共享（当前阶段单实例部署够用；上多实例时再换 Redis）。
 *  ─ 不做"切片"物化（CLAUDE.md §16.3 的 MetricSnapshot 留到数据量再起一档再做）。
 *
 * 切片升级指引
 *  ─ Phase 1（当前）：withCache 包裹 service 方法，60s TTL + 写操作 invalidate。
 *  ─ Phase 2（10w+ 订单时）：在 report.service.js 顶部用 MetricSnapshot
 *     把 ① 总览 ② 老师产能 ③ 教室利用率 这 3 块替换为 "today/month 读 snapshot，其它回退实算"。
 *     5 个原 service 方法的导出名不动，前端调用方零改动。
 *
 * 失效粒度
 *  ─ key 形如 `${orgId}:${range}`，invalidate(orgId) 会把该 orgId 下所有 range 都清掉
 *     （业务上写一笔订单同时会影响"今日"和"本月"，与其细判不如全清，简单可靠）。
 */

const DEFAULT_TTL_MS = 60_000

// orgId -> Map<key, { data, expireAt }>
const store = new Map()

/**
 * 读 / 写 缓存
 *  - key 必传（建议 `${orgId}:${range}`，与失效粒度匹配）
 *  - ttlMs 默认 60s
 *  - loader() 抛错时穿透：不缓存失败结果，调用方会拿到原错误
 */
async function withCache(key, loader, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now()
  const [orgId, ...rest] = key.split(':')
  const orgBucket = store.get(orgId)
  if (orgBucket) {
    const hit = orgBucket.get(key)
    if (hit && hit.expireAt > now) return hit.data
    if (hit) orgBucket.delete(key)
  }
  const data = await loader()
  if (!orgBucket) {
    store.set(orgId, new Map())
  }
  store.get(orgId).set(key, { data, expireAt: now + ttlMs })
  return data
}

/**
 * 让某个 orgId 下所有缓存失效（写操作后调用）。
 *  - 不传 orgId = 全清（管理后台批量改数据后兜底用，慎用）
 */
function invalidate(orgId) {
  if (orgId == null) {
    store.clear()
    return
  }
  store.delete(orgId)
}

/**
 * 清空全部（脚本 / 单元测试用）
 */
function clear() {
  store.clear()
}

// 仅供测试/调试：当前缓存条目数
function _size() {
  let n = 0
  for (const m of store.values()) n += m.size
  return n
}

module.exports = {
  withCache,
  invalidate,
  clear,
  _size
}
