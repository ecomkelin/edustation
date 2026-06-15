'use strict'

const { Schema, model } = require('mongoose')

/**
 * 试听预约 (TrialBooking) / 试听记录
 *
 * 业务上代表"一个 lead 的一次试听参与记录"。Lead 1:N TrialBooking:
 *   - 同 lead 第一次约: attemptNo=1
 *   - no_show 后再约: 创建新一笔 TrialBooking, attemptNo=max+1
 *   - 试听完成后 (status=completed) 填 result.isEnrolled 决定是否触发转化
 *
 * 关键设计 (与 plans/staged-roaming-honey.md §2.2 一致):
 *   - lessonSchedule **可选**: 创建时 (status='awaiting_schedule') 必为空;
 *     排课后才填 (status ∈ {scheduled, arrived, no_show, completed})。
 *   - 1:N 共享模型: 1 个 LessonSchedule (isTrialLesson=true) 可对应 N 个 TrialBooking
 *     (5 个孩子一起上同一节试听课)。这正是批量排课 (BatchScheduleDialog) 的核心。
 *   - 与 LessonAttendance 完全无关: 试听课不生成 LessonAttendance, 也不消耗 StudentProduct。
 *
 * 状态机:
 *   awaiting_schedule → scheduled → arrived → completed
 *                              ↓        ↓
 *                          no_show   cancelled
 *
 * 转化流程 (claim token 模式, 不依赖 mongoose 事务):
 *   1. TrialBooking.result.isEnrolled: null → true  (原子翻转作为重试安全 token)
 *   2. User/Student/UserOrgRel upsert 链 (每个独立幂等)
 *   3. Lead 写回 convertedStudent/User/At
 *   5 分钟内可撤销, 见 lead.service.unconvert
 */
const TrialBookingSchema = new Schema(
  {
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },

    // 关联潜客
    preStudent: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },

    // 第几次预约 (per lead; 与 preStudent 联合唯一)
    attemptNo: { type: Number, required: true, min: 1, default: 1 },

    // ─── 排课关联 ───
    // solo = 排了专属试听课; attached = 跟随正常开班某节课
    // 2026-06: 试听不再走 LessonSchedule 中间层, solo 模式直接存本 booking 的 time/teacher/room
    joinMode: { type: String, enum: ['solo', 'attached'], required: true },
    // 关联的 LessonSchedule; 仅 attached 模式填; 2026-06 起 solo 模式不再写
    // (保留字段, 兼容历史 + 跟班试听场景)
    lessonSchedule: { type: Schema.Types.ObjectId, ref: 'LessonSchedule', default: null },
    // 试听教室 (2026-06 新增, solo 模式用); 之前挂在 LessonSchedule.room, 拆出来直接存
    room: { type: Schema.Types.ObjectId, ref: 'Room', default: null },

    // ─── 时间 ───
    // 计划时间; 排课前 (awaiting_schedule) 允许 null; 排课后 = schedule.plannedStartTime
    scheduledAt: { type: Date, default: null },
    // 试听时长 (分钟, 仅 solo 模式)
    scheduledDuration: { type: Number, default: 60, min: 1 },

    // ─── 人员 ───
    // 试听上课老师; awaiting_schedule 状态允许 null
    teacher: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 试听科目 (冗余, 方便按科目筛; 来自 preStudent.lead.trialSubject)
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },

    // ─── 状态机 ───
    status: {
      type: String,
      enum: ['awaiting_schedule', 'scheduled', 'arrived', 'no_show', 'completed', 'cancelled'],
      default: 'awaiting_schedule',
      required: true
    },

    // ─── 实际到店 ───
    actualStartTime: { type: Date, default: null },
    actualEndTime: { type: Date, default: null },

    // ─── 转化结果 (status=completed 时填) ───
    // isEnrolled: null=未填; true=已报名 (触发转化流程); false=不报名
    result: {
      isEnrolled: { type: Boolean, default: null },
      // 谈单老师 (谁促成了这单; 通常 = inviteTeacher, 也可改)
      negotiateTeacher: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      // 吸引报名的点
      attractionPoint: { type: String, default: '' },
      // 为什么不报名 (仅 isEnrolled=false 时填)
      reasonNotEnrolled: { type: String, default: '' },
      // 转化时间 (isEnrolled 翻为 true 的时间, 用于 5 分钟撤销窗口判断)
      enrolledAt: { type: Date, default: null },
      _id: false
    },

    // 备注
    remark: { type: String, default: '' },
    // 创建人 (录入 lead 时自动建的 first booking 用的 createdBy = lead.createdBy)
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'trial_bookings' }
)

// 同一 lead 下 attemptNo 唯一
TrialBookingSchema.index({ preStudent: 1, attemptNo: 1 }, { unique: true })
// 看板主查询: 机构 + 状态 + 时间
TrialBookingSchema.index({ org: 1, status: 1, scheduledAt: 1 })
// 排课关联查
TrialBookingSchema.index({ lessonSchedule: 1 }, { sparse: true })
// 老师课表 (试听课视角)
TrialBookingSchema.index({ teacher: 1, scheduledAt: 1 })
// 看板按科目筛
TrialBookingSchema.index({ org: 1, status: 1, subject: 1 })

module.exports = model('TrialBooking', TrialBookingSchema)
