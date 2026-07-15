/**
 * Pet API - 宠物 (C 端；2026-07-15 重构：多宠 + petId 化 + 无装饰)
 * R-2272 me(默认宠物) / R-2208 list / R-2200 events / R-2206 species / consumables
 * R-2263 adopt / R-2264 :petId/hatch / R-2265 :petId/feed / R-2269 :petId/set-default
 */
import { http } from './request'

export const petApi = {
  me() {
    return http.get('/pet/me')
  },

  // 该学员全部宠物（默认宠物在前）
  list() {
    return http.get('/pet/list')
  },

  events(params = {}) {
    return http.get('/pet/events', { data: params })
  },

  species(params = {}) {
    return http.get('/pet/species', { data: params })
  },

  // 食物图鉴
  consumables(params = {}) {
    return http.get('/pet/consumables', { data: params })
  },

  // 领养一只新宠物（≤ 上限）
  adopt(data = {}) {
    return http.post('/pet/adopt', data)
  },

  hatch(petId) {
    return http.post(`/pet/${petId}/hatch`, {})
  },

  feed(petId, data) {
    return http.post(`/pet/${petId}/feed`, data)
  },

  setDefault(petId) {
    return http.post(`/pet/${petId}/set-default`, {})
  }
}
