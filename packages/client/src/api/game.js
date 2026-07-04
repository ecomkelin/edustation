/**
 * Game API - 平台小游戏 (R-3700/3701/3702)
 * 公开端点无需权限码; play 需鉴权
 * 2026-07-04: play(id, body) 接受 { durationMs } 上报游玩时长
 */
import { http } from './request'

export const gameApi = {
  // R-3700 GET /games
  list(params = {}) {
    return http.get('/games', { data: params })
  },
  // R-3701 GET /games/:id
  detail(id) {
    return http.get(`/games/${id}`)
  },
  // R-3702 POST /games/:id/play — 启动计数 +1 (需鉴权) + engagement event (durationMs)
  play(id, body = {}) {
    return http.post(`/games/${id}/play`, body)
  }
}
