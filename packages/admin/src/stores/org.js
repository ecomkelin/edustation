import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

export const useOrgStore = defineStore('org', {
  state: () => ({
    list: []
  }),
  getters: {
    currentOrg() {
      const auth = useAuthStore()
      return this.list.find((o) => o.id === auth.currentOrgId) || null
    }
  },
  actions: {
    setList(list) {
      this.list = list
    }
  }
})
