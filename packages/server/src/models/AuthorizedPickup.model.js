'use strict'

const { Schema, model } = require('mongoose')
const { PICKUP_PERSON_TYPES } = require('@shared/enums')

/**
 * 家长接送授权 (AuthorizedPickup)
 *
 * 某家长/第三方可在 validFrom~validUntil 区间内接送某学员。
 * 接送发生时, 一体机识别人脸 → 命中 FaceProfile (subjectType=parent/authorized_pickup)
 * → service 反查 AuthorizedPickup → 校验有效 → 允许开门。
 *
 * 关键设计 (2026-06 立项):
 *  - pickupPersonType='parent' 时: pickupUser 必填, pickupName/Phone 冗余自 User (防脏数据)
 *  - pickupPersonType='authorized_third_party' 时: pickupName/Phone 必填, pickupUser 为 null
 *  - faceProfile: 'parent' 必填 (接送家长必须先录脸), 'authorized_third_party' 可选 (PoC)
 *  - 软删: revokedAt/By/Reason (不物理删, 留审计)
 *  - 不与 LessonAttendance 联动 (CLAUDE.md §17 决策: 门禁只记进出)
 */
const AuthorizedPickupSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 被接送的学员
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    pickupPersonType: { type: String, enum: PICKUP_PERSON_TYPES, required: true },
    // 接送人也是本机构家长时: 关联到 User, 走 activeStudent 反查
    pickupUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      // 条件必填: 仅 parent 类型需要
      required: function () { return this.pickupPersonType === 'parent' }
    },
    // 第三方接送人快照 (parent 类型时冗余自 pickupUser)
    pickupName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 50,
      required: function () { return this.pickupPersonType === 'authorized_third_party' }
    },
    pickupPhone: {
      type: String,
      default: '',
      trim: true,
      maxlength: 20,
      required: function () { return this.pickupPersonType === 'authorized_third_party' }
    },
    // 身份证末 4 位 (仅第三方, 用于现场核验)
    pickupIdCardLast4: { type: String, default: '', trim: true, maxlength: 4 },
    // 关系 (自由文本: '妈妈'/'奶奶'/'阿姨' 等)
    relationship: { type: String, default: '', trim: true, maxlength: 20 },
    // 接送人的人脸档案 (parent 类型必填, 第三方可选)
    faceProfile: {
      type: Schema.Types.ObjectId,
      ref: 'FaceProfile',
      default: null
    },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    // 创建人 (admin 或 学员主监护人)
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 软删
    revokedAt: { type: Date, default: null, index: true },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'authorized_pickups' }
)

// 按学员聚合接送授权 (前端 "本学员所有接送人" 视图)
AuthorizedPickupSchema.index({ org: 1, student: 1, revokedAt: 1 })
// 反查: 该家长给哪些学员授权了
AuthorizedPickupSchema.index({ org: 1, pickupUser: 1, revokedAt: 1 })
// 按人脸档案反查: 这个脸是谁的授权?
AuthorizedPickupSchema.index({ org: 1, faceProfile: 1 })
// 时效性查询
AuthorizedPickupSchema.index({ org: 1, validFrom: 1, validUntil: 1 })

module.exports = model('AuthorizedPickup', AuthorizedPickupSchema)
