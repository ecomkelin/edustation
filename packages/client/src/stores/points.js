import { defineStore } from 'pinia'
import { pointsApi } from '@/api/points'

/**
 * 积分账户（家长端当前孩子）。首页/宠物页用到。
 */
export const usePointsStore = defineStore('points', {
  state: () => ({
    balance: 0,
    student: null,
    loading: false
  }),
  actions: {
    async fetchMe() {
      this.loading = true
      try {
        const res = await pointsApi.me()
        this.balance = res.data?.balance || 0
        this.student = res.data?.student || null
        return this.balance
      } finally {
        this.loading = false
      }
    },
    reset() {
      this.balance = 0
      this.student = null
    }
  }
})
