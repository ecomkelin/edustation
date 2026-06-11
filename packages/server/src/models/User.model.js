'use strict'

const { Schema, model } = require('mongoose')

/**
 * 用户（User）
 *
 * 系统登录主体。一个 User 可以身兼多职：
 *   - 平台超管（isPlatformAdmin=true）：可跨机构管理
 *   - 机构员工（管理员/教务/老师/财务）：通过 UserOrgRel.positions 关联
 *   - 家长：监护多个 Student（Student.guardians 数组包含本 User）
 *
 * 注意 Student 不能直接登录 —— 登录由其家长完成，再切换到孩子上下文。
 *
 * 关键安全设计：
 *   - passwordHash 不存明文（select:false；查询默认不带出，需 .select('+passwordHash') 才返回）
 *   - mobile 大陆手机号正则校验
 *   - idCard 选填；填了则全局唯一（partialFilterExpression 排除 null/缺省）
 *   - wechatUnionId 稀疏唯一（未绑定微信时不参与）
 *
 * 关于 idCard 的格式校验（validator）：
 *   - 选填（!v 短路通过）
 *   - 15 位旧证 / 18 位新证（末位可为 X）
 *   - 仅格式校验，不做校验位算法（业务需要时可在 service 层补充）
 */
const UserSchema = new Schema(
  {
    // 登录手机号（大陆 11 位手机号；全局唯一；登录主键）
    mobile: { type: String, required: true, unique: true, trim: true, match: /^1[3-9]\d{9}$/ },
    // 密码哈希（select:false；任何 find() 默认不返回，需要时显式 select('+passwordHash')）
    passwordHash: { type: String, required: true, select: false },
    // 真实姓名（实名/对账用）
    realName: { type: String, trim: true },
    // 头像 URL
    avatar: { type: String },
    // 微信开放平台 unionId（绑定微信登录用；稀疏唯一，未绑定时为 null）
    wechatUnionId: { type: String },
    /**
     * 身份证号。选填；填了则全局唯一（partialFilterExpression 仅在非空时参与）。
     * 15 位旧证 / 18 位新证（末位可为 X）。
     */
    idCard: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (v) => !v || /^\d{15}(\d{2}[\dXx])?$/.test(v),
        message: '身份证号格式不正确'
      }
    },
    /**
     * 现居地。复用平台地区字典 Region（与 Org.region 同源）。
     */
    region: { type: Schema.Types.ObjectId, ref: 'Region', default: null, index: true },
    // 是否平台超管：true 时可访问跨机构管理后台
    isPlatformAdmin: { type: Boolean, default: false },
    // 是否启用；false 时无法登录（保留历史数据，如已离职员工）
    isActive: { type: Boolean, default: true },
    // 黑名单标记(与 isActive 独立): true 时拒绝登录、refresh token 校验、家长端不可见
    //   由超管操作(Platform Admin 专属能力),用于恶意破坏人员封禁
    isBlocked: { type: Boolean, default: false },
    // 禁用时间(便于追踪封禁历史);解禁时置 null
    blockedAt: { type: Date, default: null },
    // 禁用原因(超管在操作时填写,便于事后查询)
    blockedReason: { type: String, default: null },
    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'users' }
)

// 微信 unionId 稀疏唯一：未绑定（null/缺省）时多个用户共存不冲突
UserSchema.index({ wechatUnionId: 1 }, { unique: true, sparse: true })
// 身份证号：填了才唯一。type=string 把 null/缺省排除在外（partial filter 等价于 sparse，但更显式）
UserSchema.index(
  { idCard: 1 },
  { unique: true, partialFilterExpression: { idCard: { $type: 'string' } } }
)
// 按启用状态过滤（"在职/离职用户"列表）
UserSchema.index({ isActive: 1 })
// 按黑名单状态过滤（管理员查看禁用用户）
UserSchema.index({ isBlocked: 1 })

module.exports = model('User', UserSchema)
