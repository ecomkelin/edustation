/**
 * Org API - 机构
 *
 * R-0930 GET /orgs/:id/promotion   推广 (员工权限)
 * R-0931 PUT /orgs/:id/promotion   更新推广 (员工权限)
 * R-0932 GET /orgs/:id/public      公开机构主页 (2026-07-02 立项 C 端 4 tab 重构)
 *                                  登入家长可访问, 无 employee 权限码
 *                                  只返白名单字段 (logo / name / address / 联系方式 / promotion 摘要)
 *                                  隐藏 socialCreditCode / legalPerson / licenseNumber / principal
 */
import { http } from './request'

export const orgApi = {
  // 员工端: 推广位 (admin 端维护, 走 org-promotion.read)
  promotion(orgId) {
    return http.get(`/orgs/${orgId}/promotion`, { skipRefresh: true })
  },

  // C 端家长: 公开机构主页 (登入即可, 无 PERM)
  public(orgId) {
    return http.get(`/orgs/${orgId}/public`)
  }
}
