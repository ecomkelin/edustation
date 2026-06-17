import http from './http'

/**
 * 法律协议 API
 *
 * 后端路由 /api/v1/legal/* 见 packages/server/src/modules/legal/legal.routes.js
 * http.js 拦截器已解包业务响应,调用方拿到的 res.data 即业务 data 字段
 */
export const legalApi = {
  // ── 平台级(公开) ──
  listPlatform: () => http.get('/legal/platform'),
  getPlatform: (key) => http.get(`/legal/platform/${key}`),

  // ── 我的 pending / 同意记录(鉴权) ──
  myPending: () => http.get('/legal/me/pending'),
  recordConsent: (data) => http.post('/legal/me/consents', data),
  myConsents: (params) => http.get('/legal/me/consents', { params }),

  // ── 机构级 CRUD ──
  listOrgDocs: (orgId, params) => http.get(`/legal/orgs/${orgId}/legal-docs`, { params }),
  getOrgDoc: (orgId, key) => http.get(`/legal/orgs/${orgId}/legal-docs/${key}`),
  updateOrgDoc: (orgId, key, data) => http.put(`/legal/orgs/${orgId}/legal-docs/${key}`, data),
  orgDocHistory: (orgId, key) => http.get(`/legal/orgs/${orgId}/legal-docs/${key}/history`),
  disableOrgDoc: (orgId, key) => http.post(`/legal/orgs/${orgId}/legal-docs/${key}/disable`)
}
