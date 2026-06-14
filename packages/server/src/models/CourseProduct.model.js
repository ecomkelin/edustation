'use strict'

const { Schema, model } = require('mongoose')

/**
 * 课程产品（CourseProduct）
 *
 * 合并了原 CourseTemplate（教学大纲）和 CoursePackage（售卖规格）：
 * 一个产品既描述了"课的内容"，也描述了"课的价格/有效期"。
 *
 *   - 开班（CourseInstance）以本产品为基础；
 *   - 学生购买的 StudentProduct 也指向本产品（validDays 决定 StudentProduct.expireDate）。
 *
 * 字段语义：
 *   - subjects:     关联学科（数组；**建议性**——给学生报名时作为"该产品适合的学科"
 *                   参考，可空、可多；非必填、不做强校验，详见 service 层）
 *   - totalLessons: 该产品承诺的总课时数（例如 48 节/96 节）
 *   - minutesPerLesson: 单节课时长（分钟；默认 90；用于 UI 展示"每节课多久"、
 *                       排课占用时间块的预估；不参与业务强约束）
 *   - validDays:    自购买日起，多少天内有效（用于推算 StudentProduct.expireDate）
 *   - 三档价格：   originalPrice / discountPrice / promotionPrice
 *                   （见下方"三档价格"章节）
 *   - syllabus:     教学大纲文本（也可放到子表存储细到每节的内容）
 *
 * 后续若需要把"教学大纲"和"售卖规格"再拆开（例如同一大纲有 48节/96节 两种规格），
 * 可引入 CoursePackage 指向 CourseProduct。当前 MVP 用单层结构即可。
 *
 * ─── 三档价格 ───
 * 商业核心：原价 > 折扣价 > 活动价 >= 0。
 *  - originalPrice（原价）：心理锚点，**不直接销售**；用于前端"划线价"展示
 *  - discountPrice（折扣价）：默认销售价；订单创建时拷贝到 Order.items[].unitPrice
 *  - promotionPrice（活动价）：限时活动价；仅当 promotionActive=true 时才在 UI 展示与可销售
 *  - promotionActive: Boolean；机构管理员手动开关；不开放给家长编辑
 *  - 促销价可以为 0（"免费赠课"），活动期间使用
 *  - service 层校验三档价格单调；调整价格时不破坏历史订单（订单创建时已快照）
 */
const CourseProductSchema = new Schema(
  {
    // 所属机构（多租户隔离；不同机构的同名产品互不影响）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    // 关联学科（数组，可空，可多个）
    //  - 业务上"建议性"：给学生报名/购课时作为"该产品适合的学科"参考
    //  - 旧版本为单个 ObjectId 且必填；为兼容已有数据保留字段名 `subjects`，
    //    不做迁移（MVP 阶段可接受历史文档中该字段为缺失/单值的情况，service
    //    层读取时统一以数组形态处理）
    subjects: { type: [Schema.Types.ObjectId], ref: 'Subject', default: [] },
    // 产品名称，例如"国画 48 课时包"
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // 总课时数（最少 1 节；订单确认后写入 StudentProduct.totalLessons）
    totalLessons: { type: Number, required: true, min: 1 },
    // 单节课时长（分钟；默认 90；前端展示 / 排课时间块预估用）
    minutesPerLesson: { type: Number, min: 1, default: 90 },
    // ─── 三档价格 ───
    // 原价（划线价；心理锚点；不直接销售；>= discountPrice）
    originalPrice: { type: Number, required: true, min: 0 },
    // 折扣价（默认销售价；>= promotionPrice 当 promotionActive，否则 promotionPrice 不参与校验）
    discountPrice: { type: Number, required: true, min: 0 },
    // 活动价（仅在 promotionActive=true 时生效；>= 0；可设为 0 表示"免费赠课"）
    promotionPrice: { type: Number, required: true, min: 0 },
    // 活动价是否启用（默认 false；机构管理员手动切换）
    promotionActive: { type: Boolean, default: false },
    // 有效天数（自 StudentProduct 生效日起，过期即不可用于消课）
    validDays: { type: Number, required: true, min: 1 },
    // 教学大纲（最多 2000 字；如需更细可后续拆成 LessonSyllabus 子表）
    syllabus: { type: String, maxlength: 2000 },
    // 课程附件：课件 PDF / 大纲文档 / 参考资料图片等
    //   引用 File 文档 ID（与 StudentWork.fileUrls 区分：本字段存 id 而非 url）
    //   前端拿到 id 后拼 `${baseUrl}/storage/files/${id}` 拿 url，或列表里直接 include url
    attachments: { type: [Schema.Types.ObjectId], ref: 'File', default: [] },
    // 是否上架；false 时家长端/招生页不再展示，历史数据仍保留
    isActive: { type: Boolean, default: true },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'course_products' }
)

// 三档价格不变式校验：
//  - originalPrice > discountPrice（永远）
//  - 当 promotionActive=true 时 discountPrice > promotionPrice
//  - 防止误填（如原价 100 折后价 99），由 service 在 update 路径同步校验
CourseProductSchema.path('originalPrice').validate(function (v) {
  if (this.discountPrice != null && v <= this.discountPrice) {
    return false
  }
  return true
}, 'originalPrice 必须大于 discountPrice')
CourseProductSchema.path('discountPrice').validate(function (v) {
  if (v <= 0) return true // 允许 0 元课
  if (this.originalPrice != null && v >= this.originalPrice) {
    return false
  }
  return true
}, 'discountPrice 必须小于 originalPrice')
CourseProductSchema.path('promotionPrice').validate(function (v) {
  if (!this.promotionActive) return true // 未启用时不参与校验
  if (this.discountPrice != null && v >= this.discountPrice) {
    return false
  }
  return true
}, '启用活动价时，promotionPrice 必须小于 discountPrice')

// 按学科筛选产品（如"国画学科下所有产品"）
CourseProductSchema.index({ org: 1, subjects: 1 })
// 按机构查"在售产品"
CourseProductSchema.index({ org: 1, isActive: 1 })
// 查"当前正在做活动的产品"（前端活动专区）
CourseProductSchema.index({ org: 1, promotionActive: 1, isActive: 1 })

module.exports = model('CourseProduct', CourseProductSchema)
