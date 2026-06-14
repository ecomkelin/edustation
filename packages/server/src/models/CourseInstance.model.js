'use strict'

const { Schema, model } = require('mongoose')
const { COURSE_INSTANCE_STATUSES, SCHEDULE_PLAN_MODES } = require('@shared/enums')

/**
 * 开班（CourseInstance）
 *
 * "把一门课程产品在某个时间点、按某个老师/教室开成一期班" 的实体。
 * 是排课（LessonSchedule）和报名（CourseEnrollment）的直接父对象。
 *
 * 典型生命周期：
 *   planning   → 教务创建开班，配置老师/教室/开课日期，但还没对外招生
 *   enrolling  → 开始招生，家长可以下单 + 报名；这一阶段仍可调整开课日期
 *   active     → 已经开课，进入正常排课消课阶段
 *   closed     → 已结班，所有排课都完成；不再接受新报名
 *
 * 与 CourseProduct 的区别：
 *   - CourseProduct 是"卖什么、卖多少钱、有效期多长"的售卖规格 + 教学大纲
 *   - CourseInstance 是"哪一天、哪个老师、哪个教室开课"的具体一期
 *   - 一个 CourseProduct 可以对应多个 CourseInstance（不同期、不同班）
 *
 * ─── schedulePlan（排课计划）───
 * 定义"本次开班按什么节奏上课"，用于：
 *   - 批量排课时按 frequency + restDays 自动生成 LessonSchedule 列表
 *   - UI 上展示"每周 X 课，周 Y 休"
 *   - 预估结课日期 = startDate + ceil(totalPlannedLessons / lessonsPerWeek) 周（粗估）
 *
 * ─── acceptedCourseProducts（接受消课的课程产品）───
 * 消课时允许使用的 StudentProduct 对应的课程产品列表，默认 `[courseProduct]`。
 * 当配置为多个时：学生持有任一 acceptedCourseProducts 下的、未过期、remainingLessons>0
 * 的 StudentProduct 都可用于消课——支撑"主课带附课""老学员课包沿用"等场景。
 */

/** 排课计划子文档（schedulePlan）
 *
 * 支持两种排课节奏（互斥，由 mode 决定）：
 *  - weekly（默认）：每周 N 节 + 每周固定休息日；按日历周生成
 *  - cycle：上 X 休 Y（连续滚动周期；不绑日历周；如"上 5 休 1"）
 *
 *    weekly 模式必须给：lessonsPerWeek（1-7）、restDays（可选）
 *    cycle  模式必须给：cycleOnDays（>= 1）、cycleOffDays（>= 1）
 *    两种模式都要给：totalPlannedLessons、minutesPerLesson（可选）
 */
const SchedulePlanSchema = new Schema(
  {
    // 排课模式（默认 weekly，向后兼容旧数据）
    mode: { type: String, enum: SCHEDULE_PLAN_MODES, default: 'weekly' },
    // ── weekly 模式字段 ──
    // 每周上课次数（1-7；例如"每周 2 节"）
    lessonsPerWeek: { type: Number, min: 1, max: 7, default: null },
    // 每周固定休息日（0=周日, 1=周一, ..., 6=周六）
    // 例：[0, 3] 表示"周日、周三休"；空数组表示"无固定休息日"
    restDays: { type: [Number], default: [], validate: (v) => v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) },
    // ── cycle 模式字段 ──
    // 连续上课天数（如 5）
    cycleOnDays: { type: Number, min: 1, default: null },
    // 连续休息天数（如 1）
    cycleOffDays: { type: Number, min: 1, default: null },
    // ── 共同字段 ──
    // 本次开班计划的总课时数（默认 = CourseProduct.totalLessons，可在开班时调整）
    totalPlannedLessons: { type: Number, required: true, min: 1 },
    // 本次开班每节时长（可空；为空时回落 CourseProduct.minutesPerLesson）
    minutesPerLesson: { type: Number, min: 1 }
  },
  { _id: false }
)

/** ─── 教学体系子文档 ───
 *
 * 开班在创建时从 Subject 快照 syllabus + lessonMaterials 进来（snapshot 子文档）。
 * 后续 Subject 改了不影响已开班的内容；教务可在本开班上做特例覆盖（override 子文档）。
 *
 * 三层解析顺序（读）：LessonSchedule.override → CourseInstance.override → CourseInstance.snapshot → Subject.current
 * 课件维度仅按"实体+字段"追踪引用（不区分 lessonNo），由 fileBind 统一维护。
 */

/** 教学大纲中一节课（与 Subject.syllabus.lessons[].shape 完全一致） */
const SyllabusLessonSchema = new Schema(
  {
    lessonNo: { type: Number, required: true, min: 1 },
    topic: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },
    objectives: { type: [String], default: [] },
    durationMinutes: { type: Number, min: 1, default: null }
  },
  { _id: false }
)

/** 教学大纲子文档（snapshot / override 同 shape） */
const SyllabusDocSchema = new Schema(
  {
    // snapshot 用：快照捕获时间 + Subject 当时的 version（updatedAt）
    capturedAt: { type: Date, default: null },
    subjectVersion: { type: Date, default: null },
    totalLessons: { type: Number, min: 0, default: 0 },
    lessons: { type: [SyllabusLessonSchema], default: [] }
  },
  { _id: false }
)

/** 课件分组（按 lessonNo） */
const LessonMaterialItemSchema = new Schema(
  {
    lessonNo: { type: Number, required: true, min: 1 },
    // 课件 fileId 列表；走 fileBind（field='lessonMaterials'）维护引用追踪
    fileIds: { type: [Schema.Types.ObjectId], ref: 'File', default: [] }
  },
  { _id: false }
)

/** 每堂课课件子文档（snapshot / override 同 shape） */
const LessonMaterialsDocSchema = new Schema(
  {
    capturedAt: { type: Date, default: null },
    subjectVersion: { type: Date, default: null },
    items: { type: [LessonMaterialItemSchema], default: [] }
  },
  { _id: false }
)

const CourseInstanceSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 关联的课程产品（教学大纲 + 售卖规格）
    courseProduct: { type: Schema.Types.ObjectId, ref: 'CourseProduct', required: true },
    // 实际教学科目（单值；advisory 与 courseProduct.subjects 对齐，不强制）
    // 不在 Mongoose 层加 required：旧数据可能缺失，由 service/表单层校验
    subject: { type: Schema.Types.ObjectId, ref: 'Subject' },
    // 开班名称（可选；如"2026 春季 数学 A 班"）
    name: { type: String, trim: true, default: '' },
    // 课程简介（可选；长文本）
    description: { type: String, default: '' },
    // 老师简介（可选；老师尚未确定时也可先填）
    teacherIntro: { type: String, default: '' },
    // 授课老师（必须是该机构下具有"老师"岗位的 User；可选，
    // 允许"开班时暂未确定老师"的状态。org-scope 由 service 层校验）
    teacher: { type: Schema.Types.ObjectId, ref: 'User' },
    // 上课教室（可空：未指定教室的开班在排课时再分配）
    room: { type: Schema.Types.ObjectId, ref: 'Room' },
    // 排课计划（每周几节课 / 休息日 / 总课次 / 单节时长）
    schedulePlan: { type: SchedulePlanSchema, required: true },
    // 消课时允许使用的 StudentProduct 对应的课程产品列表
    // 默认 = [courseProduct]；可扩展为多产品互认（主课带附课、跨产品课包）
    acceptedCourseProducts: {
      type: [Schema.Types.ObjectId],
      ref: 'CourseProduct',
      default: function () { return [this.courseProduct] }
    },
    // 开课日期（仅"哪天开班"，具体每节课时间在 LessonSchedule 里）
    startDate: { type: Date, required: true },
    // 预计结束日期 = startDate + ceil(totalPlannedLessons / lessonsPerWeek) * 7 天
    // 由 service 在 create / update 时自动计算并写入，前端只读展示。
    estimatedEndDate: { type: Date, default: null },
    // 名额上限：仅作为 UI 上的招生参考，**不**在 CourseEnrollment 创建时强制
    // 校验（业务上允许超额报名，超额后通过"分班"——修改部分学生的 courseInstance
    // ——来解决，详见 CLAUDE.md 第 7.4 节）。
    maxStudents: { type: Number, default: 10, min: 1 },
    // 状态机：见文件头说明
    status: { type: String, enum: COURSE_INSTANCE_STATUSES, default: 'planning' },
    // 状态变更审计：每次 setStatus 都追加一条
    statusLog: [{
      from: { type: String, enum: COURSE_INSTANCE_STATUSES },
      to: { type: String, enum: COURSE_INSTANCE_STATUSES, required: true },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date, default: Date.now },
      reason: { type: String, default: '' },
      _id: false
    }],
    // 软删时间戳：非 null 表示已删除；list / detail 查询统一过滤掉
    deletedAt: { type: Date, default: null },
    // 是否试听专用开班（招生/试听功能）：true 时为机构 [试听专用] 兜底开班,
    // 排课处允许排试听课 (isTrialLesson=true 的 LessonSchedule 挂此 instance),
    // list 默认过滤 (除非 ?includeTrial=true); 详见 plans/staged-roaming-honey.md
    isTrial: { type: Boolean, default: false, index: true },
    // ─── 教学体系：snapshot + override ───
    // 教学大纲快照（创建时从 Subject 拷贝进来；后续 Subject 改了不影响已开班）
    syllabusSnapshot: { type: SyllabusDocSchema, default: () => ({ totalLessons: 0, lessons: [] }) },
    // 课件快照（同上）
    lessonMaterialsSnapshot: { type: LessonMaterialsDocSchema, default: () => ({ items: [] }) },
    // 教学大纲特例覆盖（教务可针对本开班调整某些课的主题/内容/目标）
    syllabusOverride: { type: SyllabusDocSchema, default: () => ({ totalLessons: 0, lessons: [] }) },
    // 课件特例覆盖（同上，按 lessonNo 追加 fileId）
    lessonMaterialsOverride: { type: LessonMaterialsDocSchema, default: () => ({ items: [] }) }
  },
  { timestamps: true, collection: 'course_instances' }
)

// schedulePlan.totalPlannedLessons 必须 >= 1（SchedulePlanSchema 已校验）
// 进一步约束：
//  - weekly 模式：totalPlannedLessons >= lessonsPerWeek（每周至少能排 lessonsPerWeek 节）
//  - cycle  模式：totalPlannedLessons >= 1（>= 1 是 schema 本身的约束；不强求 >= (cycleOnDays + cycleOffDays)）
// 业务上更精细的校验（如 cycleOnDays < cycleOffDays 等）放在 service 层做。
SchedulePlanSchema.path('totalPlannedLessons').validate(function (v) {
  const mode = this.mode || 'weekly'
  if (mode === 'weekly') {
    return v >= (this.lessonsPerWeek || 0)
  }
  // cycle 模式：只校验 >= 1（schema 已有 min: 1）
  return v >= 1
}, 'schedulePlan.totalPlannedLessons 校验失败')

// 按机构 + 状态过滤（机构工作台常见查询）
CourseInstanceSchema.index({ org: 1, status: 1 })
// 按老师查"我带的班"
CourseInstanceSchema.index({ teacher: 1 })
// 按课程产品查"这个产品开过几期"
CourseInstanceSchema.index({ courseProduct: 1 })
// 按科目查"这个科目开了几个班"
CourseInstanceSchema.index({ org: 1, subject: 1 })
// 查"消课可用课包"反向匹配（前端"我的可消课产品"）
CourseInstanceSchema.index({ org: 1, acceptedCourseProducts: 1 })
// 软删过滤：partial 让 deletedAt 为 null 的文档不占索引
CourseInstanceSchema.index(
  { org: 1, deletedAt: 1 },
  { partialFilterExpression: { deletedAt: { $type: 'date' } } }
)

module.exports = model('CourseInstance', CourseInstanceSchema)
