'use strict'

const { Schema, model } = require('mongoose')
const { COURSE_ENROLLMENT_STATUSES } = require('@shared/enums')

/**
 * 课程报名（CourseEnrollment）
 *
 * 学生 ↔ 开班（CourseInstance）的关系记录。
 * 一次报名表示：某个学生"占位"在某个开班里，可以参加该开班的所有排课。
 *
 * 创建时校验（在 service 层执行，宽松策略）：
 *  1. CourseInstance.status ∈ {enrolling, active}   —— 必须还在招/开班中
 *
 * 业务上**不**做以下前置校验，理由：
 *  - 不校验 StudentProduct：家长/教务可以先把学生报进开班，购课（下单
 *    → 创建 StudentProduct）放到后面再补。学生能否真正消课、能否生成
 *    LessonAttendance，由 LessonSchedule.service 在排课时按"是否有有效
 *    StudentProduct"逐个判断。
 *  - 不校验 maxStudents 名额：超额报名是允许的；业务上的"分班"动作是
 *    把部分学生从当前开班 move 到另一个开班（修改 courseInstance），不是
 *    在前置环节拒绝超额。CourseInstance.maxStudents 仅作为 UI 上的参考。
 *
 * 状态机：
 *   enrolled → archived  （归档：开班 active→closed 时由后端级联自动写入；
 *                          个别学生可由管理员经 setStatus 手工覆盖）
 *   enrolled → dropped   （教务强制退班：开班已有排课，但学生不再继续；记录 dropReason）
 *   enrolled → withdrew  （家长主动退班：开班尚未归档时退出；通常会涉及退费/退课包）
 *
 * 索引说明：
 *   - (student, courseInstance) 唯一：防止同一学生在同一开班重复报名
 *   - (org, courseInstance, status)：按开班统计各状态人数
 *   - (org, student, status)：查"这个学生在该机构下所有进行中报名"
 */
const CourseEnrollmentSchema = new Schema(
  {
    // 所属机构（多租户隔离字段；所有业务查询都必须带 org 过滤）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 报名的学生
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    // 报名的开班
    courseInstance: { type: Schema.Types.ObjectId, ref: 'CourseInstance', required: true },
    // 报名状态；具体取值见 @shared/enums 的 COURSE_ENROLLMENT_STATUSES
    status: { type: String, enum: COURSE_ENROLLMENT_STATUSES, default: 'enrolled' },
    // 报名时间（创建即写）
    enrolledAt: { type: Date, default: Date.now },
    // 归档时间（status -> archived 时由 service 写入；亦可由 courseInstance 关闭时级联写入）
    archivedAt: { type: Date },
    // 退班/退出时间（status -> dropped / withdrew 时由 service 写入）
    droppedAt: { type: Date },
    // 退班原因（教务填写，最长 500 字）
    dropReason: { type: String, maxlength: 500 },
    // ★主用课包（可选）：该学生在该开班里"主用"的 StudentProduct。
    //   - 创建时由 service 按 FIFO 自动选 acceptedCourseProducts 范围内的有效课包；
    //   - 教务可在「报名管理」里手动改（应对"分班/换包/指定赠课优先扣"等场景）；
    //   - null 表示该学生暂无任何可用课包（排课时不会生成考勤，提示家长续费）。
    //   - 注意：本字段只代表"主用"，排课考勤生成和消课时仍按 FIFO 兜底（见 lessonSchedule.service）。
    studentProduct: {
      type: Schema.Types.ObjectId,
      ref: 'StudentProduct',
      default: null
    },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'course_enrollments' }
)

// 同一学生在同一开班只能报一次
CourseEnrollmentSchema.index({ student: 1, courseInstance: 1 }, { unique: true })
// 按开班 / 状态聚合统计
CourseEnrollmentSchema.index({ org: 1, courseInstance: 1, status: 1 })
// 查"学生在该机构的所有进行中报名"
CourseEnrollmentSchema.index({ org: 1, student: 1, status: 1 })
// 按 studentProduct 反查：哪些报名绑定了该课包（用于赠课定向分配场景）
CourseEnrollmentSchema.index({ org: 1, studentProduct: 1 }, { sparse: true })

module.exports = model('CourseEnrollment', CourseEnrollmentSchema)
