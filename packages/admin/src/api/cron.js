import http from './http'

/**
 * 定时任务监控 API (2026-07-13 立项, MM=41)
 *
 * 后端路由 /api/v1/admin/cron/* 见 packages/server/src/modules/cron/cron.routes.js
 *   - R-4101 GET  /admin/cron/status   — 实时状态 (crons + replicas + cronLocks)
 *   - R-4102 POST /admin/cron/:name/tick — 手动 trigger 单个 cron (绕过 leader 锁)
 *   - R-4103 GET  /admin/cron/ticks    — 流水查询 (cron_tick_logs, TTL 30d)
 *
 * 仅平台超管可访问 (后端 requirePlatformAdmin)
 */
export const cronApi = {
  /**
   * 拉取所有 cron 实时状态 + 全局视图 (replicas + cronLocks)
   */
  status: () => http.get('/admin/cron/status'),

  /**
   * 手动触发单个 cron tick
   * @param {string} name cron 名, 后端 6 个之一: taskCron / archiveCron / notificationCron / petCron / loginRateLimitSweep / captchaSweep
   * @returns {Promise<{ok:true, data:{name, durationMs, result, triggeredBy}}>}
   *   进程内已有手动 tick 在跑 → 409 + conflict 详情
   *   cron 不存在或没注册 tickFn → 404
   */
  tick: (name) => http.post(`/admin/cron/${encodeURIComponent(name)}/tick`),

  /**
   * 查 cron_tick_logs 流水 (R-4103)
   * @param {Object} [params]
   * @param {string} [params.name]      cron 名过滤
   * @param {string} [params.source]    'auto' | 'manual' | 'skip'
   * @param {boolean} [params.ok]       成功/失败筛选
   * @param {number} [params.pid]       进程 PID
   * @param {string} [params.from]      ISO 时间, startedAt >= from
   * @param {string} [params.to]        ISO 时间, startedAt <= to
   * @param {number} [params.page=1]
   * @param {number} [params.pageSize=20]  max 100
   */
  ticks: (params = {}) => http.get('/admin/cron/ticks', { params })
}