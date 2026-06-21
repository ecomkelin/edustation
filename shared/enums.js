'use strict'

/**
 * 前后端共享枚举定义。
 * 所有需要选项的字段在模型、controller、admin form 中都引用这里。
 */

/**
 * 机构业态分类 (2026-06 整改:从 3 类扩展到 10 类)
 * 硬编码平台层统一枚举; Category 字典的 model='Org' 已下线。
 *  - academic       学科类 (K12 语数英, 双减后大幅压减)
 *  - arts           艺术类 (美术/音乐/舞蹈/书法/戏剧)
 *  - sports         体育类 (球类/游泳/田径/武术/跆拳道)
 *  - stem           科技类 (编程/机器人/STEAM/AI/科学实验)
 *  - comprehensive  综合素质 (实践/研学/口才/心理)
 *  - language       语言类 (英语/小语种/对外汉语)
 *  - vocational     职业/成人 (资格证/考研/公考/IT 培训/企培)
 *  - preschool      学前/托育 (0-6 岁早教/托班/感统)
 *  - tutoring_arts  艺考集训 (美术/音乐/传媒艺考)
 *  - other          其他
 */
const OrgType = Object.freeze({
  ACADEMIC: 'academic',
  ARTS: 'arts',
  SPORTS: 'sports',
  STEM: 'stem',
  COMPREHENSIVE: 'comprehensive',
  LANGUAGE: 'language',
  VOCATIONAL: 'vocational',
  PRESCHOOL: 'preschool',
  TUTORING_ARTS: 'tutoring_arts',
  OTHER: 'other'
})
const ORG_TYPES = Object.values(OrgType)
const ORG_TYPE_LABELS = Object.freeze({
  academic: '学科类',
  arts: '艺术类',
  sports: '体育类',
  stem: '科技类',
  comprehensive: '综合素质',
  language: '语言类',
  vocational: '职业/成人',
  preschool: '学前/托育',
  tutoring_arts: '艺考集训',
  other: '其他'
})

// 历史 org.type 兼容映射 (3 老值 → 新 enum), 走 migrate-org-type-to-string.js
const ORG_TYPE_LEGACY_MAP = Object.freeze({
  training: 'academic',  // 老 "培训" → 新 "学科类"
  art: 'arts',
  comprehensive: 'comprehensive'
})

const Gender = Object.freeze({
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other'
})
const GENDERS = Object.values(Gender)

const CourseInstanceStatus = Object.freeze({
  PLANNING: 'planning',
  ENROLLING: 'enrolling',
  ACTIVE: 'active',
  CLOSED: 'closed',
  // 取消：死胡同状态，只能被超管设置；不能重开，只能软删
  CANCELLED: 'cancelled'
})
const COURSE_INSTANCE_STATUSES = Object.values(CourseInstanceStatus)

const CourseEnrollmentStatus = Object.freeze({
  ENROLLED: 'enrolled',
  // 归档：开班 active→closed 时由后端级联写入；亦可由管理员经 setStatus 手工覆盖
  ARCHIVED: 'archived',
  DROPPED: 'dropped',
  WITHDREW: 'withdrew'
})
const COURSE_ENROLLMENT_STATUSES = Object.values(CourseEnrollmentStatus)

const LessonScheduleStatus = Object.freeze({
  // 初始化：CourseInstance 排课时自动生成
  SCHEDULED: 'scheduled',
  // 准备上课：教务手动从 scheduled 转来（仅在 plannedStartTime 24h 内可转）
  // 转 preparing 后可以预先登记请假学生的考勤
  PREPARING: 'preparing',
  // 正在上课：老师点击「开始上课」后状态；actualStartTime 由 service 写入
  IN_PROGRESS: 'in_progress',
  // 结束上课：教务填实际下课时间后转；必须有 actualEndTime
  COMPLETED: 'completed',
  // 完成归档：所有考勤完成课评后教务从 completed → archived；归档后家长可对老师评价
  // 归档后不可再修改业务字段，仅允许改 notes/title
  ARCHIVED: 'archived',
  // 死胡同状态：取消；不可重开
  CANCELLED: 'cancelled'
})
const LESSON_SCHEDULE_STATUSES = Object.values(LessonScheduleStatus)

const AttendanceStatus = Object.freeze({
  SCHEDULED: 'scheduled',
  CHECKED_IN: 'checked_in',
  COMPLETED: 'completed',
  // 「补课」考勤（2026-06 改为「就地转状态」语义）：
  // makeup() 把原考勤 status 从 leave/no_show/scheduled/checked_in 就地翻成 madeup，
  // 同一 (lessonSchedule, student) 只有一条考勤；meta 字段记录 originalStatus / makeupAt 用于审计。
  MADEUP: 'madeup',
  NO_SHOW: 'no_show',
  LEAVE: 'leave'
})
const ATTENDANCE_STATUSES = Object.values(AttendanceStatus)

const OrderStatus = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
})
const ORDER_STATUSES = Object.values(OrderStatus)

const PaymentMethod = Object.freeze({
  WECHAT: 'wechat',
  ALIPAY: 'alipay',
  CASH: 'cash',
  OTHER: 'other'
})
const PAYMENT_METHODS = Object.values(PaymentMethod)

/**
 * PointsTransaction.trigger 业务触发来源（2026-06 重设）
 *
 * 方向语义（与 PointsTransaction.amount 符号对齐）：
 *   - 加分类（amount > 0）：order_earn / attendance_earn / streak_earn / share_earn / birthday_earn / manual_earn
 *   - 扣分类（amount < 0）：manual_deduct / pet / redemption
 *   - 反转  （amount 任意）：refund
 *
 * 设计要点（避免 trigger 无限膨胀）：
 *   - 'redemption' 是一个泛化的"兑换"类 trigger；具体兑换品类
 *     （送课 gift_lesson / 商城 mall_item / 抽奖 lottery 等）用 meta.redemptionType 区分。
 *     未来加商城/抽奖/表情包礼物都归 redemption 一类,trigger 不会膨胀。
 *   - 'pet' 是宠物互动（meta.action 区分 feed/play/level_up），与 redemption 不同在于
 *     没有"下游产物"（不创建 StudentProduct 等实体），只是 Pet 状态变化。
 *
 * ★ 本期（2026-06-21）实际实现：manual_earn / manual_deduct
 * ★ future hook 占位（schema 接受、service 未实现）：其余所有值
 */
const PointsTrigger = Object.freeze({
  // 加分类
  MANUAL_EARN: 'manual_earn',         // 员工手动加（reason + operator 必填）
  ORDER_EARN: 'order_earn',            // 下单成功 [future hook]
  ATTENDANCE_EARN: 'attendance_earn',  // 出勤奖励 [future]
  STREAK_EARN: 'streak_earn',          // 连续出勤奖励 [future]
  SHARE_EARN: 'share_earn',            // 分享得积分 [future]
  BIRTHDAY_EARN: 'birthday_earn',      // 生日奖励 [future]
  // 扣分类
  MANUAL_DEDUCT: 'manual_deduct',      // 员工手动扣（reason + operator 必填）
  PET: 'pet',                          // 宠物互动（meta.action 区分） [future]
  REDEMPTION: 'redemption',            // 兑换类（meta.redemptionType 区分） [future]
  // 反转
  REFUND: 'refund'                     // 冲正 [future]
})
const POINTS_TRIGGERS = Object.values(PointsTrigger)

/**
 * POINTS_TRIGGER_DIRECTION — trigger → 期望 amount 符号（service 层校验）
 *   1 = in (amount > 0)
 *  -1 = out (amount < 0)
 *   0 = 不限（refund 任意符号）
 */
const POINTS_TRIGGER_DIRECTION = Object.freeze({
  manual_earn: 1,
  order_earn: 1,
  attendance_earn: 1,
  streak_earn: 1,
  share_earn: 1,
  birthday_earn: 1,
  manual_deduct: -1,
  pet: -1,
  redemption: -1,
  refund: 0
})

// 旧的 PointsType (earn/spend/refund) 保留以向后兼容旧 model/seed 引用; 不再用于 PointsTransaction
const PointsType = Object.freeze({
  EARN: 'earn',
  SPEND: 'spend',
  REFUND: 'refund'
})
const POINTS_TYPES = Object.values(PointsType)

const PetType = Object.freeze({
  CAT: 'cat',
  DOG: 'dog',
  RABBIT: 'rabbit'
})
const PET_TYPES = Object.values(PetType)

/**
 * 宠物阶（PetAccount.tier / eggTier 字段，2026-06-21 pet-system-v2 立项）
 *   - C: 入门阶，喂养便宜（normal 5 积分），适合积分少 / 学习频率低的学生
 *   - B: 进阶阶
 *   - A: 高级阶
 *   - S: 至尊阶，喂养昂贵（normal 100 积分），死亡阈值最短（逼高频学习）
 *
 * 与 shared/petConfig.js 的 PET_TIER_CONFIG 阶表一一对应；本枚举只做 key 校验 + i18n label。
 */
const PetTier = Object.freeze({
  C: 'C',
  B: 'B',
  A: 'A',
  S: 'S'
})
const PET_TIERS = Object.values(PetTier)
const PET_TIER_LABELS = Object.freeze({
  C: 'C 级',
  B: 'B 级',
  A: 'A 级',
  S: 'S 级'
})

/**
 * 宠物状态机（PetAccount.state 字段，2026-06-21 pet-system-v2）
 *   - egg:   蛋态，等待 hatch
 *   - alive: 存活态，可喂食/换装/置换/降阶
 *   - dead:  死亡态（瞬间态，cron 同一 tick 内 reborn 为 egg，玩家几乎不可见）
 */
const PetState = Object.freeze({
  EGG: 'egg',
  ALIVE: 'alive',
  DEAD: 'dead'
})
const PET_STATES = Object.values(PetState)
const PET_STATE_LABELS = Object.freeze({
  egg: '蛋',
  alive: '存活',
  dead: '死亡'
})

/**
 * 宠物事件类型（PetEvent.type 字段）
 *
 * 12 种业务事件 + 6 种 admin 代操作事件；与 points.transaction 的 trigger='pet' (meta.action) 区分：
 *   - PetEvent 是宠物自身状态变更的全审计
 *   - PointsTransaction 是积分变动的账本（仅 feed / swap 触发）
 */
const PetEventType = Object.freeze({
  ADOPT: 'adopt',           // 首次领养
  HATCH: 'hatch',           // 破壳
  FEED: 'feed',             // 喂食
  LEVELUP: 'levelup',       // 升级
  TIERUP: 'tierup',         // 满级升阶
  TIERDOWN: 'tierdown',     // 主动降阶
  SWAP: 'swap',             // 置换蛋
  DEATH: 'death',           // 死亡
  REBIRTH: 'rebirth',       // 死→蛋
  EQUIP: 'equip',           // 装备
  UNEQUIP: 'unequip',       // 卸下
  ADMIN_OVERRIDE: 'admin_override', // admin 调整
  // ── 2026-06-21 pet-system-v2-ext：admin 代操作审计（与业务事件区分） ──
  ADMIN_ADOPT: 'admin_adopt',     // 老师/admin 代领蛋
  ADMIN_FEED: 'admin_feed',       // 老师/admin 代喂食
  ADMIN_HATCH: 'admin_hatch',     // 老师/admin 代破壳
  ADMIN_SWAP: 'admin_swap',       // 老师/admin 代置换
  ADMIN_TIERDOWN: 'admin_tierdown', // 老师/admin 代降阶
  ADMIN_EQUIP: 'admin_equip'      // 老师/admin 代换装
})
const PET_EVENT_TYPES = Object.values(PetEventType)

/**
 * 宠物形象视觉类型（PetSpecies.visualType，2026-06-21 pet-system-v2-ext）
 *   - image: 上传图片（File ref → URL）
 *   - svg:   内联 SVG 字符串
 * 不支持 html/css/js（XSS 风险）
 */
const PetVisualType = Object.freeze({
  IMAGE: 'image',
  SVG: 'svg'
})
const PET_VISUAL_TYPES = Object.values(PetVisualType)
const PET_VISUAL_TYPE_LABELS = Object.freeze({
  image: '图片',
  svg: 'SVG'
})

/**
 * 装饰解锁类型（PetItem.unlockType，2026-06-21 pet-system-v2-ext）
 *   - level: 升级解锁（unlockLevel ≤ 当前等级时解锁）
 *   - tier:  升阶解锁（unlockTier 阶及以下时解锁；累积：B 解锁 C+B）
 */
const PetItemUnlockType = Object.freeze({
  LEVEL: 'level',
  TIER: 'tier'
})
const PET_ITEM_UNLOCK_TYPES = Object.values(PetItemUnlockType)
const PET_ITEM_UNLOCK_TYPE_LABELS = Object.freeze({
  level: '升级解锁',
  tier: '升阶解锁'
})

/**
 * 消耗品类型（PetConsumable.kind，2026-06-21 pet-system-v2-ext）
 *   - food: 食物（喂食）
 *   - toy:  玩具（同食物机制，可同价同效果；前端展示区分）
 */
const PetConsumableKind = Object.freeze({
  FOOD: 'food',
  TOY: 'toy'
})
const PET_CONSUMABLE_KINDS = Object.values(PetConsumableKind)
const PET_CONSUMABLE_KIND_LABELS = Object.freeze({
  food: '食物',
  toy: '玩具'
})

/**
 * 消耗品适用阶（PetConsumable.applicableTier）
 *   - C/B/A/S: 仅适用该阶宠物
 *   - all:     适用所有阶（perTier 每阶独立数值）
 */
const PetConsumableApplicableTier = Object.freeze({
  C: 'C',
  B: 'B',
  A: 'A',
  S: 'S',
  ALL: 'all'
})
const PET_CONSUMABLE_APPLICABLE_TIERS = Object.values(PetConsumableApplicableTier)
const PET_CONSUMABLE_APPLICABLE_TIER_LABELS = Object.freeze({
  C: '仅 C 阶',
  B: '仅 B 阶',
  A: '仅 A 阶',
  S: '仅 S 阶',
  all: '通用（各阶独立数值）'
})

/**
 * 宠物装饰 slot 类型（PetItem.slot，复用原 petItems.js SLOT_TYPES 的 6 个槽位）
 * 与 PetItem.slot 字段一一对应。
 */
const PetItemSlot = Object.freeze({
  HAT: 'hat',
  SCARF: 'scarf',
  CLOTHES: 'clothes',
  ACCESSORY: 'accessory',
  HALO: 'halo',
  BACKGROUND: 'background'
})
const PET_ITEM_SLOTS = Object.values(PetItemSlot)
const PET_ITEM_SLOT_LABELS = Object.freeze({
  hat: '帽子',
  scarf: '围巾',
  clothes: '衣服',
  accessory: '饰品',
  halo: '光环',
  background: '背景'
})

/**
 * StudentProduct 来源（source 字段）
 *  - order: 由 Order 支付成功自动创建
 *  - gift:  由员工调用 studentProduct.service.gift 创建（需 studentProduct.gift 权限）
 */
const StudentProductSource = Object.freeze({
  ORDER: 'order',
  GIFT: 'gift'
})
const STUDENT_PRODUCT_SOURCES = Object.values(StudentProductSource)

/**
 * 开班排课计划模式（CourseInstance.schedulePlan.mode）
 *  - weekly: 每周 N 节 + 固定休息日（按日历周分布）
 *  - cycle:  上 X 休 Y（连续滚动周期；不绑日历周）
 * 两种模式互斥；由 CourseInstance.schedulePlan.{mode,lessonsPerWeek,restDays,cycleOnDays,cycleOffDays} 决定。
 */
const SchedulePlanMode = Object.freeze({
  WEEKLY: 'weekly',
  CYCLE: 'cycle'
})
const SCHEDULE_PLAN_MODES = Object.values(SchedulePlanMode)

/**
 * 学校学段（School.type 字段）
 *  - kindergarten: 幼儿园
 *  - elementary:   小学（默认）
 *  - middle:       初中
 *  - high:         高中
 */
const SchoolType = Object.freeze({
  KINDERGARTEN: 'kindergarten',
  ELEMENTARY: 'elementary',
  MIDDLE: 'middle',
  HIGH: 'high'
})
const SCHOOL_TYPES = Object.values(SchoolType)

/**
 * 客户端（家长）岗位等级
 *  0 = 非家长（staff 端岗位）
 *  1 = 基础家长
 *  2 = VIP 家长
 *  3 = 钻石家长
 *  4+ = 机构自留扩展位，default label 用 `L${n} 家长`
 *
 * 数字本身是协议（前后端共用），不可在运行时改动；
 * 每个 level 实际的展示名 / 权限勾选仍由各机构在 admin 后台自定义。
 */
const CLIENT_LEVEL = Object.freeze({
  NONE: 0,
  BASIC: 1,
  VIP: 2,
  DIAMOND: 3
})

const CLIENT_LEVEL_LABEL = Object.freeze({
  0: '非家长',
  1: '基础家长',
  2: 'VIP 家长',
  3: '钻石家长'
})

function labelOfClientLevel(level) {
  const n = Number(level)
  if (Number.isFinite(n) && CLIENT_LEVEL_LABEL[n]) return CLIENT_LEVEL_LABEL[n]
  if (Number.isFinite(n) && n >= 4) return `L${n} 家长`
  return `未知等级(${level})`
}

// ─── 人脸识别门禁 (2026-06 立项, accessControl 模块) ─────────────

/**
 * 门禁设备厂商（AccessDevice.vendor）
 *  - hanwang:  汉王 / 熵基（通用协议，7 寸一体机）
 *  - zkteco:   熵基 F7S 等专业机型（PoC 暂未实现）
 *  - hikvision:海康威视「深眸」AI 摄像头（PoC stub）
 *  - dahua:    大华「灵犀」AI 摄像头（PoC stub）
 *  - custom:   客户自研 / 其他（按 hanwang 协议兜底）
 */
const AccessDeviceVendor = Object.freeze({
  HANWANG: 'hanwang',
  ZKTECO: 'zkteco',
  HIKVISION: 'hikvision',
  DAHUA: 'dahua',
  CUSTOM: 'custom'
})
const ACCESS_DEVICE_VENDORS = Object.values(AccessDeviceVendor)
const ACCESS_DEVICE_VENDOR_LABELS = Object.freeze({
  hanwang: '汉王 / 熵基',
  zkteco: '熵基专业机型',
  hikvision: '海康威视',
  dahua: '大华',
  custom: '其他'
})

/**
 * 门锁状态（AccessDevice.doorState.mode）
 *  - normal:         正常：识别通过则开门
 *  - always_open:    常开（高峰时段 / 维修）
 *  - always_closed:  常闭（紧急 / 维护）
 *  - maintenance:    维护：识别不动作（升级固件 / 校准）
 */
const DoorStateMode = Object.freeze({
  NORMAL: 'normal',
  ALWAYS_OPEN: 'always_open',
  ALWAYS_CLOSED: 'always_closed',
  MAINTENANCE: 'maintenance'
})
const DOOR_STATE_MODES = Object.values(DoorStateMode)
const DOOR_STATE_MODE_LABELS = Object.freeze({
  normal: '正常',
  always_open: '常开',
  always_closed: '常闭',
  maintenance: '维护中'
})

/**
 * 人脸档案主体类型（FaceProfile.subjectType）
 * polymorphic: subject 字段根据此值 populate 到不同 collection
 *  - student:           学员（Student）
 *  - parent:            家长（User，本机构家长）
 *  - authorized_pickup: 第三方接送人（AuthorizedPickup，PoC 暂不录脸，保留口子）
 */
const FaceProfileSubjectType = Object.freeze({
  STUDENT: 'student',
  PARENT: 'parent',
  AUTHORIZED_PICKUP: 'authorized_pickup'
})
const FACE_PROFILE_SUBJECT_TYPES = Object.values(FaceProfileSubjectType)
const FACE_PROFILE_SUBJECT_TYPE_LABELS = Object.freeze({
  student: '学员',
  parent: '家长',
  authorized_pickup: '第三方接送人'
})

/**
 * 设备本地同步状态（FaceProfile.syncStatus）
 *  - pending: 录入后待同步到设备本地
 *  - synced:  已同步
 *  - failed:  同步失败（PoC: 报警；v2: 重试队列）
 */
const FaceProfileSyncStatus = Object.freeze({
  PENDING: 'pending',
  SYNCED: 'synced',
  FAILED: 'failed'
})
const FACE_PROFILE_SYNC_STATUSES = Object.values(FaceProfileSyncStatus)

/**
 * 进出事件类型（AccessEvent.eventType）
 *  - recognized:        识别到授权人
 *  - rejected:          拒绝（活体失败 / 相似度不够）
 *  - stranger:          陌生人（1:N 未命中）
 *  - manual_override:   人工开门（管理员远程 / 门禁按钮）
 * PoC 暂不实现 'tailgating'（设备不支持）
 */
const AccessEventType = Object.freeze({
  RECOGNIZED: 'recognized',
  REJECTED: 'rejected',
  STRANGER: 'stranger',
  MANUAL_OVERRIDE: 'manual_override'
})
const ACCESS_EVENT_TYPES = Object.values(AccessEventType)
const ACCESS_EVENT_TYPE_LABELS = Object.freeze({
  recognized: '识别通过',
  rejected: '拒绝',
  stranger: '陌生人',
  manual_override: '人工放行'
})

/**
 * 进出方向（AccessEvent.direction）
 *  - in:      进
 *  - out:     出
 *  - unknown: 设备未报告
 */
const AccessDirection = Object.freeze({
  IN: 'in',
  OUT: 'out',
  UNKNOWN: 'unknown'
})
const ACCESS_DIRECTIONS = Object.values(AccessDirection)
const ACCESS_DIRECTION_LABELS = Object.freeze({
  in: '进',
  out: '出',
  unknown: '未知'
})

/**
 * 进出结果（AccessEvent.result）
 *  - allowed: 允许（识别通过 + 活体 + 门锁正常）
 *  - denied:  拒绝（任一环节失败）
 *  - unknown: 设备未报告（如断网）
 * 强制规则：livenessResult !== 'passed' → result='denied'
 */
const AccessResult = Object.freeze({
  ALLOWED: 'allowed',
  DENIED: 'denied',
  UNKNOWN: 'unknown'
})
const ACCESS_RESULTS = Object.values(AccessResult)
const ACCESS_RESULT_LABELS = Object.freeze({
  allowed: '允许',
  denied: '拒绝',
  unknown: '未知'
})

/**
 * 活体检测结果（AccessEvent.livenessResult）
 *  - passed:        通过（防打印照片 / 视频回放）
 *  - failed:        失败
 *  - not_attempted: 设备未尝试（部分老设备无此能力）
 */
const LivenessResult = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
  NOT_ATTEMPTED: 'not_attempted'
})
const LIVENESS_RESULTS = Object.values(LivenessResult)
const LIVENESS_RESULT_LABELS = Object.freeze({
  passed: '活体通过',
  failed: '活体失败',
  not_attempted: '未尝试'
})

/**
 * 抓拍图类型（AccessEvent.snapshots[].kind）
 *  - authorized: 识别通过时的抓拍
 *  - stranger:   陌生人抓拍（独立保留策略）
 */
const SnapshotKind = Object.freeze({
  AUTHORIZED: 'authorized',
  STRANGER: 'stranger'
})
const SNAPSHOT_KINDS = Object.values(SnapshotKind)

/**
 * 接送人类型（AuthorizedPickup.pickupPersonType）
 *  - parent:                 本机构家长（pickupUser 必填）
 *  - authorized_third_party: 第三方接送人（pickupName/Phone 必填，PoC 可不录脸）
 * PoC 暂不实现 'guardian'（合并到 parent）
 */
const PickupPersonType = Object.freeze({
  PARENT: 'parent',
  AUTHORIZED_THIRD_PARTY: 'authorized_third_party'
})
const PICKUP_PERSON_TYPES = Object.values(PickupPersonType)
const PICKUP_PERSON_TYPE_LABELS = Object.freeze({
  parent: '本机构家长',
  authorized_third_party: '第三方接送人'
})

/**
 * 人脸同意书用途（UserConsent.docKey 后缀的 purpose 区分）
 * 实际写 UserConsent 时 docKey 形如 'face-consent-{purpose}'
 *  - student:  学员人脸采集同意书
 *  - pickup:   第三方接送人人脸采集同意书
 *  - staff:    员工人脸采集同意书（PoC 不实现）
 */
const FaceConsentPurpose = Object.freeze({
  STUDENT: 'student',
  PICKUP: 'pickup',
  STAFF: 'staff'
})
const FACE_CONSENT_PURPOSES = Object.values(FaceConsentPurpose)

/**
 * UserConsent 主体类型（UserConsent.subjectType，2026-06 扩展）
 *  - user:                 老数据默认（subject=null 维持原语义）
 *  - student:              学员（家长代签）
 *  - authorized_pickup:   第三方接送人
 *  - staff:                员工
 */
const ConsentSubjectType = Object.freeze({
  USER: 'user',
  STUDENT: 'student',
  AUTHORIZED_PICKUP: 'authorized_pickup',
  STAFF: 'staff'
})
const CONSENT_SUBJECT_TYPES = Object.values(ConsentSubjectType)

// 导出 (双形式):
//   1. `exports.X = X` —— esbuild CJS→ESM 静态分析 100% 识别 named export
//      (Vite / admin 前端 named import 直接拿到, 不用 .default)
//   2. `module.exports = { ... }` —— 保留给 server 端 require 兜底
//      (server 端目前全部走解构 require, 但 module.exports 必须是完整对象,
//       否则 `const { X } = require('@shared/enums')` 会拿不到)
//
// 顺序很重要: 先用 `exports.X = X` 形式把每个 key 暴露出来 (这同时也会把 key 挂到
// module.exports 上, 因为 exports === module.exports), 最后再用对象字面量覆盖
// module.exports —— 两次赋值结果一致, server 解构拿到完整对象, Vite 静态分析
// 也认得所有 named export.
exports.OrgType = OrgType
exports.ORG_TYPES = ORG_TYPES
exports.ORG_TYPE_LABELS = ORG_TYPE_LABELS
exports.ORG_TYPE_LEGACY_MAP = ORG_TYPE_LEGACY_MAP
exports.Gender = Gender
exports.GENDERS = GENDERS
exports.CourseInstanceStatus = CourseInstanceStatus
exports.COURSE_INSTANCE_STATUSES = COURSE_INSTANCE_STATUSES
exports.CourseEnrollmentStatus = CourseEnrollmentStatus
exports.COURSE_ENROLLMENT_STATUSES = COURSE_ENROLLMENT_STATUSES
exports.LessonScheduleStatus = LessonScheduleStatus
exports.LESSON_SCHEDULE_STATUSES = LESSON_SCHEDULE_STATUSES
exports.AttendanceStatus = AttendanceStatus
exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES
exports.OrderStatus = OrderStatus
exports.ORDER_STATUSES = ORDER_STATUSES
exports.PaymentMethod = PaymentMethod
exports.PAYMENT_METHODS = PAYMENT_METHODS
exports.PointsTrigger = PointsTrigger
exports.POINTS_TRIGGERS = POINTS_TRIGGERS
exports.POINTS_TRIGGER_DIRECTION = POINTS_TRIGGER_DIRECTION
exports.PointsType = PointsType
exports.POINTS_TYPES = POINTS_TYPES
exports.PetType = PetType
exports.PET_TYPES = PET_TYPES
exports.PetTier = PetTier
exports.PET_TIERS = PET_TIERS
exports.PET_TIER_LABELS = PET_TIER_LABELS
exports.PetState = PetState
exports.PET_STATES = PET_STATES
exports.PET_STATE_LABELS = PET_STATE_LABELS
exports.PetEventType = PetEventType
exports.PET_EVENT_TYPES = PET_EVENT_TYPES
exports.PetVisualType = PetVisualType
exports.PET_VISUAL_TYPES = PET_VISUAL_TYPES
exports.PET_VISUAL_TYPE_LABELS = PET_VISUAL_TYPE_LABELS
exports.PetItemUnlockType = PetItemUnlockType
exports.PET_ITEM_UNLOCK_TYPES = PET_ITEM_UNLOCK_TYPES
exports.PET_ITEM_UNLOCK_TYPE_LABELS = PET_ITEM_UNLOCK_TYPE_LABELS
exports.PetConsumableKind = PetConsumableKind
exports.PET_CONSUMABLE_KINDS = PET_CONSUMABLE_KINDS
exports.PET_CONSUMABLE_KIND_LABELS = PET_CONSUMABLE_KIND_LABELS
exports.PetConsumableApplicableTier = PetConsumableApplicableTier
exports.PET_CONSUMABLE_APPLICABLE_TIERS = PET_CONSUMABLE_APPLICABLE_TIERS
exports.PET_CONSUMABLE_APPLICABLE_TIER_LABELS = PET_CONSUMABLE_APPLICABLE_TIER_LABELS
exports.PetItemSlot = PetItemSlot
exports.PET_ITEM_SLOTS = PET_ITEM_SLOTS
exports.PET_ITEM_SLOT_LABELS = PET_ITEM_SLOT_LABELS
exports.StudentProductSource = StudentProductSource
exports.STUDENT_PRODUCT_SOURCES = STUDENT_PRODUCT_SOURCES
exports.SchedulePlanMode = SchedulePlanMode
exports.SCHEDULE_PLAN_MODES = SCHEDULE_PLAN_MODES
exports.SchoolType = SchoolType
exports.SCHOOL_TYPES = SCHOOL_TYPES
exports.CLIENT_LEVEL = CLIENT_LEVEL
exports.CLIENT_LEVEL_LABEL = CLIENT_LEVEL_LABEL
exports.labelOfClientLevel = labelOfClientLevel

// 人脸识别门禁 (accessControl 模块)
exports.AccessDeviceVendor = AccessDeviceVendor
exports.ACCESS_DEVICE_VENDORS = ACCESS_DEVICE_VENDORS
exports.ACCESS_DEVICE_VENDOR_LABELS = ACCESS_DEVICE_VENDOR_LABELS
exports.DoorStateMode = DoorStateMode
exports.DOOR_STATE_MODES = DOOR_STATE_MODES
exports.DOOR_STATE_MODE_LABELS = DOOR_STATE_MODE_LABELS
exports.FaceProfileSubjectType = FaceProfileSubjectType
exports.FACE_PROFILE_SUBJECT_TYPES = FACE_PROFILE_SUBJECT_TYPES
exports.FACE_PROFILE_SUBJECT_TYPE_LABELS = FACE_PROFILE_SUBJECT_TYPE_LABELS
exports.FaceProfileSyncStatus = FaceProfileSyncStatus
exports.FACE_PROFILE_SYNC_STATUSES = FACE_PROFILE_SYNC_STATUSES
exports.AccessEventType = AccessEventType
exports.ACCESS_EVENT_TYPES = ACCESS_EVENT_TYPES
exports.ACCESS_EVENT_TYPE_LABELS = ACCESS_EVENT_TYPE_LABELS
exports.AccessDirection = AccessDirection
exports.ACCESS_DIRECTIONS = ACCESS_DIRECTIONS
exports.ACCESS_DIRECTION_LABELS = ACCESS_DIRECTION_LABELS
exports.AccessResult = AccessResult
exports.ACCESS_RESULTS = ACCESS_RESULTS
exports.ACCESS_RESULT_LABELS = ACCESS_RESULT_LABELS
exports.LivenessResult = LivenessResult
exports.LIVENESS_RESULTS = LIVENESS_RESULTS
exports.LIVENESS_RESULT_LABELS = LIVENESS_RESULT_LABELS
exports.SnapshotKind = SnapshotKind
exports.SNAPSHOT_KINDS = SNAPSHOT_KINDS
exports.PickupPersonType = PickupPersonType
exports.PICKUP_PERSON_TYPES = PICKUP_PERSON_TYPES
exports.PICKUP_PERSON_TYPE_LABELS = PICKUP_PERSON_TYPE_LABELS
exports.FaceConsentPurpose = FaceConsentPurpose
exports.FACE_CONSENT_PURPOSES = FACE_CONSENT_PURPOSES
exports.ConsentSubjectType = ConsentSubjectType
exports.CONSENT_SUBJECT_TYPES = CONSENT_SUBJECT_TYPES

// 兜底: module.exports 直接给完整对象 (server 端 require 解构)
module.exports = exports
