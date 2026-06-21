'use strict'

const { Schema, model } = require('mongoose')
const {
  FACE_PROFILE_SUBJECT_TYPES,
  FACE_PROFILE_SYNC_STATUSES
} = require('@shared/enums')

/**
 * 人脸档案 (FaceProfile)
 *
 * 一条档案 = 一个主体 (学员/家长/第三方接送人) 在本机构下的一份已激活人脸。
 * polymorphic 设计 (PoC 接受技术债, v2 拆 3 表):
 *   - subjectType ∈ ['student', 'parent', 'authorized_pickup']
 *   - subject = ObjectId, refPath='subjectType' 自动 populate
 *   - 一主体同 subjectType 同时只能有 1 条 active 档案 (partial unique 索引保证)
 *
 * 关键设计 (2026-06 立项):
 *  - consentRecord 必填: 录入前必须有有效 UserConsent (face-consent-{purpose})
 *  - soft delete: revokedAt/By/Reason (不物理删, 保审计 + 设备本地同步需要)
 *  - deviceIds: 已同步到的设备列表, 撤销时反向调 driver.removeFaceProfile
 *  - syncStatus: pending/synced/failed (PoC 失败只报警, v2 加重试队列)
 */
const FaceProfileSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    subjectType: { type: String, enum: FACE_PROFILE_SUBJECT_TYPES, required: true, index: true },
    // polymorphic: populate 时按 subjectType 自动选 collection
    subject: { type: Schema.Types.ObjectId, required: true, refPath: 'subjectType' },
    // 录入时引用的同意书 (UserConsent 必填, 软删时一并检查撤回)
    consentRecord: { type: Schema.Types.ObjectId, ref: 'UserConsent', required: true },
    // 录入质量分 (0-1, 设备报, <0.7 提示重新拍照)
    enrollmentQuality: { type: Number, min: 0, max: 1, default: null },
    // 同步状态: pending (录入后待同步设备) / synced (设备已确认) / failed (设备拒绝)
    syncStatus: { type: String, enum: FACE_PROFILE_SYNC_STATUSES, default: 'pending' },
    // 已同步到哪些设备本地白名单 (撤销时反向清理)
    deviceIds: [{ type: Schema.Types.ObjectId, ref: 'AccessDevice' }],
    // 录入时上传的清晰人脸照 (走 File 系统, scope=faceAccessEnrollment)
    enrollmentPhoto: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    enrolledAt: { type: Date, default: Date.now },
    enrolledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 软删: 撤销时写入 (PIPL 留痕 + 设备本地清理)
    revokedAt: { type: Date, default: null, index: true },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'face_profiles' }
)

// 同一主体同 subjectType 同时只能有 1 条 active 档案 (partial unique)
FaceProfileSchema.index(
  { org: 1, subjectType: 1, subject: 1 },
  { unique: true, partialFilterExpression: { revokedAt: null } }
)
// 反查: 一台设备本地已同步了哪些档案
FaceProfileSchema.index({ org: 1, deviceIds: 1 })
// 软删统计 / 待清理
FaceProfileSchema.index({ org: 1, revokedAt: 1 })

module.exports = model('FaceProfile', FaceProfileSchema)
