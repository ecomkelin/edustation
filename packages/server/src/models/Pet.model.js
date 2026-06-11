'use strict'

const { Schema, model } = require('mongoose')
const { PET_TYPES } = require('@shared/enums')

/**
 * 学员宠物（Pet）
 *
 * 家长端"宠物乐园"的核心实体：每个学员（Student）领养一只虚拟宠物，
 * 通过积分（PointsAccount）喂养、获得经验、提升等级，作为学员持续学习的激励。
 *
 * 关键约束：
 *   - student 唯一：每个学员只能有一只宠物（一对一关系）
 *   - petType 受枚举限制：避免出现"未定义物种"；当前 MVP 限定为 cat 等
 *
 * 与 PointsAccount 的关系：
 *   - 喂养/升级会消耗积分（PointsTransaction.type='pet_feed'）
 *   - 升级所需经验值 / 等级上限等规则放在 service 层，model 只管存数据
 */
const PetSchema = new Schema(
  {
    // 所属机构（多租户隔离；通常与 Student.org 一致）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 宠物所属学员（一对一，unique 索引）
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, unique: true },
    // 宠物种类（受 PET_TYPES 枚举限制）
    petType: { type: String, enum: PET_TYPES, default: 'cat' },
    // 当前等级（>= 1；升级规则在 service 层实现）
    level: { type: Number, default: 1, min: 1 },
    // 当前经验值（>= 0；满则升级、溢出由 service 处理）
    experience: { type: Number, default: 0, min: 0 },
    // 宠物昵称（家长/学员可自定义；若为空则默认按 petType 显示）
    nickname: { type: String, trim: true }
  },
  { timestamps: true, collection: 'pets' }
)

// 按机构查询（运营后台）
PetSchema.index({ org: 1 })

module.exports = model('Pet', PetSchema)
