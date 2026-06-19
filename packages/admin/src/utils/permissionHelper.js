/**
 * 权限辅助函数 (2026-06-19 抽取)
 *
 * 背景: ParentDetailDialog 内已有一段 `hasPerm` 内联函数, 每次调用都会 re-iterate 当前
 *   org 的所有职位 permissions 拼成 Set 后查; 多个组件要复用, 抽到此处。
 *
 * 替代文件: 原 utils/permissions.js 当前装的是 authApi (命名错位, 历史遗留), 故不复用,
 *   单独建 permissionHelper.js, 职责清晰。
 *
 * 设计: 接收 Pinia auth store + 权限码, 返回 boolean。
 *   - 平台超管 (user.isPlatformAdmin=true) 默认拥有所有权限。
 *   - 其他用户: 查 authStore.orgs 里 currentOrgId 对应的 org, 遍历其 positions[*].permissions。
 */
export function hasPermInOrg(authStore, code) {
  if (!authStore?.user) return false
  if (authStore.user.isPlatformAdmin) return true
  const org = (authStore.orgs || []).find((o) => o.id === authStore.currentOrgId)
  if (!org) return false
  const perms = new Set()
  for (const p of org.positions || []) {
    for (const c of p.permissions || []) perms.add(c)
  }
  return perms.has(code)
}