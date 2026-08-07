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
  setProfile: (id, data) => http.put(`/students/${id}/profile`, data),

  // 学生详情页 (2026-08-07): R-0408 概览 / R-0409 分域明细
  //   越权 (学员不属于当前 org) → 404 (与 R-0401 详情 404 口径一致)
  overview: (id) => http.get(`/students/${id}/overview`),
  // domain ∈ enrollments|lessonAttendances|studentProducts|orders|
  //          works|pointsTransactions|petEvents
  //   未知 domain → 400
  related: (id, domain, params, opts = {}) =>
    http.get(`/students/${id}/related/${domain}`, { params, ...opts })
}
