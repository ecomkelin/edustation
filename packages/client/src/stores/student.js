import { defineStore } from 'pinia'
import { studentApi } from '@/api/student'
import { storage, StorageKeys } from '@/utils/storage'

/**
 * 当前活跃子女（CLAUDE.md §6 重要）。
 *
 * - 家长登录后始终在请求头携带 `x-active-student-id`。
 * - 只有一个孩子时也保留"当前孩子：xx"元素（不跳选择步骤）。
 * - 多个孩子时切换走 /pages/student/switch 页面。
 */
export const useStudentStore = defineStore('student', {
  state: () => ({
    list: [],
    activeStudentId: storage.get(StorageKeys.ACTIVE_STUDENT) || ''
  }),
  getters: {
    activeStudent(state) {
      return state.list.find((s) => String(s.id) === String(state.activeStudentId)) || null
    },
    hasMultiple(state) {
      return state.list.length > 1
    }
  },
  actions: {
    async fetchMyStudents(params = {}) {
      const res = await studentApi.me({ isActive: true, ...params })
      this.list = res.data || []
      // 没有任何缓存的 activeStudentId 时，取主监护人所在的第一个
      if (!this.activeStudentId && this.list.length) {
        const main = this.list.find((s) => s.guardianUser) || this.list[0]
        this.setActive(main.id)
      } else if (this.activeStudentId && !this.list.find((s) => String(s.id) === String(this.activeStudentId))) {
        // 当前缓存的孩子不在列表里 -> 回退到第一个
        if (this.list.length) this.setActive(this.list[0].id)
      }
      return this.list
    },

    setActive(id) {
      this.activeStudentId = id
      storage.set(StorageKeys.ACTIVE_STUDENT, id)
    },

    clear() {
      this.list = []
      this.activeStudentId = ''
      storage.remove(StorageKeys.ACTIVE_STUDENT)
    }
  }
})
