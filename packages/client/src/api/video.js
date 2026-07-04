/**
 * Video API - 平台科普视频 (R-3800/3801/3802/3803)
 * 公开端点无需权限码; play 需鉴权
 * 2026-07-04: play(id, body) 接受 { durationMs } 上报观看时长
 */
import { http } from './request'

export const videoApi = {
  // R-3800 GET /videos/featured — 探索 tab 默认展示 1 个
  featured() {
    return http.get('/videos/featured')
  },
  // R-3801 GET /videos — C 端全量分页
  list(params = {}) {
    return http.get('/videos', { data: params })
  },
  // R-3802 GET /videos/:id — 视频详情
  detail(id) {
    return http.get(`/videos/${id}`)
  },
  // R-3803 POST /videos/:id/play — 播放计数 +1 (需鉴权) + engagement event (activeStudentId+durationMs)
  play(id, body = {}) {
    return http.post(`/videos/${id}/play`, body)
  }
}
