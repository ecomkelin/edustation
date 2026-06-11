'use strict'

const raw = require('./permissions.json')

/**
 * 把分组的权限配置拍平为数组，并提供 group / hasPerm / getPermissionMeta 工具。
 * 前后端都通过 `@shared/permissions` (后端) 或 vite alias 引用。
 *
 * - `groups[i].permissions` 始终是 `string[]`（权限码），`isValidPermission` 依赖这一点。
 * - `groups[i].description` 与 `groups[i].permissionLabels` 是 UI 元数据，可选。
 * - `getPermissionMeta(code)` 把权限码 + 所在组信息聚合成一个对象，供前端渲染提示。
 */
const groups = raw.groups

const allPermissions = groups.flatMap((g) => g.permissions)
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
  allPermissions,
  allByKey,
  allByPermission,
  isValidPermission,
  getPermissionMeta,
  dedupe
}
