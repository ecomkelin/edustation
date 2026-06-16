'use strict'

const raw = require('./permissions.json')

/**
 * 把分组的权限配置拍平为数组，并提供 group / hasPerm / getPermissionMeta 工具。
 * 前后端都通过 `@shared/permissions` (后端) 或 vite alias 引用。
 *
 * - `groups[i].permissions` 始终是 `string[]`（权限码），`isValidPermission` 依赖这一点。
 * - `groups[i].description` 与 `groups[i].permissionLabels` 是 UI 元数据，可选。
 * - `getPermissionMeta(code)` 把权限码 + 所在组信息聚合成一个对象，供前端渲染提示。
 * - `groups[i].hidden: true` 表示该 group 不暴露给「机构职位 - 可分配权限」列表，
 *   但仍可被 `isValidPermission` / `getPermissionMeta` 识别（用于审计/元数据）。
 *   隐藏的 group 典型是「平台超管专属」(平台管理) 和「已被并入独立 group 的旧码」
 *   (机构基础信息 org.read/org.write —— OrgPromotion 拆分后, 本机构信息由超管直接
 *   在 /orgs/:id 改, 不再走机构内的 Position)。
 */
const groups = raw.groups

const visibleGroups = groups.filter((g) => !g.hidden)

const allPermissions = groups.flatMap((g) => g.permissions)
const visibleAllPermissions = visibleGroups.flatMap((g) => g.permissions)
const allByKey = Object.fromEntries(groups.map((g) => [g.key, g]))

const allByPermission = Object.fromEntries(
  groups.flatMap((g) =>
    (g.permissions || []).map((code) => [
      code,
      {
        groupKey: g.key,
        groupLabel: g.label,
        groupDescription: g.description || '',
        label: (g.permissionLabels && g.permissionLabels[code] && g.permissionLabels[code].label) || code,
        description: (g.permissionLabels && g.permissionLabels[code] && g.permissionLabels[code].description) || ''
      }
    ])
  )
)

/**
 * @param {string} perm e.g. 'student.write'
 * @returns {boolean}
 */
function isValidPermission(perm) {
  return allPermissions.includes(perm)
}

/**
 * 是否「可分配给机构职位」的权限码。hidden group 下的码一律 false。
 * 用于 setPermissions 的权威校验：hidden 码即便前端传过来也会被服务端 drop。
 */
function isAssignablePermission(perm) {
  return visibleAllPermissions.includes(perm)
}

/**
 * 查询单个权限码的元数据（含所在组、中文名、说明）。找不到返回 null。
 * @param {string} code
 * @returns {{groupKey:string, groupLabel:string, groupDescription:string, label:string, description:string} | null}
 */
function getPermissionMeta(code) {
  return allByPermission[code] || null
}

/**
 * @param {string[]} perms
 * @returns {string[]}
 */
function dedupe(perms) {
  return Array.from(new Set(perms))
}

module.exports = {
  groups,
  visibleGroups,
  allPermissions,
  visibleAllPermissions,
  allByKey,
  allByPermission,
  isValidPermission,
  isAssignablePermission,
  getPermissionMeta,
  dedupe
}
