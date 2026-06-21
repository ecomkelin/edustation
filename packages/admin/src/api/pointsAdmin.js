import http from './http'

/**
 * 积分管理（admin 端）API（2026-06-21 新增）
 *
 * 后端基础路径：/api/v1/points-admin
 *
 *   - listAccounts       : 学生余额列表（分页 + 搜索 + 排序）
 *   - getAccount         : 单个学员账户 + 最近流水
 *   - adjust             : 手动调整积分（加/扣分）
 *   - listTransactions   : 全机构流水（分页 + 过滤）
 *   - listReasons        : 活跃积分原因（下拉用）
 */
export const pointsAdminApi = {
  listAccounts: (params) => http.get('/points-admin/accounts', { params }),
  getAccount: (studentId) => http.get(`/points-admin/accounts/${studentId}`),
  adjust: (studentId, body) => http.post(`/points-admin/accounts/${studentId}/adjust`, body),
  listTransactions: (params) => http.get('/points-admin/transactions', { params }),
  listReasons: () => http.get('/points-admin/reasons')
}
