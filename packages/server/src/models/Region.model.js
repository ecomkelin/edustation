'use strict'

const { Schema, model } = require('mongoose')

/**
 * 平台级地区字典（Region）
 *
 * 省/市/区三级行政区划的树形数据，供 Org.region、User.region 等"地区"字段引用。
 *
 * 设计要点：
 *   - 通过 parent 字段自引用形成树；parent=null 表示顶级
 *   - level 与深度对应：0 省 / 1 市 / 2 区（系统允许 0-5，覆盖直辖市/街道等扩展）
 *   - code 可选：与民政部/统计局行政区划编码一致，便于对接外部系统
 *   - 同一 parent 下 name 不可重复（防止"两个广州市"）
 *
 * 数据维护：
 *   - 通常由平台在初始化时通过行政区划 JSON 一次性灌入
 *   - 运营侧一般只读，不在前台提供增删改
 */
const RegionSchema = new Schema(
  {
    // 地区名称，例如"广东省"/"广州市"/"天河区"
    name: { type: String, required: true, trim: true },
    // 行政区划编码（民政部标准编码，可选；用于对外对接/报表导出）
    code: { type: String, trim: true },
    // 层级深度：0=省、1=市、2=区；上限 5
    level: { type: Number, default: 0, min: 0, max: 5, index: true },
    // 父级地区；省级时为 null
    parent: { type: Schema.Types.ObjectId, ref: 'Region', default: null, index: true },
    // 同级排序（升序展示，越小越靠前）
    sort: { type: Number, default: 0 },
    // 是否启用：false 时前端选择器不再展示
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true, collection: 'regions' }
)

// 同一 parent 下 name 不可重复；顶级时 parent=null 也参与唯一约束
RegionSchema.index({ name: 1, parent: 1 }, { unique: true })

module.exports = model('Region', RegionSchema)
