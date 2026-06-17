import http from '@/utils/request'

/**
 * 法律协议 API (client / uni-app 端)
 *
 * 后端路由 /api/v1/legal/* 见 packages/server/src/modules/legal/legal.routes.js
 */
export const legalApi = {
  // ── 平台级(公开) ──
  listPlatform: () => http.get('/legal/platform'),
  getPlatform: (key) => http.get(`/legal/platform/${key}`),

  // ── 我的 pending / 同意记录(鉴权) ──
  myPending: () => http.get('/legal/me/pending'),
  recordConsent: (data) => http.post('/legal/me/consents', data),

  // ── 公开读机构协议 (家长 C 端用) ──
  getOrgDoc: (orgId, key) => http.get(`/legal/orgs/${orgId}/legal-docs/${key}`)
}
