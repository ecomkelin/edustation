/**
 * Student API - 我的孩子 + 学习画像
 * R-0472 (me) / R-0401 (detail) / R-0406 (profile, admin) / R-0473 (me/stats 跨 kid 聚合) / R-0474 (me/profile, 家长 C 端)
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

  // admin 端: R-0406, 需要 student.read 权限码; 教务/老师/超管用
  profile(id) {
    return http.get(`/students/${id}/profile`)
  },

  // R-0474: 家长 C 端专享, 跳过 requirePermission (家长 Position 通常无 student.* 权限)
  // 走 x-active-student-id + activeStudent 中间件校验 "我是该 kid 监护人"
  // 2026-07-11: 家长 Position 移权限后, C 端首页 loadProfile 改走这里
  myProfile() {
    return http.get('/students/me/profile')
  }
}