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

  /**
   * 签署协议 (单条)
   * 后端 /legal/me/consents 是批量数组接口, C 端一次签 1 份时自动包成数组
   * @param {Object} arg
   * @param {string} arg.key    - 协议 key (如 'user-agreement')
   * @param {string} arg.version - 版本号 (semver 'x.y.z')
   * @param {'platform'|'org'} arg.type - 协议类型 (平台还是机构)
   * @param {string|null} arg.orgId - 机构协议时的 org ObjectId, 平台协议为 null
   */
  sign({ key, version, type = 'platform', orgId = null }) {
    return http.post('/legal/me/consents', {
      consents: [{
        key,
        version,
        type,
        org: orgId || null
      }]
    })
  },

  history(params = {}) {
    return http.get('/legal/me/consents', { data: params })
  }
}