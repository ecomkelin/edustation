import http from './http'
import { useAuthStore } from '@/stores/auth'

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
  unbind: (id, refs) => http.post(`/storage/files/${id}/unbind`, { refs }),

  /**
   * R-3010 GET /storage/files/:id/stream?disposition=inline|attachment&access_token=xxx
   * 2026-07-20: 课件在线预览（默认 inline, 内嵌到 iframe 而不是另存为下载）。
   * 返回完整 URL（含 baseURL），前端嵌入 iframe 或 window.open 即可。
   *
   * iframe 不能设 Authorization header，所以服务端 authenticate 中间件在 query 带 access_token
   * 时也接受（仅 stream 这种 iframe 端点用，其他路由仍强制 header — 走 mws.authenticate 不会变）
   *
   * @param {Object} opts
   * @param {string} opts.id File id
   * @param {'inline'|'attachment'} [opts.disposition] 默认 inline
   */
  stream: ({ id, disposition = 'inline' } = {}) => {
    const auth = useAuthStore()
    const token = auth.accessToken
    const qs = new URLSearchParams()
    if (disposition && disposition !== 'inline') qs.set('disposition', disposition)
    if (token) qs.set('access_token', token)
    const tail = qs.toString() ? `?${qs.toString()}` : ''
    return `${http.defaults.baseURL}/storage/files/${id}/stream${tail}`
  }
}
