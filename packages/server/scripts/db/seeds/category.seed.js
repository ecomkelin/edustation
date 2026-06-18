'use strict'

/**
 * 类别字典种子 (兼容文件 — 2026-06 整改后已无实际内容).
 *
 * 整改背景:
 *   - 2026-06 之前: 本文件 seed Org 类型 (model='Org', 给 Org.type 引用) + Subject/Student 顶级.
 *   - 2026-06 整改: Org.type 改 String enum (10 种, 硬编码在 @shared/enums), Category 字典
 *     model enum 不再含 'Org'; Subject/Student 顶级分类改成 per-org (org 字段必填),
 *     不再走 platform 级 seed, 由机构管理员首次登录后自行维护.
 *
 * 当前实现:
 *   - 返回 { org: [], subject: [] } 兼容 subject.seed.js 的入参 shape
 *   - 不做任何 DB 写入
 *
 * 调用方 (init-seeds.js) 已经不再 require 本文件, 但保留以防外部脚本误依赖.
 */

async function run() {
  // eslint-disable-next-line no-console
  console.log('[seed.category] noop (2026-06 整改: Category 全 per-org + Org.type 改 enum)')
  return { org: [], subject: [] }
}

module.exports = { run }