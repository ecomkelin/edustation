/**
 * Storage API - 文件上传/管理 (R-3000~R-3007)
 * C 端只需 upload (无 storage.write 门控)
 */
import { http, upload } from './request'

export const storageApi = {
  upload(filePath, opts = {}) {
    return upload('/storage/upload', filePath, opts.formData || {}, opts)
  },

  uploadMany(filePaths) {
    return Promise.all(filePaths.map((p) => upload('/storage/upload', p)))
  },

  list(params = {}) {
    return http.get('/storage/files', { data: params })
  },

  detail(id) {
    return http.get(`/storage/files/${id}`)
  }
}