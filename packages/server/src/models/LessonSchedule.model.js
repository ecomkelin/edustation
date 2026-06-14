'use strict'

const { Schema, model } = require('mongoose')
const { LESSON_SCHEDULE_STATUSES } = require('@shared/enums')

/**
 * 排课（LessonSchedule）
 *
 * "一个开班在某个时间点的一节课" 的实体。是考勤（LessonAttendance）和作品（StudentWork）
 * 的直接父对象。
 *
 * 关键业务逻辑：
 *   - LessonSchedule 创建后，service 会"立即"为该开班下所有 status=enrolled 的
 *     CourseEnrollment 各生成一条 LessonAttendance（status=scheduled）。
 *     → 这意味着排课一旦创建，老师就能看到这节课的学生名单。
 *   - **只有当学生在排课时持有匹配 courseProduct 的、未过期、remainingLessons > 0
 *     的 StudentProduct 时才会被生成考勤**。报课时不强制要求产品（见
 *     courseEnrollment.service），所以"没产品"的学生在考勤名单上缺席是预期行为，
 *     UI 应把"报了该开班但本节课没考勤"的学生作为"待续费/购课"信号单独提示。
 *
 * 冲突检测（远期）：
 *   - 同一 teacher 或同一 room 的时间段不可重叠。
 *   - 现阶段 (org, plannedStartTime, plannedEndTime) / (teacher, plannedStartTime) /
 *     (room, plannedStartTime) 三个复合索引可支撑后续的冲突检测实现。
 *
 * 状态机（5 个 + 1 个死胡同）：
 *   scheduled      初始化；CourseInstance 排课时自动生成
 *      ↓ 教务手动转（仅 plannedStartTime 24h 内可转）
 *   preparing      准备上课；可预先登记请假学生的考勤
 *      ↓ 老师点「开始上课」
 *   in_progress    正在上课；actualStartTime 由 service 写入
 *      ↓ 教务填实际下课时间后转
 *   completed      结束上课；actualEndTime 由 service 写入
 *      ↓ 所有考勤课评完成后教务转
 *   archived       完成归档；归档后家长可对老师评价
 *
 *   scheduled → cancelled（取消：老师请假等；需要回滚已生成的 LessonAttendance）
 *
 * 提醒（remind）：
 *   remindStatus / remindedAt 用于记录"本节课的统一提醒状态"。
 *   真正的提醒粒度在 LessonAttendance（按学生）；本字段冗余，UI 上展示"是否已提醒"。
 *   Job 推送成功后回写：remindStatus = sent / partial；remindedAt = now。
 */
const LessonScheduleSchema = new Schema(
  {
    // 所属机构（多租户隔离；通常与 courseInstance.org 一致）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 所属开班
    courseInstance: { type: Schema.Types.ObjectId, ref: 'CourseInstance', required: true },
    // 第几节课（开班内自增；同开班下 lessonNo 唯一）
    lessonNo: { type: Number, required: true, min: 1 },
    // 计划开始时间
    plannedStartTime: { type: Date, required: true },
    // 计划结束时间（需 > plannedStartTime；service 层校验）
    plannedEndTime: { type: Date, required: true },
    // 授课老师（可与 courseInstance.teacher 不同：支持临时换老师）
    teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 上课教室（可与 courseInstance.room 不同：支持临时换教室）
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    // 状态机
    status: { type: String, enum: LESSON_SCHEDULE_STATUSES, default: 'scheduled' },
    // 实际上课开始时间（点击"开始上课"时由 service 写入；与 plannedStartTime 共同用于"差(天)/差(分)"展示）
    actualStartTime: { type: Date, default: null },
    // 实际上课结束时间（点击"结束上课"时由 service 写入）
    actualEndTime: { type: Date, default: null },
    // 实际开始时间与计划时间相差 5 分钟以上的理由（老师/教务手填，service 校验必填）
    actualStartReason: { type: String, trim: true, default: null },
    // 实际结束时间与计划时间相差 5 分钟以上的理由
    actualEndReason: { type: String, trim: true, default: null },
    // 课节主题（可选；例如"国画入门 - 写意兰花"）
    //   该字段是本节课"最具体的主题"，UI 解析时它优先于 CI.syllabusOverride/Snapshot/Subject
    title: { type: String, trim: true },
    // 老师备课笔记 / 课堂要点
    notes: { type: String },
    // ─── 教学体系:本节特例覆盖(2026-06 拆) ───
    // 这些字段是 LessonSchedule 层的"本节特例说明",
    // 解析时优先于 CourseInstance.syllabusOverride/Snapshot/Subject.
    //   descriptionOverride: 覆盖 syllabus 来的 description
    //   objectivesOverride:  覆盖 syllabus 来的 objectives (string[])
    descriptionOverride: { type: String, default: '' },
    objectivesOverride: { type: [String], default: [] },
    // 备课资料：课件 PDF / 教案 / 参考视频等
    //   引用 File 文档 ID（与 StudentWork.fileUrls 区分：本字段存 id 而非 url）
    //   语义：本节课的"特例补充"材料；不包含 CI 快照来的/override 来的课件（那些由 resolveLessonContent 合并读出）
    materials: { type: [Schema.Types.ObjectId], ref: 'File', default: [] },
    // 提醒状态：none=未提醒；sent=全部学生已提醒成功；partial=部分学生提醒成功
    remindStatus: { type: String, enum: ['none', 'sent', 'partial'], default: 'none' },
    // 本节课最后一次成功推送提醒的时间（用于 UI 展示）
    remindedAt: { type: Date, default: null },
    // 是否试听课（招生试听功能）：true 时为试听预约 (TrialBooking) 排的课,
    // 排课处 UI 显示"试听"角标; 业务逻辑 (考勤/StudentProduct 扣减) 不参与 —
    // 试听课的"参加"通过 TrialBooking.status 追踪; 详见 plans/staged-roaming-honey.md
    isTrialLesson: { type: Boolean, default: false, index: true }
  },
  { timestamps: true, collection: 'lesson_schedules' }
)

// 按机构 + 时间范围查询（机构周历视图）
LessonScheduleSchema.index({ org: 1, plannedStartTime: 1, plannedEndTime: 1 })
// 按老师 + 时间查询（老师课表）
LessonScheduleSchema.index({ teacher: 1, plannedStartTime: 1 })
// 按教室 + 时间查询（教室占用情况 / 冲突检测）
LessonScheduleSchema.index({ room: 1, plannedStartTime: 1 })
// 同一开班下 lessonNo 唯一（保证节次编号有序不重复）
LessonScheduleSchema.index({ courseInstance: 1, lessonNo: 1 }, { unique: true })

module.exports = model('LessonSchedule', LessonScheduleSchema)
