'use strict'

const { Schema, model } = require('mongoose')

/**
 * 学科（Subject）
 *
 * 一个 Subject 对应一个**细分到教学粒度**的课程类目。
 * 例：某机构可创建"python 初级"/"python 高级"/"scratch 初级"/"scratch 高级"/
 *    "C++ 高级"等多个 Subject，每个 Subject 都带自己的教学大纲 + 每堂课课件。
 *
 * Subject 是 CourseInstance 在创建时**快照**教学内容的"源"——
 * 教务可以在 CourseInstance 上加自己的特例覆盖，老师可以在 LessonSchedule 上再加单节覆盖。
 *
 * 字段说明：
 *   - objectives: 教学目标（多行；前端按列表渲染，例如"掌握基本笔法"/"完成 5 幅作品"）
 *   - posterFileId: 学科宣传海报（家长端 C 端展示用，引用 File 文档；scope='subjectSyllabus'）
 *   - description: 课程简介（富文本；可包含图片、链接）
 *   - videoFileId:  宣传视频（机构介绍/名师介绍等，引用 File 文档；scope='subjectSyllabus'）
 *   - category:   学科分类（引用 Category 字典，model='Subject'），便于按"艺术/科技"等大类筛选
 *   - syllabus:   教学大纲（按 lessonNo 1..N 描述每节课主题/内容/目标/时长）
 *   - lessonMaterials: 每堂课课件（按 lessonNo 分组的 [fileId]）
 */

/** 教学大纲中的一节课
 *
 *  - lessonNo: 与开班/排课的 lessonNo 对齐；1..N
 *  - topic: 节主题（"python 入门 - 变量与类型"）
 *  - description: 这节课讲什么（多行；可包含示例代码、图示说明）
 *  - objectives: 本节学习目标（多条）
 *  - durationMinutes: 本节时长（可空；为空时回落到 CourseInstance.schedulePlan.minutesPerLesson
 *                    或 CourseProduct.minutesPerLesson）
 */
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

/** 教学大纲子文档 */
const SyllabusSchema = new Schema(
  {
    // 大纲总节数（冗余；>= lessons.length；便于校验完整性）
    totalLessons: { type: Number, min: 0, default: 0 },
    lessons: { type: [SyllabusLessonSchema], default: [] }
  },
  { _id: false }
)

/**
 * 单条课件子文档 (2026-07-28 加富文本支持)
 *
 *  - kind='file' : 仅 fileId；走 fileBind（field='lessonMaterials'）维护引用追踪，
 *                  PDF/视频课件
 *  - kind='html' : 仅 htmlContent；纯文本不入 fileBind (不走引用追踪,也不计存储配额),
 *                  用于教师直接贴富文本(标签/段落/列表/链接/图片)
 *
 * fileIds 字段保留 (向后兼容旧接口 + 前端某些 fallback)，
 * 实际写入时由 service normalize 派生自 materials[kind=file].fileId。
 */
const LessonMaterialSubMaterialSchema = new Schema(
  {
    kind: { type: String, enum: ['file', 'html'], required: true },
    // kind='file' 时必填
    fileId: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    // kind='html' 时必填
    htmlContent: { type: String, default: '' },
    // 可选标题/简介 (前端列表 chip 显示用)
    title: { type: String, trim: true, default: '' }
  },
  { _id: false }
)

/** 课件分组（按 lessonNo） */
const LessonMaterialItemSchema = new Schema(
  {
    lessonNo: { type: Number, required: true, min: 1 },
    // 课件 fileId 列表；走 fileBind（field='lessonMaterials'）维护引用追踪
    // 由 service.normalizeLessonMaterialsItems 从 materials[kind=file].fileId 派生同步
    fileIds: { type: [Schema.Types.ObjectId], ref: 'File', default: [] },
    // 课件条目数组 (2026-07-28): 支持 file (PDF/视频) + html (富文本) 两种
    materials: { type: [LessonMaterialSubMaterialSchema], default: [] }
  },
  { _id: false }
)

/** 每堂课课件子文档 */
const LessonMaterialsSchema = new Schema(
  {
    items: { type: [LessonMaterialItemSchema], default: [] }
  },
  { _id: false }
)

const SubjectSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 学科名称，例如"python 高级"
    name: { type: String, required: true, trim: true },
    // 教学目标
    objectives: { type: [String], default: [] },
    // 海报（File 引用；scope='subjectSyllabus'，仅 image/*）
    posterFileId: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    // 课程简介（富文本）
    description: { type: String, default: '' },
    // 宣传视频（File 引用；scope='subjectSyllabus'，仅 video/*）
    videoFileId: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    // 学科分类（引用 Category 字典，model='Subject'）；用于按"艺术/科技/体育"等大类筛选
    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    // 教学大纲（按 lessonNo 描述每节课）
    syllabus: { type: SyllabusSchema, default: () => ({ totalLessons: 0, lessons: [] }) },
    // 每堂课课件（按 lessonNo 分组的 fileId 数组）
    lessonMaterials: { type: LessonMaterialsSchema, default: () => ({ items: [] }) }
  },
  { timestamps: true, collection: 'subjects' }
)

// 同一机构内学科名唯一
SubjectSchema.index({ org: 1, name: 1 }, { unique: true })

module.exports = model('Subject', SubjectSchema)
