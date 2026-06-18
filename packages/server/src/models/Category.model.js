'use strict'

const { Schema, model } = require('mongoose')

/**
 * 平台级数据字典（类别库）。
 *
 * 作用：
 *  - 统一维护系统中"枚举型"业务字段（例如：学员类型、学科分类、家长标签、招生渠道等），
 *    避免把可选项硬编码到代码里，方便运营/教务在后台维护。
 *  - 通过 `model` 字段区分业务域：
 *      'Student' → 学员分类字典（被本机构 Student 引用）
 *      'Subject' → 学科分类字典（被 Subject.category 引用；Subject 本身 per-org）
 *      'LeadTag' → 家长标签字典（被 Parent.tags 引用）
 *      'Channel' → 招生渠道字典（被 Parent.source / ChildLead.source 引用）
 *  - 支持多层级：level 越大越深，parentCategory 指向父级。
 *    例如 学科分类可以做到 "艺术 > 美术 > 国画"。
 *
 * 2026-06 整改：
 *  - 移除 'Org'（机构类型已改为 Org.type 的硬编码 enum，不走字典）。
 *  - 新增 `org` 字段（租户隔离）：4 个 model 都是 per-org 业务数据，
 *    由机构管理员维护，跨 org 不可见。
 *    - org = null 表示平台级共享字典（当前 4 个 model 都不再用，保留字段以备将来扩展）。
 *    - 创建时由 controller/service 强制 `org = req.orgId`（非平台超管）。
 *    - 平台超管管理跨 org 时不传 orgId（或传 null）；当前阶段主要走机构维护。
 *
 * 唯一性约束：
 *  - 同一 (org, model, parentCategory) 下 name 不可重复。
 *    顶级分类 parentCategory = null，因此顶级分类在同一 (org, model) 下也必须唯一。
 */
const CategorySchema = new Schema(
  {
    // 字典所属业务域，决定本条记录是给哪个实体用的
    //   'Student' → 学员分类字典
    //   'Subject' → 学科分类字典
    //   'LeadTag' → 家长标签字典 (被 Parent.tags 引用)
    //   'Channel' → 招生渠道字典 (被 Parent.source / ChildLead.source 引用)
    model: { type: String, enum: ['Student', 'Subject', 'LeadTag', 'Channel'], required: true, index: true },
    // 租户隔离 (2026-06): 4 个 model 全是 per-org 业务字典
    //   - 机构内管理员/教务可读写自己 org 的字典
    //   - 跨 org 查询自动隔离 (list / tree 按 req.orgId 过滤)
    //   - 平台超管可跨 org 浏览, 但通常不需要写
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null, index: true },
    // 字典项名称，前端直接展示给用户看
    name: { type: String, required: true, trim: true },
    // 层级深度：0 = 顶级，1 = 二级，以此类推；上限 5 层
    level: { type: Number, default: 0, min: 0, max: 5, index: true },
    // 父级字典项；顶级分类为 null
    parentCategory: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    // 可选编码：用于与外部系统对接、报表导出、API 透传等场景
    code: { type: String, trim: true },
    // 同级排序：升序展示，越小越靠前
    sort: { type: Number, default: 0 },
    // 是否启用：false 时前端下拉里不再展示，但仍保留历史数据
    isActive: { type: Boolean, default: true, index: true },
    // 扩展字段：用于存放业务自定义属性，避免频繁加字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'categories' }
)

// 同一 (org, model, parentCategory) 下，name 不可重复（顶级时 parentCategory 为 null）
// partial filter 让 org=null（罕见）也参与唯一约束；org=具体 id 时按 org 隔离
CategorySchema.index(
  { org: 1, model: 1, name: 1, parentCategory: 1 },
  { unique: true }
)

module.exports = model('Category', CategorySchema)
