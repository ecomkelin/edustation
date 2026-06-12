import http from './http'

/**
 * 经营看板 API 客户端（对应后端 /api/v1/reports/*）
 *
 * 5 个端点对应 5 块看板；后端按 req.orgId 自动做多租户隔离，前端无需传 orgId。
 * 入参 range 默认 'month'；前端只透传用户选择的 range（暂不传 custom from/to）。
 */

export const reportApi = {
  overview: (params) => http.get('/reports/overview', { params }),
  lessonConsumption: (params) => http.get('/reports/lesson-consumption', { params }),
  roomUtilization: (params) => http.get('/reports/room-utilization', { params }),
  teacherProductivity: (params) => http.get('/reports/teacher-productivity', { params }),
  pointsActivity: (params) => http.get('/reports/points-activity', { params })
}
