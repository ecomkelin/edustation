import http from './http'

/**
 * 家长端积分 API
 *   - me            : 当前激活子女的账户 + 最近流水
 *   - transactions  : 流水分页
 *   - earn          : [internal-only] 内部触发入账（阶段 3 分享得积分等业务使用）
 */
export const pointsApi = {
  me: (params) => http.get('/points/me', { params }),
  earn: (data) => http.post('/points/earn', data),
  transactions: (params) => http.get('/points/transactions', { params })
}
