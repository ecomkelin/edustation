/**
 * AccessControl API - 门禁/接送 (C 端)
 * R-2970 enroll-my-child / R-2971 enroll-self
 * R-2972/2973/2974 pickups CRUD
 * R-2975 access-events my-child / R-2978 as-pickup
 * R-2943 consent my / R-2944 sign / R-2945 withdraw
 */
import { http } from './request'

export const accessControlApi = {
  // 人脸录入
  enrollChild(data) {
    return http.post('/access-control/client/face-profiles/enroll-my-child', data)
  },
  enrollSelf(data) {
    return http.post('/access-control/client/face-profiles/enroll-self', data)
  },

  // 接送授权
  listPickups(params = {}) {
    return http.get('/access-control/client/pickups', { data: params })
  },
  createPickup(data) {
    return http.post('/access-control/client/pickups', data)
  },
  revokePickup(id) {
    return http.post(`/access-control/client/pickups/${id}/revoke`)
  },

  // 进出记录
  myChildEvents(params = {}) {
    return http.get('/access-control/client/access-events/my-child', { data: params })
  },
  asPickupEvents(params = {}) {
    return http.get('/access-control/client/access-events/as-pickup', { data: params })
  },

  // 同意书
  myConsent() {
    return http.get('/access-control/client/consent/my')
  },
  signConsent(data) {
    return http.post('/access-control/client/consent/sign', data)
  },
  withdrawConsent(id, data) {
    return http.post(`/access-control/client/consent/${id}/withdraw`, data)
  }
}