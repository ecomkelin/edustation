import http from './http'

export const studentApi = {
  list: (params) => http.get('/students', { params }),
  detail: (id) => http.get(`/students/${id}`),
  create: (data) => http.post('/students', data),
  update: (id, data) => http.put(`/students/${id}`, data),
  // 误操删除（超管 + 二次密码 + 互锁检查）
  remove: (id, { password } = {}) => http.delete(`/students/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/students/${id}/removable-check`),
  setGuardians: (id, guardians) => http.put(`/students/${id}/guardians`, { guardians }),
  setBlocked: (id, isBlocked, reason = '') =>
    http.put(`/students/${id}/${isBlocked ? 'block' : 'unblock'}`, { isBlocked: true, reason }),
  me: () => http.get('/students/me'),

  // 学生学习画像 (2026-06 新增) — 6 字段结构化画像, 与 notes (过敏史) 完全独立
  getProfile: (id) => http.get(`/students/${id}/profile`),
  setProfile: (id, data) => http.put(`/students/${id}/profile`, data)
}
