/**
 * Org API - 机构 (公开端点 R-0930)
 */
import { http } from './request'

export const orgApi = {
  promotion(orgId) {
    return http.get(`/orgs/${orgId}/promotion`, { skipRefresh: true })
  }
}