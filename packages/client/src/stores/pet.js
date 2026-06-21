import { defineStore } from 'pinia'
import { petApi } from '@/api/pet'

/**
 * 当前孩子宠物 store（2026-06-21 pet-system-v2）
 *
 * 状态：
 *   - pet: PetAccount 完整数据（含 state/species/tier/level/exp/hunger/unlocked/equipped/...）
 *   - speciesCatalog / itemsCatalog: 图鉴（带解锁 / 装备状态）
 *   - events: 最近事件流
 *   - loading: 各 action 的 loading
 */
export const usePetStore = defineStore('pet', {
  state: () => ({
    pet: null,
    speciesCatalog: null,
    itemsCatalog: null,
    events: [],
    loading: false,
    lastError: null
  }),
  getters: {
    state: (s) => s.pet?.state,
    isEgg: (s) => s.pet?.state === 'egg',
    isAlive: (s) => s.pet?.state === 'alive',
    tier: (s) => s.pet?.tier,
    level: (s) => s.pet?.level,
    exp: (s) => s.pet?.experience,
    nextExpToLevel: (s) => s.pet?.nextExpToLevel,
    tierUpThreshold: (s) => s.pet?.tierUpThreshold,
    hunger: (s) => s.pet?.currentHunger,
    species: (s) => s.pet?.species,
    speciesRecord: (s) => s.pet?.speciesRecord,
    nickname: (s) => s.pet?.nickname,
    unlocked: (s) => s.pet?.unlocked,
    equipped: (s) => s.pet?.equipped
  },
  actions: {
    async fetchMe() {
      this.loading = true
      this.lastError = null
      try {
        const res = await petApi.me()
        this.pet = res.data || null
        return this.pet
      } catch (e) {
        this.lastError = e
        throw e
      } finally {
        this.loading = false
      }
    },
    async fetchSpecies() {
      const res = await petApi.species()
      this.speciesCatalog = res.data
      return this.speciesCatalog
    },
    async fetchItems() {
      const res = await petApi.items()
      this.itemsCatalog = res.data
      return this.itemsCatalog
    },
    async fetchEvents(page = 1, pageSize = 20) {
      const res = await petApi.events({ page, pageSize })
      this.events = res.data?.items || []
      return this.events
    },
    async adopt() {
      const res = await petApi.adopt()
      this.pet = res.data
      return this.pet
    },
    async hatch() {
      const res = await petApi.hatch()
      this.pet = res.data?.petAccount || res.data
      return this.pet
    },
    async feed(foodType) {
      const res = await petApi.feed(foodType)
      this.pet = res.data?.petAccount || null
      return res.data
    },
    async swapEgg() {
      const res = await petApi.swapEgg()
      this.pet = res.data?.petAccount || null
      return res.data
    },
    async tierDown(targetTier) {
      const res = await petApi.tierDown(targetTier)
      this.pet = res.data?.petAccount || null
      return res.data
    },
    async equip(slot, itemKey) {
      const res = await petApi.equip(slot, itemKey)
      this.pet = res.data?.petAccount || null
      return res.data
    },
    async refresh() {
      await this.fetchMe()
    },
    reset() {
      this.pet = null
      this.events = []
    }
  }
})
