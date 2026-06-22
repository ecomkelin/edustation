import http from '@/utils/request'

/**
 * Pet API（2026-06-21 pet-system-v2 客户端）
 */
export const petApi = {
  me: () => http.get('/pet/me'),
  species: () => http.get('/pet/species'),
  items: () => http.get('/pet/items'),
  events: (params) => http.get('/pet/events', { params }),
  adopt: () => http.post('/pet/adopt', {}),
  hatch: () => http.post('/pet/hatch', {}),
  feed: (foodType) => http.post('/pet/feed', { foodType }),
  swapEgg: () => http.post('/pet/swap-egg', {}),
  tierDown: (targetTier) => http.post('/pet/tier-down', { targetTier }),
  equip: (slot, itemKey) => http.post('/pet/equip', { slot, itemKey }),

  // ─── 2026-06-22 pet-shop：宠物商城 ───
  shopList: (params) => http.get('/pet/shop', { params }),
  buyItem: (itemKey) => http.post('/pet/shop/buy-item', { itemKey }),
  buyConsumable: (consumableKey) => http.post('/pet/shop/buy-consumable', { consumableKey })
}
