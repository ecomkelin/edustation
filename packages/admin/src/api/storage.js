import http from './http'

/**
 * 统一文件管理 API
 *
 * 所有上传/下载/删除/引用追踪都走这里；业务模块（头像 / 作品 / 附件）通过 scope 区分。
 */

export const storageApi = {
  /**
   * 单文件上传。fields: { file: File, scope: 'avatar'|'work'|... }
   * 走 multipart/form-data。
   */
  upload: ({ file, scope }) => {
    const fd = new FormData()
    fd.append('file', file)
    return http.post(`/storage/upload?scope=${scope}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  /**
   * 多文件上传。
   */
  uploadMany: ({ files, scope }) => {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    return http.post(`/storage/upload-many?scope=${scope}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  list: (params) => http.get('/storage/files', { params }),
  detail: (id) => http.get(`/storage/files/${id}`),
  remove: (id) => http.delete(`/storage/files/${id}`),
  removableCheck: (id) => http.get(`/storage/files/${id}/removable-check`),
  bind: (id, refs) => http.post(`/storage/files/${id}/bind`, { refs }),
  unbind: (id, refs) => http.post(`/storage/files/${id}/unbind`, { refs })
}
