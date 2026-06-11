'use strict'

const { Schema, model } = require('mongoose')
const { CLIENT_LEVEL } = require('@shared/enums')

/**
 * 岗位（Position）
 *
 * 机构内部的角色定义。通过 permissions 控制员工在管理后台的菜单/操作权限，
 * 通过 clientLevel 区分"员工岗"与"家长岗"。
 *
 * 客户端等级（clientLevel）的设计：
 *   - 0 = 非家长（staff 端岗位：管理员/教务/老师/财务 等），走管理后台
 *   - 1+ = 家长岗；数字越大等级越高（1=基础家长，2=VIP，3=钻石，4+ 机构自留）
 *   - "是否为家长"在业务层由 clientLevel > 0 推导；不再使用旧 isClient 字段
 *   - 该字段可改（家长升级/降级），但 UI 上需提示
 *
 * 唯一性约束：
 *   - 同一 org 内，岗位 name 不可重名
 *   - 同一 org 内，每个 clientLevel > 0 至多一个家长岗
 *     （partial unique index 强制；clientLevel=0 的 staff 岗位可以多个）
 */
const PositionSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 岗位名称，例如"教务"/"老师"/"VIP 家长"
    name: { type: String, required: true, trim: true },
    // 权限码列表（取自 shared/permissions.json；前端/中间件据此渲染菜单/校验操作）
    permissions: { type: [String], default: [] },
    // 是否系统预置岗位；true 时禁止删除/重命名（避免破坏默认权限绑定）
    isSystem: { type: Boolean, default: false },
    /**
     * 客户端（家长）岗位等级。
     *  0 = 非家长（staff 端岗位：管理员/教务/老师/财务 等）
     *  1+ = 家长岗；数字越大等级越高（1=基础，2=VIP，3=钻石，4+ 机构自留）
     *
     *  - 同一 org 内，每个 clientLevel > 0 至多一个岗位（partial unique index 强制）
     *  - "是否为家长"在业务层由 clientLevel > 0 推导；不再使用旧 isClient 字段
     *  - 该字段可改（升级/降级），但 UI 上需提示
     */
    clientLevel: { type: Number, default: CLIENT_LEVEL.NONE, min: 0 }
  },
  { timestamps: true, collection: 'positions' }
)

// 同一机构内岗位名唯一
PositionSchema.index({ org: 1, name: 1 }, { unique: true })
// 客户端岗位：每个 org 内，每个 clientLevel > 0 至多一条（partial filter 仅约束 > 0 的）
PositionSchema.index(
  { org: 1, clientLevel: 1 },
  { unique: true, partialFilterExpression: { clientLevel: { $gt: 0 } } }
)

// 虚拟字段：保持 API 兼容（isClient === clientLevel > 0）
// 仅用于向前端/老代码返回布尔值，存储仍以 clientLevel 为准
PositionSchema.virtual('isClient').get(function () {
  return Number(this.clientLevel) > 0
})
PositionSchema.set('toObject', { virtuals: true })
PositionSchema.set('toJSON', { virtuals: true })

module.exports = model('Position', PositionSchema)
