import http from '@/utils/request'

export const courseProductApi = {
  list: (params) => http.get('/course-products', params),
  detail: (id) => http.get(`/course-products/${id}`)
}
