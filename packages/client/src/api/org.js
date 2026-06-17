import http from '@/utils/request'

/**
 * 机构信息 API (client / uni-app 端)
 *
 * - getPromotion: 拉机构对外推广信息 (机构主页用; 后端端点 /api/v1/orgs/:id/promotion)
 *   注: 该端点目前要求 org-promotion.read 权限. 家长端访问会被拒,
 *   阶段 2 应在后端补一个公开版 /api/v1/orgs/:id/public, 或允许已登录家长读自己机构的推广
 */
export const orgApi = {
  getPromotion: (orgId) => http.get(`/orgs/${orgId}/promotion`)
}
