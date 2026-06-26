import http from '../http'

/**
 * 财务流水 API (admin 端, 2026-06-25 立项)
 *
 * 后端基础路径: /api/v1/finance
 *
 *   - list         : 流水列表 (分页 + 多维过滤)
 *   - detail       : 流水详情
 *   - create       : 写一笔流水 (income/expense)
 *   - transfer     : 转账 (双 account 原子写 2 笔)
 *   - summary      : 汇总 (按 reason/account/day/month 分组)
 *
 * 物理删除不暴露 (append-only ledger, 撤销走反向流水)
 */
export const financeTransactionApi = {
  list: (params) => http.get('/finance/transactions', { params }),
  detail: (id) => http.get(`/finance/transactions/${id}`),
  create: (data) => http.post('/finance/transactions', data),
  transfer: (data) => http.post('/finance/transactions/transfer', data),
  summary: (params) => http.get('/finance/transactions/summary', { params })
}
