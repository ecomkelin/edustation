/**
 * 前后端共享枚举 — ESM 入口 (2026-06 新增).
 *
 * 背景: shared/enums.js 是 CommonJS, server 端 require 解构工作正常.
 *       Vite admin 前端需要 named import, 但 CJS 直接被浏览器执行会报
 *       `exports is not defined` / `module is not defined`.
 *
 * 配套改造 (2026-06):
 *   - shared/enums.js: 末尾导出改为 `exports.X = X` (esbuild 能静态识别)
 *     + `module.exports = exports` 兜底 (server 端 require 仍能解构拿完整对象)
 *   - packages/admin/vite.config.js: optimizeDeps.include 加 '@shared/enums.js',
 *     强制 Vite 在 dev 模式下也走 esbuild CJS interop (把 CJS 包成 ESM `__commonJS` 包装)
 *   - 本文件 (shared/enums.mjs): ESM 转发层, 给前端 named import 用.
 *     这里用 `@shared/enums.js` 而不是 `./enums.js` 是为了命中
 *     resolve.alias + optimizeDeps.include 的预构建产物;
 *     用 `./enums.js` 会绕过预构建, 浏览器侧直接拿到原始 CJS 文件执行,
 *     仍然报 `exports is not defined`.
 *
 * server 端继续用 `@shared/enums` (CJS, 别动).
 */

import * as enumsNs from '@shared/enums.js'

// Vite esbuild 把 CJS 包成 `__commonJS` + `export default require_enums()`,
// 命名空间导入拿到的是 `{ default: <CJS-exports-object> }`.
// `enumsNs.default || enumsNs` 兜底: 万一未来 bundler 直接 named export,
// 也能从 namespace 对象本身拿到 keys.
const enums = enumsNs.default || enumsNs

export const OrgType = enums.OrgType
export const ORG_TYPES = enums.ORG_TYPES
export const ORG_TYPE_LABELS = enums.ORG_TYPE_LABELS
export const ORG_TYPE_LEGACY_MAP = enums.ORG_TYPE_LEGACY_MAP

export const Gender = enums.Gender
export const GENDERS = enums.GENDERS

export const CourseInstanceStatus = enums.CourseInstanceStatus
export const COURSE_INSTANCE_STATUSES = enums.COURSE_INSTANCE_STATUSES

export const CourseEnrollmentStatus = enums.CourseEnrollmentStatus
export const COURSE_ENROLLMENT_STATUSES = enums.COURSE_ENROLLMENT_STATUSES

export const LessonScheduleStatus = enums.LessonScheduleStatus
export const LESSON_SCHEDULE_STATUSES = enums.LESSON_SCHEDULE_STATUSES

export const AttendanceStatus = enums.AttendanceStatus
export const ATTENDANCE_STATUSES = enums.ATTENDANCE_STATUSES

export const OrderStatus = enums.OrderStatus
export const ORDER_STATUSES = enums.ORDER_STATUSES

export const PaymentMethod = enums.PaymentMethod
export const PAYMENT_METHODS = enums.PAYMENT_METHODS

export const PointsType = enums.PointsType
export const POINTS_TYPES = enums.POINTS_TYPES

export const PetType = enums.PetType
export const PET_TYPES = enums.PET_TYPES

export const StudentProductSource = enums.StudentProductSource
export const STUDENT_PRODUCT_SOURCES = enums.STUDENT_PRODUCT_SOURCES

export const SchedulePlanMode = enums.SchedulePlanMode
export const SCHEDULE_PLAN_MODES = enums.SCHEDULE_PLAN_MODES

export const SchoolType = enums.SchoolType
export const SCHOOL_TYPES = enums.SCHOOL_TYPES

export const CLIENT_LEVEL = enums.CLIENT_LEVEL
export const CLIENT_LEVEL_LABEL = enums.CLIENT_LEVEL_LABEL
export const labelOfClientLevel = enums.labelOfClientLevel

export default enums