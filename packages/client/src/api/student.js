import http from '@/utils/request'

export const studentApi = {
  // 家长端：当前机构下的子女
  me: (params) => http.get('/students/me', params),
  // 详情
  detail: (id) => http.get(`/students/${id}`),
  // 列出（运营端用得多，家长端不直接用）
  list: (params) => http.get('/students', params)
}
