import http from '@/utils/request'

export const lessonScheduleApi = {
  list: (params) => http.get('/lesson-schedules', params),
  detail: (id) => http.get(`/lesson-schedules/${id}`),
  calendar: (params) => http.get('/lesson-schedules/calendar', params)
}
