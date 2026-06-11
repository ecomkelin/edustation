import http from '@/utils/request'

export const courseInstanceApi = {
  list: (params) => http.get('/course-instances', params),
  detail: (id) => http.get(`/course-instances/${id}`)
}
