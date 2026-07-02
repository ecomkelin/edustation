import http from './http'

export const studentWorkApi = {
  list: (params) => http.get('/student-works', { params }),
  detail: (id) => http.get(`/student-works/${id}`),
  /**
   * 创建作品。文件先经 /storage/upload-many?scope=work 上传后拿到 fileIds，
   * 再以 JSON 形式调本端点。
   * 入参：{ lessonAttendance, title, fileIds: [id...], description?, level? }
   */
  create: (payload) => http.post('/student-works', payload),
  // 员工编辑：title / description / fileUrls / level
  update: (id, payload) => http.patch(`/student-works/${id}`, payload),
  remove: (id, { password } = {}) => http.delete(`/student-works/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/student-works/${id}/removable-check`),
  /**
   * R-1606 GET /student-works/stats
   * 顶部 KPI：本期作品数 / 已评数 / 未评数 / 平均等级，对比上一期
   * 入参：所有过滤维度 + createdAtFrom / createdAtTo（不传默认本月）
   */
  stats: (params = {}) => http.get('/student-works/stats', { params }),
  /**
   * R-1640 GET /student-works/export.csv
   * CSV 导出 (BOM + ; 分隔, Excel 友好)。前端用 fetch + Blob 下载避免 axios 拦截器污染 (仿 AuditLogs)。
   */
  buildExportCsvUrl: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString()
    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
    return `${baseURL}/student-works/export.csv${qs ? `?${qs}` : ''}`
  }
}
