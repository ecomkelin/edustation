/**
 * Pet Shop API - 宠物商城 (C 端)
 * R-2370 shop list / R-2371 buy-item / R-2372 buy-consumable
 */
import { http } from './request'

export const petShopApi = {
  shop(params = {}) {
    return http.get('/pet/shop', { data: params })
  },

  buyItem(data) {
    return http.post('/pet/shop/buy-item', data)
  },

  buyConsumable(data) {
    return http.post('/pet/shop/buy-consumable', data)
  }
}