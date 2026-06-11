import { defineStore } from 'pinia'
import { petApi } from '@/api/pet'

/**
 * 当前孩子宠物。
 * 阶段 2 stub 状态：先展示从 /pet/me 拿到的数据，"喂养"为占位操作。
 */
export const usePetStore = defineStore('pet', {
  state: () => ({
    pet: null,
    loading: false
  }),
  actions: {
    async fetchMe() {
      this.loading = true
      try {
        const res = await petApi.me()
        this.pet = res.data || null
        return this.pet
      } finally {
        this.loading = false
      }
    },
    async feed(foodType = 'normal') {
      const res = await petApi.feed({ foodType })
      if (res.data && res.data.pet) {
        this.pet = { ...(this.pet || {}), ...res.data.pet }
      }
      return res.data
    },
    reset() {
      this.pet = null
    }
  }
})
