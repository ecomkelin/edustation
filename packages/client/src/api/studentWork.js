import http from '@/utils/request'

export const studentWorkApi = {
  // 家长端：按孩子列作品（支持 lessonSchedule / lessonAttendance / subject / student 过滤）
  list: (params) => http.get('/student-works', params),
  // 作品详情（替代原"从 list 过滤"的 hack）
  detail: (id) => http.get(`/student-works/${id}`),
  // 上传作品（家长上传孩子课外作品或老师布置的）
  // 入参：{ lessonAttendance, title, description, filePaths }
  upload: ({ lessonAttendance, title, description, filePaths }) => {
    // 一个 work 通常配 1 个文件（服务端允许多文件）；这里逐个上传合并到一次创建
    // 简化：只支持单文件上传
    const filePath = (filePaths && filePaths[0]) || ''
    return http.upload('/student-works', filePath, {
      lessonAttendance,
      title,
      description
    })
  },
  remove: (id) => http.delete(`/student-works/${id}`)
}
