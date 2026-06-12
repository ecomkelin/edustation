'use strict'

const { Schema, model } = require('mongoose')

/**
 * 学生作品（StudentWork）
 *
 * 学生在某节考勤（LessonAttendance）下产出的作品/作业记录，例如美术课的画作、音乐课的录音。
 *
 * 核心关系（2026-06 完善）：
 *   - 直接关联 lessonAttendance（**创建后不可变动**）。考勤是作品的"事实归属"：
 *     消课时锁定、上传时锁定，永远不会因为后续改排课/改开班而漂移。
 *   - 冗余快照 lessonSchedule → courseInstance → subject 三层 ID：
 *     服务端在 create 时从 attendance 链推导写入，避免分析时多级 populate
 *     （"这个学科的全部作品"、"这个开班的作品墙" 等查询走单层命中）。
 *   - 同时保留 student 字段（家长端"我的作品"直接走 student 索引）。
 *
 * 业务规则：
 *   - StudentWork 是可选的：考勤 status 并不要求有作品；本节课布置了作品时才创建。
 *   - 同一考勤下可有多个作品（不同 title）；(lessonAttendance, title) 唯一索引
 *     防止重复提交同标题。
 *   - uploadedBy 记录"实际上传者"：老师代传、家长上传、或学员本人（家长端）。
 *   - **不支持编辑**：title/description/fileUrls 创建后均不可改；要改就 hard delete 重建。
 *
 * 不可变性（三道防线）：
 *   1. Schema 层 `immutable: true` —— save/findOneAndUpdate 改四个 snapshot 字段直接抛错
 *   2. pre('findOneAndUpdate'/'updateOne') hook —— 兜底 strip `$set` 里的这四个字段
 *   3. 路由层不提供 PUT/PATCH —— 根本没有代码路径能修改
 *
 * 文件存储：
 *   - fileUrls 仅保存 URL（建议走对象存储 + CDN），文件元数据/大小等若需要可放 meta。
 *   - 本模型不持有 meta（MVP 阶段不引入，后续可加 `meta: Mixed`）。
 */

const SNAPSHOT_FIELDS = ['lessonAttendance', 'lessonSchedule', 'courseInstance', 'subject']

const StudentWorkSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 关联考勤（创建后 immutable）—— 作品的"事实归属"锚点
    lessonAttendance: {
      type: Schema.Types.ObjectId,
      ref: 'LessonAttendance',
      required: true,
      immutable: true
    },
    // 关联排课（冗余自 attendance.lessonSchedule，immutable；用于按排课维度查询/删除守卫）
    lessonSchedule: {
      type: Schema.Types.ObjectId,
      ref: 'LessonSchedule',
      required: true,
      immutable: true
    },
    // 关联开班（冗余自 schedule.courseInstance，immutable；用于按开班维度查询）
    courseInstance: {
      type: Schema.Types.ObjectId,
      ref: 'CourseInstance',
      required: true,
      immutable: true
    },
    // 关联学科（冗余自 courseInstance.subject，immutable；用于学科维度分析）
    // 允许为 null：历史 CourseInstance 可能未设置 subject（详见 model line 77）
    subject: {
      type: Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      immutable: true,
      default: null
    },
    // 作品所属学生（冗余自 attendance.student，用于家长端"我的作品"查询）
    student: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true
    },
    // 作品标题，例如"写意兰花-第一节"
    title: { type: String, required: true, trim: true },
    // 作品文件 URL 列表（图片/视频/音频/PDF 等）
    fileUrls: { type: [String], default: [] },
    // 作品描述（创作思路、老师点评等）
    description: { type: String },
    // 作品等级（员工评定）：1~5（最低~最高）；完全可选，null = 未评定
    // 不在 immutable 列表里：员工可后期通过 PATCH 接口评/改/清
    level: { type: Number, min: 1, max: 5, default: null },
    // 实际上传者（老师/家长/学员本人）；用于审计和作品归属
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, collection: 'student_works' }
)

// ─── 不可变性兜底：strip $set 里的 snapshot 字段 ────────────────────────────
// 防御 raw `updateOne` / `findOneAndUpdate({ runValidators: false })` 绕过
// schema 层 immutable 的场景。即使有人在脚本里手写 update，也会被这里拦下来。
function stripSnapshotFields(next) {
  if (!next || typeof next !== 'object') return
  if (next.$set) {
    for (const f of SNAPSHOT_FIELDS) delete next.$set[f]
  }
  for (const f of SNAPSHOT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(next, f)) delete next[f]
  }
}
StudentWorkSchema.pre('findOneAndUpdate', function (next) {
  stripSnapshotFields(this.getUpdate())
  next()
})
StudentWorkSchema.pre('updateOne', function (next) {
  stripSnapshotFields(this.getUpdate())
  next()
})
StudentWorkSchema.pre('updateMany', function (next) {
  stripSnapshotFields(this.getUpdate())
  next()
})

// ─── 索引 ──────────────────────────────────────────────────────────────────
// 按排课查作品（lessonSchedule 删除守卫 + "本节课的全部作品"）
StudentWorkSchema.index({ org: 1, lessonSchedule: 1 })
// 按学科查作品（"美术班最近两周的作品"分析）
StudentWorkSchema.index({ org: 1, subject: 1, createdAt: -1 })
// 按开班查作品（"这个开班的作品墙"）
StudentWorkSchema.index({ org: 1, courseInstance: 1, createdAt: -1 })
// 按学生查作品（家长端"我的作品"），按时间倒序
StudentWorkSchema.index({ student: 1, createdAt: -1 })
// 按考勤查作品（attendance.works 接口）
StudentWorkSchema.index({ org: 1, lessonAttendance: 1 })
// 同一考勤下 title 不能重复
StudentWorkSchema.index({ lessonAttendance: 1, title: 1 }, { unique: true })

module.exports = model('StudentWork', StudentWorkSchema)
