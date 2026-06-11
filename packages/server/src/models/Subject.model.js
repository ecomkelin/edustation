'use strict'

const { Schema, model } = require('mongoose')

/**
 * 学科（Subject）
 *
 * 机构下"教的科目"，是 CourseProduct 的父分类。
 * 例如某机构可创建"国画"/"书法"/"钢琴"等学科，再在学科下挂具体课程产品。
 *
 * 字段说明：
 *   - objectives: 教学目标（多行；前端按列表渲染，例如"掌握基本笔法"/"完成 5 幅作品"）
 *   - posterUrl:  学科宣传海报（家长端 C 端展示用）
 *   - description: 课程简介（富文本；可包含图片、链接）
 *   - videoUrl:   宣传视频（机构介绍/名师介绍等）
 *   - category:   学科分类（引用 Category 字典，model='Subject'），便于按"艺术/科技"等大类筛选
 */
const SubjectSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 学科名称，例如"国画"/"钢琴启蒙"
    name: { type: String, required: true, trim: true },
    // 教学目标
    objectives: { type: [String], default: [] },
    // 海报
    posterUrl: { type: String, trim: true },
    // 课程简介（富文本）
    description: { type: String, default: '' },
    // 宣传视频
    videoUrl: { type: String, trim: true },
    // 学科分类（引用 Category 字典，model='Subject'）；用于按"艺术/科技/体育"等大类筛选
    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true }
  },
  { timestamps: true, collection: 'subjects' }
)

// 同一机构内学科名唯一
SubjectSchema.index({ org: 1, name: 1 }, { unique: true })

module.exports = model('Subject', SubjectSchema)
