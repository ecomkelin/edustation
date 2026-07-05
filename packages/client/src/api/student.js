/**
 * Student API - 我的孩子 + 学习画像
 * R-0472 (me) / R-0401 (detail) / R-0406 (profile) / R-0473 (me/stats 跨 kid 聚合)
 */
import { http } from './request'

export const studentApi = {
  me(params = {}) {
    return http.get('/students/me', { data: params })
  },

  // 2026-07-05: 跨 kid 一次性聚合 stat (剩余课时 / 积分 / 近 7 天课程)
  // 用于 C 端"我的"页 kid-card 自带 stat
  statsMyKids() {
    return http.get('/students/me/stats')
  },

  detail(id) {
    return http.get(`/students/${id}`)
  },

  profile(id) {
    return http.get(`/students/${id}/profile`)
  }
}