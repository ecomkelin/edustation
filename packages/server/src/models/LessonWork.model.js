'use strict'

const { Schema, model } = require('mongoose')

/**
 * 课堂作品（LessonWork）
 *
 * 学生在某节课（LessonSchedule）下产出的作品/作业记录，例如美术课的画作、音乐课的录音。
 *
 * 业务规则：
 *   - LessonWork 是可选的：考勤 status=present 且本节课布置了作品时才创建。
 *   - 一个学生一节课可以有多份作品（fileUrls 是数组），例如同一节课上的多张练习。
 *   - uploadedBy 记录"实际上传者"：可能是老师代传、家长上传、或者学员本人（家长端），
 *     用于追溯操作人。
 *
 * 文件存储：
 *   - fileUrls 仅保存 URL（建议走对象存储 + CDN），文件元数据/大小等若需要可放 meta。
 */
const LessonWorkSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 关联排课
    lessonSchedule: { type: Schema.Types.ObjectId, ref: 'LessonSchedule', required: true },
    // 作品所属学生
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    // 作品标题，例如"写意兰花-第一节"
    title: { type: String, required: true, trim: true },
    // 作品文件 URL 列表（图片/视频/音频/PDF 等）
    fileUrls: { type: [String], default: [] },
    // 作品描述（创作思路、老师点评等）
    description: { type: String },
    // 实际上传者（老师/家长/学员本人）；用于审计和作品归属
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, collection: 'lesson_works' }
)

// 按排课查作品（"这节课的全部作品"）
LessonWorkSchema.index({ org: 1, lessonSchedule: 1 })
// 按学生查"这个学生的所有作品"（家长端作品墙）
LessonWorkSchema.index({ student: 1 })

module.exports = model('LessonWork', LessonWorkSchema)
