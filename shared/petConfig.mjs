/**
 * 宠物系统平台级配置 — ESM 入口 (2026-07-16 新增).
 *
 * 背景: shared/petConfig.js 是 CommonJS (后端 require 解构用),
 *       Vite admin 前端需要 named import. 走 `import from '@shared/petConfig.js'`
 *       会触发 esbuild CJS interop，namespace import 拿到 `{ default: ... }`，
 *       但顶层 `import { LOCKED_EXP_INCREMENT } from ...` 仍可能命中
 *       `does not provide an export` (因 esbuild 给出来的是 `export default ...`,
 *        而非 `export { LOCKED_EXP_INCREMENT }`).
 *
 * 本文件 (shared/petConfig.mjs): ESM 转发层, 给前端 named import 用.
 *   - 与 shared/enums.mjs 范式相同
 *   - 用 `@shared/petConfig.js` 走 resolve.alias + optimizeDeps.include 的预构建产物
 *   - 浏览器侧拿到的是 namespace, 取 `default` (esbuild 转换后的 CJS exports 对象)
 *
 * server 端继续用 `@shared/petConfig` (CJS, 别动).
 */

import * as petConfigNs from '@shared/petConfig.js'

// esbuild 把 CJS 转为 `export default require_petConfig()` —— 整个 exports 对象挂在 default 上。
// 兜底 enums 范式不变: `default || ns` 万一未来 bundler 直接 named export 也能从 namespace 取到 keys.
const cfg = petConfigNs.default || petConfigNs

export const MAX_HUNGER = cfg.MAX_HUNGER
export const INIT_HUNGER_AFTER_HATCH = cfg.INIT_HUNGER_AFTER_HATCH
export const MAX_PETS_PER_STUDENT = cfg.MAX_PETS_PER_STUDENT
export const DEFAULT_SPECIES_MAX_LEVEL = cfg.DEFAULT_SPECIES_MAX_LEVEL
export const LOCKED_EXP_INCREMENT = cfg.LOCKED_EXP_INCREMENT
export const DEFAULT_LEVEL_CONFIG = cfg.DEFAULT_LEVEL_CONFIG
export const DEFAULT_HUNGER_DECAY_PER_DAY = cfg.DEFAULT_HUNGER_DECAY_PER_DAY
export const DEFAULT_DEATH_THRESHOLD_DAYS = cfg.DEFAULT_DEATH_THRESHOLD_DAYS

export const expToNext = cfg.expToNext
export const normalizeLevelConfig = cfg.normalizeLevelConfig
export const normalizeLevelOverrides = cfg.normalizeLevelOverrides
export const levelOverridesToRows = cfg.levelOverridesToRows
export const rowsToLevelOverrides = cfg.rowsToLevelOverrides
export const resolveMaxLevel = cfg.resolveMaxLevel
export const getOverrideMap = cfg.getOverrideMap
export const resolveVisualAtLevel = cfg.resolveVisualAtLevel

export default cfg
