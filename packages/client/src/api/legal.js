/**
 * Legal API - 协议
 * R-3172 pending / R-3173 consents / R-3174 consents history
 * R-3100 platform / R-3101 platform/:key
 * R-3131 orgs/:orgId/legal-docs/:key
 */
import { http } from './request'

export const legalApi = {
  platform() {
    return http.get('/legal/platform', { skipRefresh: true })
  },

  platformDoc(key) {
    return http.get(`/legal/platform/${key}`, { skipRefresh: true })
  },

  orgDoc(orgId, key) {
    return http.get(`/legal/orgs/${orgId}/legal-docs/${key}`, { skipRefresh: true })
  },

  pending() {
    return http.get('/legal/me/pending')
  },

  sign(data) {
    return http.post('/legal/me/consents', data)
  },

  history(params = {}) {
    return http.get('/legal/me/consents', { data: params })
  }
}