'use strict'

/**
 * 分页参数归一化。
 * @param {object} query req.query
 * @returns {{ page:number, pageSize:number, skip:number, limit:number }}
 */
function normalizePagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize, 10) || 20))
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    limit: pageSize
  }
}

module.exports = { normalizePagination }
