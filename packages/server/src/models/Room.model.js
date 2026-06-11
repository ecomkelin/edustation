'use strict'

const { Schema, model } = require('mongoose')

/**
 * 教室（Room）
 *
 * 机构下的物理/逻辑教室。开班（CourseInstance）/排课（LessonSchedule）会引用
 * 本实体，用于：
 *   - 排课时校验"老师/教室在某个时段是否冲突"（基于 LessonSchedule 上的复合索引）
 *   - 前端展示"教室一周占用情况"
 *
 * capacity 是建议值（最多容纳多少学生），不是硬限制：
 *   - 创建 CourseInstance 时不会强制校验 maxStudents <= room.capacity
 *   - 实际是否超额由运营根据教室情况自行把握
 *   - 若需硬约束可在 service 层加校验
 */
const RoomSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 教室名称，例如"101 教室"/"国画 1 室"
    name: { type: String, required: true, trim: true },
    // 容纳人数（建议值；>= 1）
    capacity: { type: Number, default: 10, min: 1 },
    // 教室位置/楼层（例如"3 楼东侧"）
    location: { type: String, trim: true },
    // 备注/描述（设备、用途等）
    description: { type: String },
    // 是否启用：false 时新建排课/开班不再可选
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, collection: 'rooms' }
)

// 同一机构内教室名唯一
RoomSchema.index({ org: 1, name: 1 }, { unique: true })
// 按机构查可用教室
RoomSchema.index({ org: 1, isActive: 1 })

module.exports = model('Room', RoomSchema)
