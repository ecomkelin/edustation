/**
 * Pet API - 宠物 (C 端)
 * R-2272 me / R-2200 events / R-2206 species / R-2207 items
 * R-2263 adopt / R-2264 hatch / R-2265 feed / R-2266 equip
 * R-2267 swap-egg / R-2268 tier-down
 */
import { http } from './request'

export const petApi = {
  me() {
    return http.get('/pet/me')
  },

  events(params = {}) {
    return http.get('/pet/events', { data: params })
  },

  species(params = {}) {
    return http.get('/pet/species', { data: params })
  },

  items(params = {}) {
    return http.get('/pet/items', { data: params })
  },

  adopt(data = {}) {
    return http.post('/pet/adopt', data)
  },

  hatch() {
    return http.post('/pet/hatch', {})
  },

  feed(data) {
    return http.post('/pet/feed', data)
  },

  equip(data) {
    return http.post('/pet/equip', data)
  },

  swapEgg(data = {}) {
    return http.post('/pet/swap-egg', data)
  },

  tierDown(data) {
    return http.post('/pet/tier-down', data)
  }
}