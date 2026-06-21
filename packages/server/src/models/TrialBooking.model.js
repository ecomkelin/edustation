'use strict'

const { Schema, model } = require('mongoose')

/**
 * 试听预约 (TrialBooking) / 试听记录
 *
 * 业务上代表"一个孩子的一次试听参与记录"。ChildLead 1:N TrialBooking:
 *   - 同 ChildLead 第一次约: attemptNo=1
 *   - cancelled 后再约: 创建新一笔 TrialBooking, attemptNo=max+1
 *   - 试听完成后 (status=completed) 填 result.isEnrolled 决定是否触发转化
 *
 * 关键设计:
 *   - preStudent 引用 ChildLead (2026-06 改造, 替代 Lead)
 *   - parent 冗余, 加速"该家长的所有试听"查询
 *   - consultant 谈单老师 (与 teacher 上课老师分离, 写到顶级字段)
 *   - **2026-06-21: 彻底拆出 attached/solo 模式**:
 *     - 试听课**完全独立**于正式排课系统, 不再 attach 到 LessonSchedule
 *     - 删 joinMode / lessonSchedule 字段 (attached 模式是老流程的遗迹)
 *     - 时间/老师/教室/科目直接存在本 booking 上
 *   - 与 LessonAttendance 完全无关: 试听课不生成 LessonAttendance, 也不消耗 StudentProduct。
 *
 * 状态机 (2026-06-16 调整: 删除 no_show; 2026-06-20 加 considering; 2026-06-21 拆出 attached):
 *   awaiting_schedule → scheduled → arrived → completed
 *                              ↓        ↓        ↓
 *                          cancelled   considering (考虑期)
 *                                            ↓
 *                                       completed (跟进后定夺: 报名/不报名)
 *   - scheduled 状态可改预约时间 (rescheduleTime) 或退回到 awaiting_schedule (revertToUnscheduled)
 *   - arrived → considering: 试听做完但家长没当场决定, 谈单老师后续跟进
 *   - considering → completed: 谈单老师跟进后家长确定 (result.isEnrolled=true 触发转化; false 关闭)
 *   - 取消一律走 cancelled; 任何状态均可删除 (高危操作)
 *
 * 转化流程 (claim token 模式, 不依赖 mongoose 事务):
 *   1. TrialBooking.result.isEnrolled: null → true  (原子翻转作为重试安全 token)
 *   2. User/Student/UserOrgRel upsert 链 (每个独立幂等)
 *      - User upsert 用 parent.phone, 同 parent 下首孩转化时建账号, 次孩复用
 *   3. Parent.user 回填 (仅首次)
 *   4. ChildLead 写回 convertedStudent/At
 *   5. (2026-06-16 取消) 不再自动 mark 同 parent 下其他 ChildLead — 逐孩转化
 *   6. Parent.lifecycle 重算
 *   5 分钟内可撤销, 见 childLead.service.unconvert
 */
const TrialBookingSchema = new Schema(
  {
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },

    // 关联 ChildLead (2026-06 改造)
    preStudent: { type: Schema.Types.ObjectId, ref: 'ChildLead', required: true, index: true },

    // 冗余, 加速"该家长的所有试听"查询 (业务上不需要再 join Parent)
    parent: { type: Schema.Types.ObjectId, ref: 'Parent', default: null, index: true },

    // 第几次预约 (per childLead; 与 preStudent 联合唯一)
    attemptNo: { type: Number, required: true, min: 1, default: 1 },

    // ─── 时间 ───
    // 计划时间; 排课前 (awaiting_schedule) 允许 null; 排课后 = 选定的开始时间
    scheduledAt: { type: Date, default: null },
    // 试听时长 (分钟)
    scheduledDuration: { type: Number, default: 60, min: 1 },

    // ─── 人员 ───
    // 试听上课老师; awaiting_schedule 状态允许 null
    teacher: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 试听教室 (2026-06-21: 仍是 solo 模式用, 试听排课必填或允许空 — 业务上"就地谈"也常见)
    room: { type: Schema.Types.ObjectId, ref: 'Room', default: null },
    // 试听科目类别 (2026-06-18: 录入侧只标记"试听类别", 真正的 Subject 排课时由老师判定)
    //   跟 ChildLead.trialSubject(s) 保持一致; 排课时根据类别选具体 Subject 建 LessonSchedule.subject
    subject: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    // 谈单老师 (到店后填)
    //   业务上 teacher (上课) 与 consultant (谈单) 常是不同人
    //   2026-06-21: 之前 result.negotiateTeacher 是 alias, 删了, 只保留顶级 consultant
    consultant: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // ─── 状态机 (2026-06-16 删 no_show; 2026-06-20 加 considering) ───
    // considering: 试听完成 (arrived) 但家长没当场定夺, 谈单老师后续跟进,
    //   跟进完成时再翻回 completed 并填 result.isEnrolled (true 触发转化 / false 关闭)
    status: {
      type: String,
      enum: ['awaiting_schedule', 'scheduled', 'arrived', 'completed', 'considering', 'cancelled'],
      default: 'awaiting_schedule',
      required: true
    },

    // ─── 实际到店 ───
    actualStartTime: { type: Date, default: null },
    actualEndTime: { type: Date, default: null },

    // ─── 转化结果 (status=completed 时填; 2026-06-20 considering 拆出后回退 boolean) ───
    // isEnrolled: null=未填; true=已报名 (触发转化流程); false=不报名
    //   considering 状态拆到顶级 status 字段 (2026-06-20); result 只承载"已定夺"信息
    // 2026-06-21: result.negotiateTeacher 删了, 谈单老师统一走顶级 consultant 字段
    result: {
      isEnrolled: { type: Boolean, default: null },
      // 吸引报名的点 (仅 isEnrolled=true 时填)
      attractionPoint: { type: String, default: '' },
      // 为什么不报名 (仅 isEnrolled=false 时填)
      reasonNotEnrolled: { type: String, default: '' },
      // 2026-06-18 引入, 2026-06-20 改用途: 考虑期跟进日志
      //   - considering 状态进入时: 记录家长当下态度/顾虑
      //   - considering → completed 时: 保留历史态度作为参考 (业务上谈单老师看态度调整跟进策略)
      considerNote: { type: String, default: '' },
      // 2026-06-21 新增: 孩子课堂表现/反馈 (考虑中时)
      //   - 业务: 跟进电话时引述孩子的表现增强说服力 ("您孩子刚才做项目时...")
      //   - 选填; 不强制, 但业务上建议填
      childNote: { type: String, default: '' },
      // 2026-06-21 新增: 后续电话跟进话术准备 (考虑中时)
      //   - 业务: 谈单老师打电话前先看这个, 准备切入点 + 报价策略 + 异议处理
      //   - 选填; 老咨询师不需要, 新人需要
      followUpScript: { type: String, default: '' },
      // 转化时间 (isEnrolled 翻为 true 的时间, 用于 5 分钟撤销窗口判断)
      enrolledAt: { type: Date, default: null },
      _id: false
    },

    // 备注
    remark: { type: String, default: '' },
    // 创建人 (录入 childLead 时自动建的 first booking 用的 createdBy = childLead.createdBy)
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'trial_bookings' }
)

// 同一 childLead 下 attemptNo 唯一
TrialBookingSchema.index({ preStudent: 1, attemptNo: 1 }, { unique: true })
// 看板主查询: 机构 + 状态 + 时间
TrialBookingSchema.index({ org: 1, status: 1, scheduledAt: 1 })
// 老师课表 (试听课视角)
TrialBookingSchema.index({ teacher: 1, scheduledAt: 1 })
// 看板按科目筛
TrialBookingSchema.index({ org: 1, status: 1, subject: 1 })
// 家长维度
TrialBookingSchema.index({ parent: 1, status: 1, createdAt: -1 })

module.exports = model('TrialBooking', TrialBookingSchema)
