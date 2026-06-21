import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'

/**
 * useUserPerms (2026-06-21 pet-system-v2 立项)
 *
 * 前端权限判断的 composable 封装，替代在 setup() 中反复写：
 *   const auth = useAuthStore()
 *   const can = hasPermInOrg(auth, 'pet.write')
 *
 * 用法：
 *   const { can, canAny, canAll } = useUserPerms()
 *   <el-button v-if="can('pet.write')">保存</el-button>
 *
 * 平台超管 (isPlatformAdmin=true) 默认所有 has() 返回 true（hasPermInOrg 已实现）。
 *
 * 与父组件的 useAuthStore() 共享响应性：positions 改变时 perm 也会更新。
 */
export function useUserPerms() {
  const auth = useAuthStore()

  const can = (code) => computed(() => hasPermInOrg(auth, code))
  const canAny = (...codes) => computed(() => codes.some((c) => hasPermInOrg(auth, c)))
  const canAll = (...codes) => computed(() => codes.every((c) => hasPermInOrg(auth, c)))

  return {
    /** 单权限判断，返回 computed<boolean> */
    can,
    /** 多权限任一即可 */
    canAny,
    /** 多权限全部满足 */
    canAll,
    /** 直接用 auth store（避免额外 useAuthStore） */
    auth
  }
}
