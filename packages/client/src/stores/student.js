/**
 * Student Store - 当前活跃孩子 (CLAUDE.md §6 重要)
 *
 * - 家长登录后始终在请求头携带 x-active-student-id
 * - 单孩子不跳过选择步骤,顶部永远显示当前孩子
 * - 切换走 /pages/student/switch 页面
 */
import { defineStore } from 'pinia'
import { studentApi } from '@/api/student'
import { storage, StorageKeys } from '@/utils/storage'

export const useStudentStore = defineStore('student', {
  state: () => ({
    list: [],
    activeStudentId: storage.get(StorageKeys.ACTIVE_STUDENT) || '',
    loading: false
  }),
  getters: {
    activeStudent(state) {
      return state.list.find((s) => String(s.id) === String(state.activeStudentId)) || null
    },
    hasMultiple: (state) => state.list.length > 1,
    hasAny: (state) => state.list.length > 0
  },
  actions: {
    async fetchMyStudents(params = {}) {
      this.loading = true
      try {
        const res = await studentApi.me({ isActive: true, ...params })
        // 响应可能是数组,或 {items: []} / {data: []}
        let list = res
        if (res && Array.isArray(res.items)) list = res.items
        else if (res && Array.isArray(res.data)) list = res.data
        else if (!Array.isArray(res)) list = []
        // 2026-07-01:服务端返 _id (mongoose lean),统一映射到 id 字段,后续 setActive/activeStudent/getter 都按 id 走
        this.list = list.map((s) => (s && s._id ? { ...s, id: String(s._id) } : s))
        if (!this.activeStudentId && this.list.length) {
          this.setActive(this.list[0].id)
        } else if (
          this.activeStudentId &&
          !this.list.find((s) => String(s.id) === String(this.activeStudentId))
        ) {
          if (this.list.length) this.setActive(this.list[0].id)
        }
        return this.list
      } finally {
        this.loading = false
      }
    },

    setActive(id) {
      this.activeStudentId = id
      storage.set(StorageKeys.ACTIVE_STUDENT, id)
    },

    clear() {
      this.list = []
      this.activeStudentId = ''
      storage.remove(StorageKeys.ACTIVE_STUDENT)
    },

    /** 拿当前孩子的头像 fallback - 缺图时用 emoji/initial */
    avatarOf(student) {
      if (!student) return ''
      return student.avatar || student.avatarUrl || ''
    }
  }
})