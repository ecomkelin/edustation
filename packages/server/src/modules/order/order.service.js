'use strict'

const Order = require('@models/Order.model')
const CourseProduct = require('@models/CourseProduct.model')
const Student = require('@models/Student.model')
const StudentProduct = require('@models/StudentProduct.model')
const LegalDoc = require('@models/LegalDoc.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const { normalizePagination } = require('@utils/pagination')
const { OrderStatus, StudentProductSource } = require('@shared/enums')
const { invalidate: invalidateReportCache } = require('@modules/report/reportCache')
const legalService = require('@modules/legal/legal.service')

/**
 * 计算订单 originalPrice（按 items 各项的 unitPrice * quantity 求和）
 */
function computeOriginalPrice(items) {
  return items.reduce((sum, it) => sum + (it.unitPrice || 0) * (it.quantity || 1), 0)
}

/**
 * 根据 CourseProduct 现状计算 unitPrice（活动期用 promotionPrice，否则用 discountPrice）
 */
function pickUnitPrice(p) {
  if (p.promotionActive && p.promotionPrice != null) return p.promotionPrice
  return p.discountPrice
}

/**
 * 按 items 创建 StudentProduct（source='order'）
 *
 * 数量规则：同一 courseProduct 合并成**一份** SP，quantity 累加到 totalLessons。
 * 例：
 *  - 买「16 节课包 × 3」（1 个 item 或 3 个 item 都一样）→ 1 份 48 节 SP
 *  - 买「国画 16 节 + 书法 24 节」→ 2 份 SP（48 节 / 24 节各自独立）
 *
 * 设计取舍：
 *  - 一个 StudentProduct = 一份完整的、可消费课包；按 quantity 累加避免给家长展示
 *    "16节课包 × 3份"的割裂感，也方便排课时按"哪些产品的总剩余课时还够"判断。
 *  - expireDate 按"购买时间 + CourseProduct.validDays"计算（不随 quantity 翻倍；
 *    多买并不延长期限，符合行业惯例）。
 *
 * 失败时回滚已创建的 StudentProduct。
 * 共用于 create（线下收款直接支付）和 pay（线上/后续收款）两条路径。
 */
async function createStudentProductsForOrder({ order, orgId }) {
  const productIds = order.items.map((it) => it.courseProduct)
  const products = await CourseProduct.find({ _id: { $in: productIds } }).lean()
  if (products.length !== productIds.length) {
    throw ApiError.badRequest('订单中部分课程产品已不存在，无法生成课包')
  }
  const productMap = new Map(products.map((p) => [String(p._id), p]))

  // 同一 courseProduct 多行 item 合并：quantity 累加，最终只生成一份 SP
  const consolidated = new Map() // courseProductId -> 累计 quantity
  for (const it of order.items) {
    const id = String(it.courseProduct)
    consolidated.set(id, (consolidated.get(id) || 0) + (it.quantity || 1))
  }

  const createdStudentProducts = []
  const courseEnrollmentService = require('@modules/courseEnrollment/courseEnrollment.service')
  try {
    for (const [productIdStr, quantity] of consolidated.entries()) {
      const p = productMap.get(productIdStr)
      if (!p) continue
      const totalLessons = p.totalLessons * quantity
      const expireDate = new Date(Date.now() + p.validDays * 24 * 60 * 60 * 1000)
      const sp = await StudentProduct.create({
        org: orgId,
        student: order.student,
        source: StudentProductSource.ORDER,
        order: order._id,
        courseProduct: p._id,
        totalLessons,
        remainingLessons: totalLessons,
        expireDate,
        isActive: true
      })
      createdStudentProducts.push(sp)

      // ★回填主用课包：把刚创建的 SP 写回到该学生在「接受此 courseProduct 且
      //   主用课包为空」的已存在 enrolled 报名上。
      //   业务场景：学生先报名（还没课包）→ 后付款（拿到 SP）→ 此时不绑定，
      //   「进入进行中」的校验会失败。这里补上反向绑定。
      //   不会覆盖教务在「报名管理」里手动指定过的主用课包。
      try {
        await courseEnrollmentService.bindStudentProductToEnrollments({
          orgId, student: order.student, studentProductId: sp._id, courseProduct: p._id
        })
      } catch (_) { /* 单条回填失败不阻断订单 */ }
    }
  } catch (e) {
    if (createdStudentProducts.length) {
      await StudentProduct.deleteMany({ _id: { $in: createdStudentProducts.map((s) => s._id) } })
    }
    throw e
  }

  // 订单付款后不自动补 LessonAttendance。
  // 业务语义（2026-06 修订）：LessonAttendance 仅在 LessonSchedule 「未上课 → 准备上课」
  //   切换时由 lessonSchedule.service.prepare() 一次性生成。
  //   订单付款只负责产出 StudentProduct + 反向绑定 CourseEnrollment.studentProduct，
  //   下一次该开班的 prepare() 会自然把新购课学生纳入考勤名单。

  return createdStudentProducts
}

/**
 * 创建订单。
 *
 * 单节点 Mongo 不支持事务，本方法支持两种业务动作：
 *  - 创建「待支付」订单：不传 paymentMethod / paidAmount → status=pending
 *  - 「员工线下收款」一气呵成：传 paymentMethod + paidAmount → 原子地 status=paid 并按 items 逐项创建 StudentProduct
 *
 * 第二种是门店收银场景：客户到店给现金/扫码，员工在管理后台直接录一笔「已收款」订单，
 * 系统自动给学生建好对应课包，省去「先建单 → 再点收款」的两步操作。
 * 旧的「先 pending 再 /pay」路径仍保留（未来线上支付回调时使用）。
 *
 * items: [{ courseProduct, quantity }]；unitPrice 与 name 在 service 内由 CourseProduct
 * 当前售价快照；originalPrice = Σ unitPrice * quantity。
 *
 * 法律协议 (2026-06):
 *   入参 agreements: [{ docKey, version, type, org? }] — client 下单时携带的协议同意快照
 *   - 如果传入 agreements: 校验每项 LegalDoc(org, key, version, isActive=true) 都存在,
 *     不存在直接 400 + pending 数据让前端重弹层
 *   - 校验通过后写入 Order.agreements + 同步落 UserConsent (idempotent)
 *   - 如果不传 agreements: 视为后台手动开单 (操作员代客户开票), 不强制校验
 *     [TODO 阶段 2] 业务上可加配置"是否所有渠道都强制",目前留口子
 */
async function create({ orgId, student, items, actualPrice, paymentMethod, paidAmount, remark, agreements, actor }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('订单至少包含 1 个 item')
  }
  if (!await Student.exists({ _id: student, org: orgId, isBlocked: { $ne: true } })) {
    throw ApiError.badRequest('学生不存在或已被禁用')
  }

  // 法律协议校验: 如果 client 端传了 agreements, 逐项校验版本一致
  // (后台手动开单不传 agreements 时跳过, 保留后台快捷开单的灵活性)
  if (Array.isArray(agreements) && agreements.length > 0) {
    for (const ag of agreements) {
      if (!ag.docKey || !ag.version || !ag.type) {
        throw ApiError.badRequest('agreement 缺少 docKey / version / type')
      }
      if (ag.type === 'org') {
        const doc = await LegalDoc.findOne({
          org: orgId, key: ag.docKey, version: ag.version, isActive: true
        }).select('_id title version').lean()
        if (!doc) {
          // 把当前生效版本回传, 让前端重弹层让用户重新同意
          const current = await LegalDoc.findOne({ org: orgId, key: ag.docKey, isActive: true })
            .select('key version title').lean()
          throw ApiError.badRequest(
            `《${current ? current.title : ag.docKey}》已升级到新版本, 请重新阅读并同意后再下单`,
            { pending: current ? [{ key: current.key, version: current.version, type: 'org', org: orgId }] : [] }
          )
        }
      }
      // platform 类型的协议在登录拦截已经把关, 这里允许快照入库即可, 不重新校验
    }
  }

  // 「线下收款」分支：paymentMethod + paidAmount 同时存在即视为已收款订单
  const isOfflinePaid = paymentMethod != null && paidAmount != null

  // 1. 加载所有 CourseProduct，校验存在/上架/同机构，并快照 unitPrice + name
  const productIds = items.map((it) => it.courseProduct)
  const products = await CourseProduct.find({
    _id: { $in: productIds },
    org: orgId,
    isActive: true
  }).lean()
  if (products.length !== new Set(productIds).size) {
    throw ApiError.badRequest('存在无效或已下架的课程产品')
  }
  const productMap = new Map(products.map((p) => [String(p._id), p]))

  // 2. 组装 items 快照（unitPrice 取自当前价；name 拷贝）
  const snapshotItems = items.map((it) => {
    const p = productMap.get(String(it.courseProduct))
    if (!p) throw ApiError.badRequest(`课程产品 ${it.courseProduct} 不存在或已下架`)
    return {
      courseProduct: p._id,
      quantity: it.quantity || 1,
      unitPrice: pickUnitPrice(p),
      name: p.name
    }
  })

  const originalPrice = computeOriginalPrice(snapshotItems)

  // 3. 实际成交价兜底（未传时 = originalPrice）
  const finalActualPrice = actualPrice != null ? actualPrice : originalPrice
  if (finalActualPrice < 0 || finalActualPrice > originalPrice) {
    throw ApiError.badRequest('actualPrice 必须在 [0, originalPrice] 范围内')
  }

  // 4. 写入订单
  const initialStatus = isOfflinePaid ? OrderStatus.PAID : OrderStatus.PENDING
  const initialPaidAmount = isOfflinePaid ? paidAmount : 0
  const initialPaidAt = isOfflinePaid ? new Date() : null

  const agreementsSnapshot = Array.isArray(agreements)
    ? agreements.map((a) => ({
      docKey: a.docKey,
      version: a.version,
      type: a.type,
      org: a.type === 'org' ? (a.org || orgId) : null,
      agreedAt: new Date()
    }))
    : []

  const order = await Order.create({
    org: orgId,
    student,
    items: snapshotItems,
    originalPrice,
    actualPrice: finalActualPrice,
    paidAmount: initialPaidAmount,
    paidAt: initialPaidAt,
    status: initialStatus,
    paymentMethod,
    remark,
    agreements: agreementsSnapshot
  })

  // 法律协议: 同步落 UserConsent (append-only, 重复 (user,docKey,version) 被 unique 拦截即忽略)
  // 失败不阻断订单创建 (审计降级, log warn)
  if (actor && actor.userId && agreementsSnapshot.length) {
    try {
      await legalService.recordConsents({
        userId: actor.userId,
        ip: actor.ip || '',
        userAgent: actor.userAgent || '',
        consents: agreementsSnapshot.map((a) => ({
          key: a.docKey, type: a.type, version: a.version, org: a.org
        }))
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[order.create] recordConsents failed: ${e && e.message}`)
    }
  }

  // 5. 「线下收款」分支：按 items 逐项创建 StudentProduct；失败回滚订单
  let createdStudentProducts = []
  if (isOfflinePaid) {
    try {
      createdStudentProducts = await createStudentProductsForOrder({ order, orgId })
    } catch (e) {
      await Order.deleteOne({ _id: order._id })
      throw e
    }
  }

  const populated = await Order.findById(order._id)
    .populate('student', 'name')
    .populate('items.courseProduct', 'name totalLessons validDays discountPrice promotionPrice')
    .lean()

  if (isOfflinePaid) {
    invalidateReportCache(orgId)
    return { order: populated, studentProducts: createdStudentProducts }
  }
  invalidateReportCache(orgId)
  return populated
}

async function list({ orgId, student, status, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (student) filter.student = student
  if (status) filter.status = status
  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate('student', 'name')
      .populate('items.courseProduct', 'name totalLessons validDays discountPrice promotionPrice')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Order.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(id, orgId) {
  const o = await Order.findOne({ _id: id, org: orgId })
    .populate('student', 'name')
    .populate('items.courseProduct')
    .lean()
  if (!o) throw ApiError.notFound('订单不存在')
  return o
}

/**
 * 支付：更新订单状态 + 按 items 逐项创建 StudentProduct（source='order'）
 * 用于已存在的 pending 订单（典型场景：未来线上支付网关异步回调）。
 */
async function pay({ id, orgId, paymentMethod, paidAmount }) {
  const order = await Order.findOne({ _id: id, org: orgId })
  if (!order) throw ApiError.notFound('订单不存在')
  if (order.status !== OrderStatus.PENDING) {
    throw ApiError.badRequest(`订单当前状态 ${order.status}，不可支付`)
  }

  order.status = OrderStatus.PAID
  order.paymentMethod = paymentMethod
  order.paidAmount = paidAmount
  order.paidAt = new Date()
  await order.save()

  const createdStudentProducts = await createStudentProductsForOrder({ order, orgId })

  invalidateReportCache(orgId)
  return {
    order: order.toObject(),
    studentProducts: createdStudentProducts
  }
}

async function cancel({ id, orgId, reason }) {
  const order = await Order.findOne({ _id: id, org: orgId })
  if (!order) throw ApiError.notFound('订单不存在')
  if (order.status === OrderStatus.PAID) {
    throw ApiError.badRequest('已支付订单请联系财务退款')
  }
  if (order.status === OrderStatus.CANCELLED) return order.toObject()
  order.status = OrderStatus.CANCELLED
  if (reason) order.remark = (order.remark || '') + `[取消] ${reason}`
  await order.save()
  invalidateReportCache(orgId)
  return order.toObject()
}

/**
 * 退款（R-1722 2026-06-25 立项）：部分退款支持，累计到 refundedAmount == paidAmount 自动转 refunded
 *
 * 业务规则：
 *   - 状态门：只允许 paid / partially_refunded 退款；其他状态 422
 *   - 金额门：refundAmount ≤ (paidAmount - refundedAmount)；超额 422
 *   - 状态机：累计退完 → refunded；部分退 → partially_refunded
 *   - 联动（**首次**退款时，不重复执行）：
 *       1. 该 Order 创建的所有 StudentProduct（source='order'）软停用 isActive=false
 *          + meta.refundedAt/reason/refundId；保留审计链路
 *       2. CourseEnrollment.studentProduct（主用课包）**不**解绑（软引用，FIFO 兜底）
 *       3. 已有 LessonAttendance.studentProduct 引用保留（populate 不过滤 isActive；审计凭证）
 *   - 幂等：同一订单可多次退款；累计在 Order.refundedAmount
 *   - 缓存：invalidateReportCache(orgId)
 *   - 失败补偿：联动失败时回滚 Order（refunds/amount/status 全回退）+ 422
 *
 * 不开新权限码：复用 mws.requirePermission('order.pay')（permissions.json label 已是"收款 / 退款"）
 */
async function refund({ id, orgId, amount, reason, operator }) {
  // 1. 加载 Order
  const order = await Order.findOne({ _id: id, org: orgId })
  if (!order) throw ApiError.notFound('订单不存在')

  // 2. 状态门：只允许 paid / partially_refunded 退款
  if (![OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED].includes(order.status)) {
    throw ApiError.unprocessable(
      `订单当前状态 ${order.status}，不可退款（仅 paid / partially_refunded 可退）`
    )
  }

  // 3. 金额门：refundAmount ≤ (paidAmount - refundedAmount)
  const refundable = order.paidAmount - (order.refundedAmount || 0)
  if (!(amount > 0)) throw ApiError.badRequest('退款金额必须 > 0')
  if (amount > refundable + 0.01) {  // 容差 0.01 防浮点
    throw ApiError.unprocessable(
      `退款金额超出可退余额（已退 ¥${order.refundedAmount || 0} / 共 ¥${order.paidAmount}）`
    )
  }

  // 4. 计算 SP 课时快照（家长对账 + 报表用）
  //    注意：select 包含 isActive，用于首次联动判断（避免重复 updateMany）
  const sps = await StudentProduct.find({ order: order._id, org: orgId })
    .select('_id remainingLessons totalLessons isActive')
    .lean()
  const remainingLessonsSnapshot = sps.reduce((s, sp) => s + (sp.remainingLessons || 0), 0)
  const consumedLessonsSnapshot = sps.reduce(
    (s, sp) => s + ((sp.totalLessons || 0) - (sp.remainingLessons || 0)),
    0
  )

  // 5. 计算新状态（部分退 / 退完）
  const newRefundedAmount = (order.refundedAmount || 0) + amount
  const isFullyRefunded = newRefundedAmount >= order.paidAmount - 0.01
  const newStatus = isFullyRefunded ? OrderStatus.REFUNDED : OrderStatus.PARTIALLY_REFUNDED

  // 6. 写 Order.refunds + 更新累计 + 状态（单 Mongo 节点无事务，直接 save）
  const { Types } = require('mongoose')
  const refundId = new Types.ObjectId()  // 子文档 _id 预生成（联动时回填到 SP.meta.refundId）
  order.refunds.push({
    _id: refundId,
    amount,
    reason,
    operator: operator.userId,
    refundedAt: new Date(),
    remainingLessonsSnapshot,
    consumedLessonsSnapshot
  })
  order.refundedAmount = newRefundedAmount
  order.refundedAt = new Date()
  order.status = newStatus
  await order.save()

  // 7. 首次退款时联动：软停用 Order 下所有「仍启用」的 SP
  //    多次部分退款时，SP 已在第一次停用，此处跳过（activeSps 为空）
  const activeSps = sps.filter((sp) => sp.isActive !== false)
  if (activeSps.length > 0) {
    try {
      await StudentProduct.updateMany(
        { _id: { $in: activeSps.map((sp) => sp._id) }, org: orgId },
        {
          $set: {
            isActive: false,
            'meta.refundedAt': new Date(),
            'meta.refundReason': reason,
            'meta.refundId': refundId
          }
        }
      )
    } catch (e) {
      // 联动失败 → 回滚 Order（refunds 子文档 + 累计 + 状态）
      order.refunds = order.refunds.filter((r) => !r._id.equals(refundId))
      order.refundedAmount -= amount
      order.refundedAt = order.refunds.length > 0 ? order.refunds[order.refunds.length - 1].refundedAt : null
      order.status = order.refundedAmount > 0 ? OrderStatus.PARTIALLY_REFUNDED : OrderStatus.PAID
      await order.save()
      throw ApiError.unprocessable(`联动停用学员课包失败: ${e.message}`)
    }
  }

  // 8. 失效报告缓存
  invalidateReportCache(orgId)

  // 9. 重新查一次（populate）返回
  const updated = await Order.findById(order._id)
    .populate('student', 'name')
    .populate('items.courseProduct', 'name totalLessons validDays')
    .lean()
  return { order: updated, refundId, newStatus, refundedAmount: newRefundedAmount }
}

/**
 * 互锁检查声明（与 remove / removableCheck 共用同一组，单点维护）
 * - 「Order → StudentProduct」是单向生成关系（service.createStudentProductsForOrder）：
 *   一旦订单有任一关联的 StudentProduct（不论 source='order'/'gift'，不论 isActive=true/false），
 *   物理删除 Order 都会导致课包.order 悬空，因此必挡。
 * - 业务上让员工先在「学生课包」里删掉对应 SP，再回头删 Order。
 */
function orderUsageChecks(orgId, orderId) {
  return [
    {
      model: StudentProduct,
      filter: { org: orgId, order: orderId },
      label: '关联的学员课包',
      hint: '请先删除该订单产生的学员课包（StudentProduct）后再删订单'
    }
  ]
}

/**
 * 物理删除订单（2026-06-25 立项）
 *
 * 门控：
 *   1. requirePlatformPassword（路由层）：超管 + 自身密码
 *   2. 业务硬门：paid / refunded 订单禁止物理删除（财务凭证不能丢，引导走取消+退款）
 *   3. assertUnused：StudentProduct.order == id 必须 count=0
 *
 * 失败响应：
 *   - 业务硬门 → ApiError.unprocessable（422）
 *   - assertUnused 失败 → ApiError.unprocessable（422）+ data.blockers
 *   - 不存在 → ApiError.notFound（404）
 *
 * 成功：物理删除 + 失效本机构报告缓存
 */
async function remove(id, orgId) {
  const order = await Order.findOne({ _id: id, org: orgId }).select('_id status').lean()
  if (!order) throw ApiError.notFound('订单不存在')
  if (order.status === OrderStatus.PAID) {
    throw ApiError.unprocessable('已支付订单请联系财务走退款流程，不支持物理删除')
  }
  if (order.status === OrderStatus.REFUNDED) {
    throw ApiError.unprocessable('已退款订单不支持物理删除，留作财务凭证')
  }
  await removable.assertUnused(orgId, orderUsageChecks(orgId, id))
  await Order.deleteOne({ _id: id, org: orgId })
  invalidateReportCache(orgId)
  return { success: true, id }
}

/**
 * 删除预检（2026-06-25 立项）
 *
 * 与 remove 走同一组 orderUsageChecks（单点维护），保证挡板与实际删除语义完全一致。
 * 业务硬门（paid / refunded）也反映到预检结果，让前端按钮在挡板阶段就拦下。
 */
async function removableCheck(id, orgId) {
  const order = await Order.findOne({ _id: id, org: orgId }).select('_id status').lean()
  if (!order) {
    return {
      canRemove: false,
      blockers: [{ entity: 'Order', label: '订单', count: 0, hint: '该订单不存在或不属于本机构' }]
    }
  }
  if (order.status === OrderStatus.PAID) {
    return {
      canRemove: false,
      blockers: [{ entity: 'Order', label: '订单状态', count: 1, hint: '已支付订单请联系财务走退款流程，不支持物理删除' }]
    }
  }
  if (order.status === OrderStatus.REFUNDED) {
    return {
      canRemove: false,
      blockers: [{ entity: 'Order', label: '订单状态', count: 1, hint: '已退款订单不支持物理删除，留作财务凭证' }]
    }
  }
  return removable.check(orgId, orderUsageChecks(orgId, id))
}

module.exports = {
  create,
  list,
  detail,
  pay,
  cancel,
  refund,
  remove,
  removableCheck,
  computeOriginalPrice,
  pickUnitPrice,
  createStudentProductsForOrder
}
