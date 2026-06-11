'use strict'

const { Schema, model } = require('mongoose')
const { ATTENDANCE_STATUSES } = require('@shared/enums')

/**
 *考勤记录（LessonAttendance）
 *
 * 一节排课（LessonSchedule）下、每个报名学生（CourseEnrollment）对应一条考勤记录。
 *
 * 生成时机（v3 起，2026-06 大改）：
 * - LessonSchedule 创建时**不**生成考勤（避免排课阶段就锁定学生课包 /误导老师）。
 * -排课状态从「未上课 (scheduled)」切到「准备上课 (preparing)」时（service.prepare）：
 * 为该开班下所有 status=enrolled 的 CourseEnrollment 各生成一条 LessonAttendance
 * （默认 status=scheduled）。
 * - **仅当该学生当前持有匹配 courseProduct 的、未过期、remainingLessons >0 的
 * StudentProduct 时才会被生成**；没有可用产品的学生在考勤名单上缺席
 * （这同时是给家长"续费/购课"的信号）。
 * -课程结束之前教务可手动为单个学生补一条考勤（POST /lesson-attendances）。
 * - 学生后续报名 / 新购课时，自动补该开班所有未来排课的考勤（ensureAttendanceForStudent）。
 *
 *消课规则（关键业务逻辑）：
 * - status变为 'completed'（已消课）时，从对应 StudentProduct扣减1课时
 * - 'no_show'（未到）/ 'leave'（请假）不扣课时
 * -课包扣减时按 FIFO：学生在该 CourseProduct 下若持有多个未过期未用完的
 * StudentProduct，按 expireDate升序选最早过期的那个
 *
 *业务字段解释：
 * - studentProduct:扣课时用的"具体产品"；消课时把"这节课对应哪个产品"明确记录下来，
 *避免事后追查"这节消的是哪个产品的课时"。允许为 null（仅出现在"考勤记录本应
 *存在但当时无产品"的历史数据/手工补录场景下），null 时不可消课。
 * - actualStartTime / actualEndTime:实际签到/签退时间（与 plannedStart/End 对照）
 * - remark:老师备注，例如请假原因、迟到说明、特殊情况等
 * - meta.makeupOf: 旧版「补课」标记（已废弃）。2026-06 改为"就地转状态"语义后，
 * 补课不会创建新考勤，而是把原考勤 status 翻成 madeup；该字段保留只为兼容老数据迁移。
 * - meta.originalStatus: 2026-06 新增。补课/转 madeup 时把"翻转前"的状态写到这里（leave / no_show /
 * scheduled / checked_in），便于事后审计"这次补课前学生是什么状态"。
 * - meta.makeupAt: 2026-06 新增。补课时间戳。
 */
const LessonAttendanceSchema = new Schema(
  {
    //所属机构（多租户隔离；通常与 lessonSchedule.org 一致）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    //关联排课
    lessonSchedule: { type: Schema.Types.ObjectId, ref: 'LessonSchedule', required: true },
    // 上课学生
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    // 本次考勤用于消课的产品（消课时锁定，避免多节课并发扣同一个产品）
    // -报课时不强制要求 StudentProduct，排课时只对"有可用产品"的学生生成考勤
    // -极少数历史/手工补录场景可能 null；null 时不允许 complete（消课）
    studentProduct: { type: Schema.Types.ObjectId, ref: 'StudentProduct', default: null },
    //考勤状态；具体取值见 @shared/enums 的 ATTENDANCE_STATUSES
    // scheduled排课刚生成，等待上课
    // checked_in签到（待消课）
    // completed 已消课（会触发扣课时）
    // no_show 未到（不扣课时）
    // leave 请假（不扣课时）
    status: { type: String, enum: ATTENDANCE_STATUSES, default: 'scheduled' },
    //实际签到时间
    actualStartTime: { type: Date },
    //实际签退时间
    actualEndTime: { type: Date },
    //老师备注（请假原因、迟到说明、特殊情况等）
    remark: { type: String },
    //提醒状态：上课前1h 的家长提醒是否成功推送给该学生
    // - remindedAt: 最近一次成功推送时间；null 表示还没推
    // - remindChannel:推送渠道（wechat/sms/push）
    // Job:扫 plannedStartTime ≤ now+1h 且 status=scheduled 且 remindedAt=null 的考勤 →推送 →回写
    remindedAt: { type: Date, default: null },
    remindChannel: { type: String, enum: ['wechat', 'sms', 'push'], default: null },
    // 结构化课评（老师对学生的本节课评价）。仅在 status='completed' 时允许写入；
    //排课进入"已归档"前，仅「已消课」的考勤必须有 evaluatedAt（其他状态无需课评）。
    evaluation: {
      score: { type: Number, min: 1, max: 5, default: null }, //1-5 星
      content: { type: String, default: null }, //总体评语
      strengths: { type: String, default: null }, //亮点
      improvements: { type: String, default: null }, // 待改进
      evaluatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      evaluatedAt: { type: Date, default: null }
    },
    //扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'lesson_attendances' }
)

// 同一节排课下，同一学生只能有一条考勤记录（2026-06 起补课走「就地转状态」语义，不再建新行）。
LessonAttendanceSchema.index(
  { lessonSchedule: 1, student: 1 },
  { unique: true }
)
// 老数据迁移查询：按 meta.makeupOf 反查所有"早期建新行"留下的补课记录。
// 索引保留只为一次性迁移用，迁完可由运维 drop；新代码不会再写这个字段。
LessonAttendanceSchema.index({ 'meta.makeupOf': 1 })
// 按机构统计各状态考勤（出勤率报表）
LessonAttendanceSchema.index({ org: 1, status: 1 })
//查"这个学生的全部考勤记录"（家长端课表）
LessonAttendanceSchema.index({ student: 1 })

module.exports = model('LessonAttendance', LessonAttendanceSchema)
