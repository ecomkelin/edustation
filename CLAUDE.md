# EduStation 项目 CLAUDE.md

> 本文件为校外培训机构管理系统的完整开发指引，供 Claude Code (CC) 协作开发时读取。  
> 所有架构、约定、命名、数据模型和任务拆分均以此文件为准。

## 1. 项目愿景与商业模式
- **SaaS 多租户**：所有业务数据通过 `org` 字段隔离，第一家机构即第一个租户。
- 支持未来**私有化部署**（Docker + License）。
- 业务覆盖：科技与艺术类培训，核心流程为学生管理 → 课包购买 → 排课消课 → 考勤作品。

## 2. 用户角色与权限
- **平台超管**：跨机构管理。
- **机构角色**：管理员、教务、老师、家长。通过 Position 的 `permissions: [String]` 控制。
- **学生**：不登录系统，由家长（User）切换上下文代理操作。
- **权限文件**：`shared/permissions.json`，前后端共享。

## 3. 技术栈
| 层       | 技术                                      |
| -------- | ----------------------------------------- |
| 后端     | Node.js + Express + Mongoose (MongoDB)    |
| 管理后台 | Vue 3 + Vite + Element Plus               |
| 客户端   | uni-app（微信小程序、H5、App）            |
| 桌面应用 | Tauri 打包管理后台（备用 Electron）       |
| 项目管理 | pnpm monorepo                             |

## 4. 项目结构（Monorepo）
eduStation/
├── pnpm-workspace.yaml
├── packages/
│ ├── server/ # 后端
│ ├── admin/ # 管理后台 Vue3
│ └── client/ # 客户端 uni-app
├── shared/ # 权限码、类型定义
├── CLAUDE.md
└── README.md

## 5. 认证与会话管理（重要）
- **Access Token**：短有效期，放 `Authorization` Header。
- **Refresh Token**：必须使用 **httpOnly, Secure, SameSite=Strict** Cookie，路径 `/api/auth/refresh`。
- 登录返回 access token，同时设置 refresh cookie。刷新时轮换 refresh token。

## 6. 家长与子女交互设计（重要）
- 家长登录后始终在顶部显示当前活跃子女（单子女**不跳过选择步骤**，保持 UI 统一）。
- 单子女时显示“当前孩子：xx”，但无切换列表；多子女时可切换。
- 所有学生接口在请求头中传递 `x-active-student-id`。

## 7. 数据模型设计（核心字段）
> 所有外键使用小写实体名（如 `student`），无 `Id` 后缀，便于 `populate`。
> 每个核心实体均包含 `meta: { type: Mongoose.Schema.Types.Mixed, default: {} }` 用于存储扩展属性。

### 7.1 机构与用户
- **Org**：name, type, address, contact, isActive
- **User**：mobile (unique), passwordHash, realName, avatar, wechatUnionId
- **UserOrgRel**：user, org, positions, isMain
- **Position**：org, name, permissions, isSystem

### 7.2 学生
- **Student**：org, name, gender, birthday, guardianUser (-> User), notes, meta

### 7.3 课程体系
- **Subject**：org, name, category
- **CourseProduct**（课程产品）：org, subjects ([Subject]), name, totalLessons, minutesPerLesson, syllabus, **三档价格** (originalPrice / discountPrice / promotionPrice), validDays, isActive
  - 合并自原 `CourseTemplate` + `CoursePackage`：既是教学大纲也是可售卖的最小单位。
  - 后续如需把"教学大纲"和"售卖规格"（48节/96节）拆开，可再增加 `CoursePackage` 指向 `CourseProduct`。
  - **`subjects`**：关联学科，**数组、可空、可多**，仅作为给学生报名/购课时的"该产品适合的学科"建议，不做强校验。
  - **`minutesPerLesson`**：单节课时长（分钟），默认 90。用于 UI 展示与排课时间块预估，不参与业务强约束。
  - **三档价格**（核心商业逻辑）：
    - `originalPrice`（**原价**）：**心理锚点**，不直接销售；用于前端"划线价"展示，让客户感觉"赚到"
    - `discountPrice`（**折扣价**）：**默认销售价**；是订单创建时拷贝到 `Order.items[].unitPrice` 的基准
    - `promotionPrice`（**活动价**）：**限时/限量活动价**；仅当 `promotionActive=true` 时才在 UI 上展示与允许销售
    - `promotionActive: Boolean`（默认 `false`）—— 控制活动价是否生效；可由机构管理员手动开启/关闭
    - 不变式：`originalPrice > discountPrice > promotionPrice >= 0`（service 层校验；`promotionPrice=0` 表示"免费赠课"）
    - 阶段 3 之后可补充 `promotionStart/promotionEnd` 时间窗与"活动库存"等
- **CourseInstance**（开班）：org, courseProduct, teacher (-> User), room, schedulePlan, acceptedCourseProducts, startDate, maxStudents, status
  - status: `planning` / `enrolling` / `active` / `closed`
  - **`schedulePlan`**（排课计划子文档，定义"本次开班怎么上"）：
    - `lessonsPerWeek`：每周上课次数（1-7，例如"每周 2 节"）
    - `restDays`：每周固定休息日（`[Number]`，0=周日，1=周一, ..., 6=周六；例如"周三/周日休"）
    - `totalPlannedLessons`：本次开班计划的总课时数（默认取 `CourseProduct.totalLessons`）
    - `minutesPerLesson`：本次开班每节时长（可空；为空时回落 `CourseProduct.minutesPerLesson`）
    - 用途：批量排课时辅助计算总课次、UI 上展示"每周 X 课，周 Y 休"、预估结课日期
  - **`acceptedCourseProducts`**：消课时允许使用的 StudentProduct 对应的课程产品列表。
    - 默认 `[courseProduct]`（即只匹配本开班产品下的课包）
    - 配置多个时：学生持有任一 `acceptedCourseProducts` 下的、未过期、`remainingLessons > 0` 的 StudentProduct 都可用于消课
    - 适用场景：主课带附课（如"钢琴课"可消耗"乐理课包"）、老学员课包沿用、跨产品互认
  - **教师/教室默认值**：teacher 与 room 仅作为开班默认值，**单节课**（LessonSchedule）可临时指定不同老师/教室（代课、临时换场地）

### 7.4 报名、排课与消课（核心链路）
- **CourseEnrollment**（课程报名）：org, student, courseInstance, status, enrolledAt
  - status: `enrolled` / `completed` / `dropped` / `withdrew`
  - 唯一索引：`(student, courseInstance)`，防止重复报名。
  - **报名校验（宽松策略）**：仅校验 `CourseInstance.status ∈ {enrolling, active}`。
    - **不校验 StudentProduct**：学生可以先报名、之后再购课；能否消课、能否生成 LessonAttendance 由排课环节按"学生当前是否持有有效 StudentProduct"判断。
    - **不校验 `maxStudents` 名额**：超额报名是允许的；业务上的"分班"动作是把部分学生从当前开班 move 到另一个开班（修改 `courseInstance`）。`maxStudents` 仅作为 UI 上的参考。
  - **报名后的"自动加入消课"**：一旦 CourseEnrollment 创建成功，排课时**只要**学生持有 `CourseInstance.acceptedCourseProducts` 中任一课程产品下的、未过期、`remainingLessons > 0` 的 StudentProduct，就会被自动纳入 LessonAttendance 名单——无需额外操作。
- **LessonSchedule**（排课）：courseInstance, lessonNo, plannedStartTime, plannedEndTime, teacher, room, status
  - 单节课的 teacher/room 可与 CourseInstance 默认值不同（代课、临时换场地）
- **LessonAttendance**（考勤）：lessonSchedule, student, studentProduct（可空）, status, actualStartTime, actualEndTime, remark
- **LessonWork**（作品）：lessonSchedule, student, title, fileUrls, description

**核心业务规则**：
- **LessonAttendance 生成时机**：LessonSchedule 创建时，**立即**为该开班下所有 `enrolled` 状态的 CourseEnrollment 各生成一条 LessonAttendance（初始 `scheduled`），便于老师提前看到名单。
  - **关键过滤**：仅当该学生**当前**持有 `CourseInstance.acceptedCourseProducts` 中任一课程产品下的、未过期、`remainingLessons > 0` 的 StudentProduct 时，才生成考勤；**没有可用课包的学生在考勤名单上缺席**，UI 应把"报了该开班但本节课没考勤"的学生单独标出来，提示续费/购课。
- **分班**：当一个开班报名超额时，业务做法是把部分学生的 `courseInstance` 调整到另一个开班（更新 CourseEnrollment.courseInstance），不是在前置环节拒绝报名。
- **消课规则**：LessonAttendance 状态变更为 `completed`（已消课）时，从对应 StudentProduct 扣减 1 课时；`no_show` / `leave` 不扣课时。
- **StudentProduct 选包规则**：考勤消课时若学生在该开班 `acceptedCourseProducts` 范围内有多个未过期未用完课包，按 `expireDate` 升序 FIFO（最早过期优先）。`studentProduct` 字段为 null（生成考勤时无课包）的记录不允许 `complete`。
- **LessonWork 是可选的**：考勤为 `completed`（已消课）且本节课布置了作品时创建。

### 7.5 交易
- **Order**（订单）：org, student, items: [{ courseProduct, quantity, unitPrice, name }], originalPrice, actualPrice, paidAmount, paidAt, status, paymentMethod, remark
  - **items 数组**：一个订单可同时购买**多个 CourseProduct**（如"国画 48 节 + 书法 24 节"打包购买），每项含 `courseProduct` / `quantity` / `unitPrice`（创建时从 `CourseProduct.discountPrice` 拷贝，必要时按 `promotionActive` 切到 `promotionPrice`）/ `name`（快照）。
  - 金额语义：
    - `originalPrice` = `Σ items[].unitPrice * items[].quantity`（订单创建时锁定；不再随产品调价变化）
    - `actualPrice` = 实际成交价（可被促销/折扣/手动调价覆盖；`<= originalPrice`）
    - `paidAmount` = 累计实收金额（分期付款时 `< actualPrice`；多次付款累加）
    - `paidAt` = 最近一次支付成功时间（service 写入）
  - 状态机：`pending` / `paid` / `cancelled` / `refunded`
  - **支付联动**：`status` → `paid` 时，**按 items 逐项**创建对应 StudentProduct（每项一条 `source='order'`）；退款/取消时按 items 回滚对应 StudentProduct。
- **StudentProduct**（学生持有的课包）：student, source, order, courseProduct, totalLessons, remainingLessons, expireDate, isActive, giftReason?, giftedBy?, giftedAt?
  - **`source`**：`'order'`（来自订单付款成功）/ `'gift'`（员工赠课）。
  - `source='order'`：`order` 必填，`giftReason/giftedBy/giftedAt` 为空。
  - `source='gift'`：`order` 为空（孤儿赠课，无订单来源），`giftReason` **必填**（写明赠课原因，如"试听课奖励 / 老学员维护 / 投诉补偿"），`giftedBy` **必填**（员工 User._id），`giftedAt` 自动写入。
  - **UI 展示**：赠课产生的 StudentProduct 在管理后台/家长端**标红**（区别于正常购买），并显示 `giftReason` 让家长知悉来源。
  - **送课权限**：员工创建 `source='gift'` 的 StudentProduct **必须**拥有 `studentProduct.gift` 权限码（独立于 `order.write`）；无此权限者只能通过订单支付流程创建 StudentProduct。
  - 消课规则同前（FIFO 按 `expireDate` 升序）。

### 7.6 积分宠物
- **PointsAccount**：student, balance
- **PointsTransaction**：student, amount, type, refId
- **Pet**：student, petType, level, experience

### 7.7 招生试听 (Parent + ChildLead, 2026-06 重构)
地推/教务录入潜客、批量排试听日程、到店打卡、试听结果、转化学员的全链路。完整业务规划见 [plans/staged-roaming-honey.md](../.claude/plans/staged-roaming-honey.md)。

> **2026-06 重大调整**: 引入 **Parent + ChildLead 二分模型** 替代原单 `Lead` 模型
> - 触点/家长沟通/二次预约都是**家长维度**; 原 Lead = 孩子维度, 1 家长带多孩时多孩散落, 销售无法批量跟进, 跨年重试无法识别
> - Parent = 业务档案, 1:N ChildLead; User (登录账号) 与 Parent 解耦, 首个 ChildLead 转化时才 upsert
> - 试听仍 = 数据跟踪, **不**走排课系统 (`LessonSchedule`); 详见下文

**核心实体 (4 个 + 1 兼容字段, 2026-06):**
- **Parent** (家长业务档案, collection `parents`): 业务唯一键 `(org, phone)`, 业务上 1 家长 1 手机号; 与 User (登录账号) 解耦, `user` 字段首孩转化时回填
  - 状态: `lifecycle` enum = `new` / `partial` / `full` / `lost` / `dormant` (替代"还有资源"模糊语义)
    - `new` 刚登记, 所有孩子未报名
    - `partial` 部分孩子报名 (1 家长多孩, 1 个已签)
    - `full` 所有孩子都报名
    - `lost` 打了 '已流失' LeadTag
    - `dormant` 超 6 个月未联系 (阶段 2 定时任务翻)
  - 业务归因: `promoteBy` (推广人), `consultant` (咨询师), `source` (渠道), `referrer` (老带新指向另一 Parent)
  - 触点快照: `firstContactedAt` / `lastContactedAt/By` (冗余, 由 createActivity 同步刷, 真值在所有 ChildLead 触点)
  - 标签: `tags: [ObjectId<Category>]` 套 Category 字典 (`model='LeadTag'`)
  - 跨年记忆: `lastTrialAt`, `lastTrialYear` (阶段 2 dormant 判定)
- **ChildLead** (孩子潜客, collection `child_leads`): 替代原 Lead, 1 Parent : N ChildLead
  - 状态机: `pending → contacted → scheduled → tried → converted | lost` (与原 Lead 一致)
  - 转化结果: `convertedStudent/At/Remark` (回填 Student, 后续逻辑不依赖 Parent 关系)
  - **跨年重试**: `sameAs: [ObjectId<ChildLead>]` 链式追溯, 2027 年新建 childLead.sameAs 指向 2026 childLead
  - 1 孩多课: `trialSubjects: [ObjectId<Subject>]` (数组, 录入时按长度建 N 笔 TrialBooking, attemptNo=1..N); `trialSubject` 字段是 trialSubjects[0] 快照
- **TrialBooking** (试听预约, collection `trial_bookings`): ChildLead 1:N (替代原 Lead 1:N)
  - `preStudent: ObjectId<ChildLead>` (替代原 Lead)
  - `parent: ObjectId<Parent>` (冗余, 加速"该家长所有试听"查询)
  - `consultant: ObjectId<User>` (谈单老师, 与 teacher 上课老师分离)
  - `result.negotiateTeacher` 是 consultant 的 alias (兼容老数据)
  - 其余字段与原 Lead 模型一致 (joinMode / lessonSchedule / room / scheduledAt / status / result 等)
- **LeadActivity** (触点日志, collection `lead_activities`): ChildLead 1:N
  - `lead: ObjectId<ChildLead>` (替代原 Lead 引用)
  - 触点类型 `call/wechat/visit/sms/note`; 创建时同步刷 ChildLead + Parent 触点快照
- **LessonSchedule.isTrialLesson** (2026-06 deprecated): 保留字段 (兼容历史数据), 排课 UI 默认过滤 `isTrialLesson=false`; 新流程不再创建 isTrialLesson=true 的排课

**Category 字典 (2026-06 扩展):**
- `model` enum 加 `'LeadTag'` (家长标签字典, 被 `Parent.tags` 引用)
- 预设标签: 高意向 / 非目标客户 / 倾向他课 / 价格敏感 / 距离太远 / 年龄不合适 / 家庭条件 / 已流失
- 加 '已流失' 标签自动 `lifecycle='lost'`; 删 '已流失' 标签触发 lifecycle 重算

**录入家长账户 + 第一个孩子 (1 API 核心):**
- `POST /api/v1/parents/with-child` 1 API 创建 Parent + 1 ChildLead + N TrialBooking
- 软唯一: 同 org 下 phone 命中 → 返回 `{duplicate: true, parent}` (200); `body.force=true` 跳过
- `withChild` 内部自动建 N 笔 TrialBooking (attemptNo=1..N, status=awaiting_schedule)
- 同家长加孩: `POST /api/v1/parents/:id/children` (parentId 已存在, 只建 ChildLead + N TrialBooking)

**批量排试听日程 (2026-06 简化):**
- 端点 `POST /api/v1/trial-bookings/batch-schedule` 语义: "批量更新 N 个 TrialBooking 自身字段", 不创建 LessonSchedule
- 入参: `bookingIds: [...], plannedStartTime, plannedEndTime, teacher, room?` (room 可空)
- 流程: 校验入参 → 拉所有 booking, 全部 `status='awaiting_schedule'` → 校验 teacher/room 存在 → 算 `durationMinutes` → `updateMany` 写入 `scheduledAt/scheduledDuration/teacher/room/joinMode='solo'/status='scheduled'` → 翻对应 `ChildLead.status='scheduled'`
- 混合多课: N 个 booking 允许 subject 不同, 排课不覆盖 booking 自身 subject
- 跟班试听 (attached 模式, 单笔): `POST /api/v1/trial-bookings` 关联已有正常 LessonSchedule, 字段从 schedule 拷贝

**再约一次 (2026-06 调整):**
- `POST /api/v1/trial-bookings/:id/reschedule` 现在允许 `no_show` **和** `cancelled` 状态触发 (1 行修复)
- 写 LeadActivity 记录 `第 X 次未到/取消, 重新约第 Y 次` + 新 TrialBooking (attemptNo=max+1) + 内部调 batchSchedule

**[试听专用] CourseInstance (2026-06 deprecated):**
- `ensureTrialCourseInstance(orgId)` 保留 (历史数据兼容), 新流程不调; 试听专用 CI 上的 isTrialLesson=true 的 LessonSchedule 仅供历史展示
- `courseInstance.service.list` 默认 `filter.isTrial={$ne:true}` 隐藏试听专用开班, 排课接口可显式 `?includeTrial=true`

**老师"试听日程"视图 (未来):**
- 老师"我的日程"原本只看 LessonSchedule; 2026-06 起, 还要 union 查 `TrialBooking.teacher=me, status ∈ {scheduled, arrived}`
- 当前排课日历只显示 LessonSchedule, 老师若要查"今天我有几节试听", 需进 `/recruit/trial-bookings` 看板按 `试听老师=me` 过滤 (TODO: 阶段 2 加统一日程聚合)

**1 孩多课 + 1 家长多孩 业务模型 (2026-06 强化):**
- **1 孩可试多门课**: ChildLead.trialSubjects 数组, 录入时按长度建 N 笔 TrialBooking, attemptNo=1..N
- **1 家长带多孩**: 1 Parent : N ChildLead; 软唯一在 Parent.phone (同 org); 销售 / 教务在 Parent 详情点 "+ 加一个孩子" 弹 ChildLeadEditDialog (parentId 预填)
- **跨年重试**: ChildLead.sameAs 链式追溯, 2027 年新建 childLead.sameAs 指向 2026 childLead; Parent.lifecycle 从 dormant 激活
- **二次试听** (同孩 / 同家长 隔期再试): `attemptNo` 递增, 旧 booking 保留作审计

**Parent.lifecycle 状态机 (2026-06 核心):**
- 触发自动重算:
  - `childLead.service.unconvert` 撤销转化后
  - `trialBooking.service.convert` 转化后 (1 家长带多孩, **不再**自动 mark 其他 ChildLead; 哪个孩子真转化, 哪个孩子真建 Student)
  - `parent.service.addChild` 加孩后
  - `parent.service.addTag/removeTag` 涉及 '已流失' 时强制
- 手动重算: `POST /api/v1/parents/:id/recompute-lifecycle`
- 推导逻辑: `total === 0 || converted === 0` → 'new'; `converted < total` → 'partial'; `converted === total` → 'full'; 打了 '已流失' 标签或全 lost → 'lost'
  - **`converted` 数法**: `ChildLead.countDocuments({parent, convertedStudent: { $ne: null }})` (数真建了 Student 的, 避免虚高)
  - 历史 (2026-06 初次重构) 数 `status='converted'`, 会把 auto-mark 的兄弟也算进去; 2026-06-16 删 auto-mark 后改用此条件

**转化两步式 (claim token 模式, 2026-06 改造; 2026-06-16 去 auto-mark):**
- 试听完成后 (`status=completed`, `result.isEnrolled=true`) 触发转化
- `POST /api/v1/trial-bookings/:id/convert-preview` 返回 `initialPassword` + 即将创建 User/Student 预览; 若 parent.user 已存在, 标注 `alreadyExists: true`, 复用现有 User
- `POST /api/v1/trial-bookings/:id/convert` 真提交:
  1. **Claim token**: `findOneAndUpdate({_id, status='completed', 'result.isEnrolled':true, 'result.enrolledAt':null}, {$set: {'result.enrolledAt': now}})` — 原子翻转, 重试安全
  2. **User upsert** (仅首次): `findOneAndUpdate({mobile: parent.phone}, {$setOnInsert: {mobile, passwordHash: bcrypt(parent.phone.slice(-6)), realName: '家长-'+parent.phone.slice(-4), requirePasswordChange: true}}, {upsert: true, new: true})` — 同 phone 下首孩建, 次孩复用
  3. **UserOrgRel upsert**: 查"家长" Position
  4. **Parent.user 回填** (仅首次): `Parent.findOneAndUpdate({_id: parent._id, user: null}, {$set: {user: user._id}})`
  5. **Student create**: 从 ChildLead 拷 name/gender/school/grade/className
  6. **ChildLead 写回**: status='converted', convertedStudent/At/Remark
  7. **(2026-06-16 取消) 同 Parent 下其他 ChildLead 自动 mark**: 之前用 `ChildLead.updateMany` 把兄弟翻 'converted' + remark='同家长其他孩子已报名', 但**只翻状态不建 Student**, 销售误以为都建了账号, 实则不然; 改为"逐个转化"才真建学员档案
  8. **Parent.lifecycle 重算**: `parent.service.recomputeLifecycle` (数 convertedStudent != null)
  9. 返回 `{idempotent, initialPassword, user, student, childLead, parent: {lifecycle}, undoWindowMs}`
- **不用 mongoose 事务** (单节点 Mongo 不支持); 用 upsert 链 + claim token 模式实现重试安全
- **5 分钟撤销窗口**: `POST /api/v1/child-leads/:id/unconvert` (改路径, 旧 `/leads/:id/unconvert` 已下线)
  - 校验 `convertedAt` 在 5 分钟内
  - 校验 Parent.user 没用作其他 ChildLead.convertedStudent 主监护人
  - **不级联**回退同 parent 下其他"自动转化的" ChildLead (2026-06-16 后这分支不会命中, 因为没有 auto-mark; 业务上的兄弟转化是逐个点 convert, 各管各的)
  - User 仅在"无其他 converted 兄弟"时删; 否则保留 User 但从 Parent.user 解绑
  - 物理删 Student (校验无下游引用)
  - 重算 Parent.lifecycle

**初始密码策略:**
- 新建家长 `User.passwordHash = bcrypt(mobile.slice(-6))` (手机号后 6 位)
- `User.requirePasswordChange = true`
- `auth.service.login` 在响应里返回 `requirePasswordChange: true`
- 前端 auth store 存该标志, 路由守卫 (`router/index.js` beforeEach) 拦截任何非 `/reset-password` 访问, 强制跳改密页
- `auth.service.changePassword` 改密成功后清掉 `requirePasswordChange` 标志

**权限码 (复用 `recruit` 组, 不新增):**
- `recruit.read` - 列表/详情/触点时间线/标签
- `recruit.write` - 新建/编辑/加孩/批量排日程/打卡/完成
- `recruit.convert` - 转化预览/转化执行/撤销转化
- 共享给 Parent + ChildLead + TrialBooking 三个模块, 减少权限码数
- 加到 `管理员` 和 `教务` 系统职位 (默认); 不加到 `老师`/`家长`/`财务`
- 历史机构通过 `migrate-add-recruit-perms.js` 一次性补 ($addToSet + $nin 前置过滤, 幂等)
- 销售/教务分级: 服务端在 `parent.service.list` 时, 若用户无"看全部"权限强制 `promoteBy=me` (`scope=mine`); 教务可看全部

**删除保护 (与 8.1 互锁):**
- `lessonSchedule.lessonScheduleUsageChecks` **第三项**保留: `TrialBooking.lessonSchedule=scheduleId` (仅 attached 模式命中) → 阻挡物理删除
- `parentUsageChecks` (Parent 删): `ChildLead` + `TrialBooking` + `LeadActivity` (via childLead 派生) 引用都阻挡
- `childLeadUsageChecks` (ChildLead 删): `TrialBooking` + `LeadActivity` 引用都阻挡
- 物理删除走 `requirePlatformPassword` (高风险)

**招生看板 (2026-06 新增, §16.3 解锁):**
- `GET /api/v1/reports/recruit-promoter` - 推广人员 ROI (按 Parent.promoteBy 聚合: 家长数/孩子数/转化数/转化率)
- `GET /api/v1/reports/recruit-teacher-conversion` - 试听老师转化率 (按 TrialBooking.teacher 聚合: 试听过/到店/完成/已报名/转化率)
- 看板权限码 `recruit.read` (挂在 `recruit` 组, 不复用 `report.read`)
- 阶段 2 再做: `recruit-parent-lifecycle` (家长生命周期分布) + `recruit-source-roi` (渠道 ROI)

**迁移 & 启动清理:**
- 旧 Lead 模型 (collection `leads`) / LeadActivity (collection `lead_activities`) **完全下线** (2026-06 重构)
- `packages/server/src/utils/startupMigrations.js#dropLegacyLeadCollections` 在 server 启动时主动 drop 这两个 collection (开发期兜底)
- 业务上是假数据, 不需要数据迁移脚本

## 8. 后端分层与模块组织
采用“领域分组 + 垂直切片”模式。当模块过多时，在 `modules/` 下用分组文件夹聚合。
server/src/
├──app.js
├──config/
│     ├── index.js
│     ├── db.js
│     └── permissions.js
├──middlewares/
│     ├── auth.js
│     ├── authorize.js
│     ├── orgContext.js
│     ├── errorHandler.js
├── models/ # 所有 Mongoose 模型集中
├── modules/
│     └── auth/ # 登录、刷新、登出
│             ├──auth.router.js
│             ├──auth.controller.js
│             ├──auth.service.js
│             ├──auth.validator.js
│     └── org/
│             ├── ***
│     └── ***
└── utils/


### 8.1 破坏性操作门控（删除保护）

所有 `DELETE` 路由必须满足**三重防护**：

1. **身份门槛**：`requirePlatformPassword` 中间件
   - 必须 `req.user.isPlatformAdmin`（平台超管）。
   - 必须从 `body.password` 二次确认自身登录密码（`argon2.verify` 与 `User.passwordHash` 对照）。
   - 由 [packages/server/src/middlewares/requirePlatformPassword.js](packages/server/src/middlewares/requirePlatformPassword.js) 统一实现；**所有新接入模块直接套用**。

2. **业务互锁**：service.remove 内用 [`@utils/removable.assertUnused`](packages/server/src/utils/removable.js) 校验下游引用
   - 互锁检查声明（`Array<{ model, filter, label, hint }>`）抽成**命名函数**（`xxxUsageChecks(orgId, id)`），与 `removableCheck` 共用同一组声明，单点维护。
   - 任意一项 `countDocuments > 0` → 抛 `ApiError.unprocessable`（422），错误 `data.blockers` 携带全部阻挡详情。

3. **预检端点**：`GET /:id/removable-check`
   - 普通业务岗（`<module>.read` 权限）即可调用，**不**需超管+密码。
   - 返回 `{ canRemove: boolean, blockers: [{entity,label,count,hint}] }`，供前端在删除按钮触发前先弹挡板说明。
   - 必须用同一组 `xxxUsageChecks`，与 `service.remove` 互锁语义保持完全一致。

**禁止物理删除的实体**（业务上只走"停用"/"下架"/"归档"）：

- **Org（机构）**：SaaS 根，整条业务链挂上面。**禁用 DELETE 路由**；用 `PUT /orgs/:id/active`（toggleActive）切换启用。

**允许物理删除但需互锁的实体**：

- **CourseProduct（课程产品）**：被 `Order.items[].courseProduct` / `StudentProduct.courseProduct` 强引用。
  - DELETE 路由**存在**，但 `service.remove` 内 `assertUnused` 校验两项 count=0 才放行；
  - 有引用时返回 422 + `data.blockers`（含具体订单数/课包数 + 中文操作建议）；
  - 前端用 `<DestructiveConfirm>` + `:precheck` 让用户在弹密码前先看到挡板；
  - 业务上仍推荐用 `PUT /:id {isActive:false}` "下架"——只有"彻底不要这门课"才走物理删除。
- **Room（教室）**：被 `CourseInstance.room` / `LessonSchedule.room` 强引用。
  - DELETE 路由**存在**，但 `service.remove` 内 `assertUnused` 校验：
    - `CourseInstance` 未软删 (`deletedAt: null`)
    - `LessonSchedule` 未归档 (`status ≠ 'archived'`)
  - 已归档的开班/排课**不**挡（历史不再展示在排课视图）；
  - 前端用 `<DestructiveConfirm>` + `:precheck`，`handleRemoveError` 兜底；
  - 业务上仍推荐用 `PUT /:id {isActive:false}` "停用"——只有"该教室彻底不再使用"才走物理删除。

**前端配套**：

- 所有破坏性确认走 [`<DestructiveConfirm>`](packages/admin/src/components/DestructiveConfirm.vue)（统一"高风险说明 + 输密码"两段式）。
- 通过 `:precheck` prop 接入 `removable-check` 预检；`canRemove=false` 时自动弹挡板，不进入密码输入。
- **兜底**：每个 `onRemoveConfirm` 的 catch 必须调 `handleRemoveError(err, '无法删除 · 高/中风险')`——
  - 若后端在预检通过后又被新数据挡住（竞态），仍能从 `err.response.data.data.blockers` 还原出完整挡板说明；
  - 无结构化 blockers 时（如密码错/403）原样 rethrow，由 axios 拦截器 ElMessage。
- API 范式：`remove: (id, { password } = {}) => http.delete(url, { data: { password } })`。
- 工具函数：[`packages/admin/src/utils/removable.js`](packages/admin/src/utils/removable.js) 提供 `formatBlockers` / `showBlockedAlert` / `handleRemoveError` / `removableCheckThen`。


## 9. API 规范
- 基础路径：`/api/v1`
- 请求头：`Authorization: Bearer <access>`、`x-org-id`、可选 `x-active-student-id`
- 响应格式：`{ success: true, data }` / `{ success: false, message }`
- 关键端点见阶段拆分。

## 10. 管理后台 (Vue3)
- 根据当前机构 Position 权限动态渲染菜单。
- 顶部切换机构，排课界面预留冲突检测。
- 构建后由 Tauri 打包为桌面应用。在打包文档中写清楚如何打包

## 11. 客户端 (uni-app)
- 家长登录后始终显示当前孩子，单子女时简化但保留切换元素。
- 页面：首页（课表）、宠物乐园、分享、我的。
- 分享功能通过追踪参数回传加分。
- 在打包文档中写清楚 如何打包成微信小程序 和苹果手机app 安卓手机appp

## 12. 开发阶段与任务
### 阶段 1：MVP (6周)
- [ ] monorepo 初始化、Express 搭建、Mongoose 连接
- [ ] 认证模块（cookie refresh token）
- [ ] 机构、用户、职位权限
- [ ] 学生管理、家长关联
- [ ] 课程产品与开班 CRUD（学科、CourseProduct、CourseInstance、教室）
- [ ] 课程报名（CourseEnrollment：仅校验开班状态；不强制 StudentProduct / maxStudents，超额通过"分班"解决）
- [ ] 手动排课（LessonSchedule + 自动按 CourseEnrollment 生成 LessonAttendance）
- [ ] 下单购课（Order → StudentProduct）
- [ ] 考勤自动消课（FIFO 选包 + 作品上传）
- [ ] 管理后台基础界面

### 阶段 2：多机构 & C端 (4周)
- [ ] 机构隔离与切换
- [ ] 家长端小程序：登录、查看孩子、课表
- [ ] 积分账户、宠物基础喂养
- [ ] 分享得积分（简单实现）

### 阶段 3：商用强化 (6周)
- [ ] 排课冲突检测
- [ ] 财务报表
- [ ] 分享裂变、积分商城
- [ ] 多租户计费
- [ ] Tauri 打包发布、小程序上线

### 阶段 4：AI与实时（远期）
- [ ] 大模型集成、WebSocket 通知、数据分析

## 13. 命名约定与关键决策
- 订单命名：`Order`
- 课程产品：`CourseProduct`（合并了原 `CourseTemplate` + `CoursePackage`）
- 开班实体：`CourseInstance`（开班）→ `CourseEnrollment`（报名）→ `LessonSchedule`（排课）→ `LessonAttendance`（考勤）→ `LessonWork`（作品）
- 刷新令牌：仅通过 httpOnly cookie 传输
- 家长单子女：UI 上保留切换元素，但不弹出选择器
- 字段扩展：核心字段显式定义，附加信息存入 `meta: {}` 字段
- 模块组织：领域分组 + 垂直切片

## 14. 文件存储方案

> **已落地（2026-06）**：见 `server/src/modules/storage/`、`server/src/models/File.model.js`、`shared/permissions.json`（storage 组）。阶段 1 走 local 驱动，MinIO 切入口预留。

- **目标**：所有上传场景（头像 / 作品 / 课程附件 / 备课资料 / 机构 logo / 宠物头像 / 通用附件）走统一的 `/api/v1/storage/*` 端点，引用追踪、删除预检、文件管理 UI 一并提供。
- **驱动抽象**：`StorageDriver` 接口 (`putObject` / `removeObject` / `getPublicUrl`)。阶段 1 = `local`（本地磁盘 + express.static）；阶段 2 加 `s3` 驱动（MinIO / AWS S3 / 阿里云 OSS 都走 AWS SDK），业务代码零改动。
- **多租户隔离**：local 驱动共用一个 `uploads/` 根，每个文件 key 含 `scope/YYYY-MM/YYYYMMDD/uuid.ext`；阶段 2 MinIO 单 bucket (`edustation`)，按业务域 scope 划前缀；权限上 `File.org` 必填，跨 org 操作 403。
- **引用追踪**：`File.refs: [{entity, entityId, field}]` + `refCount` + `isOrphan`。业务模块（user / org / studentWork / courseProduct / lessonSchedule）通过 `modules/storage/fileBind.js` 的 `diffSingle` / `diffArray` / `diffArrayById` 维护引用；删除预检直接看 `refCount`，refCount>0 → 422 + 详细 blockers。
- **上传策略（阶段 1）**：multipart `POST /storage/upload?scope=...`（单）或 `/storage/upload-many`（多）→ server 用 multer.memoryStorage() 收 buffer → driver.putObject 落盘 → 写 File 文档。20MB 上限、MIME 白名单（image/*, video/*, audio/*, application/pdf）。
- **上传策略（阶段 2）**：后端发预签名 PUT URL → 客户端直传 MinIO → `POST /storage/files/:id/confirm` 落 File 文档。逻辑与阶段 1 业务侧一致。
- **模块位置**：`server/src/modules/storage/`（routes / controller / service / drivers / fileBind），API 文档见 `api.desc.md`。
- **管理后台**：左侧菜单"系统管理 > 文件管理" → `/files`，列表 + 过滤 + 预览 + 删除（DestructiveConfirm + removable-check 预检）。
- **业务字段扩展**（新增以保后向兼容）：
  - `User.avatar: String`（跨租户，diffSingle）
  - `Org.logo: String`（按 org，diffSingle）
  - `Pet.avatar: String`（按 org，diffSingle）
  - `StudentWork.fileUrls: [String]`（url 数组，diffArray；保留 schema 兼容）
  - `CourseProduct.attachments: [ObjectId<Ref:File>]`（ObjectId 数组，diffArrayById）
  - `LessonSchedule.materials: [ObjectId<Ref:File>]`（同上）
- **权限码**：`storage.read` / `storage.write`（在 `shared/permissions.json` 的 `storage` 组）。
- **环境变量**：
  - `STORAGE_DRIVER=local`  (阶段 1；阶段 2 切 `s3`)
  - `UPLOAD_DIR` / `UPLOAD_BASE_URL`（local 驱动专用；默认 `uploads/` 和 `/uploads`）
  - `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`（s3 驱动专用；阶段 2）
- **安全**：20MB 体积限制 + MIME 白名单强制；删除走"removable-check 预检 + 前端 DestructiveConfirm"（文件不涉及隐私，不叠加超管密码门控，与 `studentWork.delete` 区别）；refs 引用唯一索引 + 同 driver 内 key 唯一索引防重。

## 15. AI 智能客服
- **目标**：基于机构私有知识（科目、老师、学校）的智能问答。
- **技术**：RAG 模式，使用向量数据库（Chroma）+ 大模型 API（OpenAI/通义千问）。
- **集成位置**：`server/src/modules/agent/`
- **核心接口**：`POST /api/v1/agent/chat` (初期非流式，后续升级为 SSE 流式)
- **数据同步**：业务数据（Subject, User, Org）变更时自动更新向量库。
- **前端展示**：客户小程序内嵌聊天界面；管理后台可维护知识库并查看统计。
- **成本控制**：缓存高频问题，限流，远期可迁移至本地大模型（Ollama）。
- **实施阶段**：阶段 3 后期搭建基础，阶段 4 完成流式交互与用户体验优化。

---
**维护规则**：每次重大架构变更或决策后，更新此文件并通知协作者。

---

## 16. 数据分析与经营看板

管理后台"仪表盘"页面（`/dashboard`）为机构管理者提供 5 块经营看板，所有指标均按 `x-org-id` 隔离。  
后端模块：`server/src/modules/report/`（聚合管道），前端页面：`packages/admin/src/views/Dashboard.vue`（ECharts 渲染）。

### 16.1 看板清单

| # | 看板 | 接口 | 核心指标 |
|---|------|------|---------|
| 1 | **经营总览** | `GET /api/v1/reports/overview` | 今日/本月营收、待支付金额、新增/流失学员、在读数、活跃课包数、总剩余课时、待续费数、7 日内过期课包数、7 日出勤率 |
| 2 | **课消与课表** | `GET /api/v1/reports/lesson-consumption` | 本月已消/计划消、出勤率/请假率/未到率、各开班消课进度、课评均分 Top / 低分名单、老师产能 Top 10 |
| 3 | **教室与排课利用率** | `GET /api/v1/reports/room-utilization` | 教室周占用率/空置率、每日峰值时段（小时热力）、排课冲突告警、开班满班率分布 |
| 4 | **老师产能与绩效** | `GET /api/v1/reports/teacher-productivity` | 人均周/月课时、班级数、学生数、课时密度、课评均分、消课完成率 |
| 5 | **积分与家长活跃** | `GET /api/v1/reports/points-activity` | 积分发放/消耗/余额（按 type 维度饼图）、活跃家长数（近 7/30 天）、宠物等级分布 |

> 所有接口挂 `requirePermission('<对应模块>.read')` 门控（看板归口到 `student.read` / `order.read` 等已有权限码，不新增权限码）；按 `req.org._id` 强制隔离。

### 16.2 时间维度

- 入参 `?range=today|week|month|custom&from=&to=`（默认 `month`），内部统一以 `req.org._id` 业务日为窗口。
- 暂不引入 `MetricSnapshot` 物化层（见 16.3），所有指标实时聚合；T+1 物化层待性能压力出现后再加。

### 16.3 待开发（需数据切片）

以下指标依赖**新字段或新模型**，当前阶段不实现，等待业务确认后单独立项：

| 类别 | 待开发项 | 解锁指标 | 建议落点 |
|------|---------|---------|---------|
| 招生漏斗 | `Order.source` 字段（渠道字典：`walkin / refer / douyin / xiaohongshu / ad / ...`） | 各渠道报名数、渠道转化率 | Order schema + 字典 `Category.model='Channel'` |
| 招生漏斗 | `Order.referrerUserId` 字段 | 推荐人贡献 Top 10 | Order schema |
| 招生漏斗 | `Lead` / `Inquiry` 模型 | 咨询量、试听量、试听转化率 | 新模型 + `CourseInstance.isTrial` 标记 |
| 招生漏斗 | `Student.source` + `firstOrderAt` 字段 | 新老家长比、获客成本归因 | Student schema |
| 财务 | `RefundRecord` 模型（金额/时间/原因/操作人/关联 Order） | 真实退费金额、退费流失率、财务对账 | 新模型 |
| 财务 | `TeacherSalary` 模型（课时工资/分润） | 利润率、老师课时单价、净利率 | 新模型 |
| 课消 | `LessonAttendance.leaveType` / `noShowReason` 字段 | 病/事假区分、出勤预警 | LessonAttendance schema |
| 平台层 | `MetricSnapshot(org, metricKey, date, value)` 物化表 | 平台超管跨机构对比、看板统一口径、T+1 缓存 | 新模型 + 定时任务 |
| 审计 | `OperationLog` 模型（销售/教务操作审计） | 销售行为漏斗、谁把学员从 A 开班调到 B | 新模型 |
| 触达 | `Notification` 模型（家长推送消息） | 触达率、提醒有效性 | 新模型 |

> 立项目的优先级建议：  
> ① 招生漏斗（`Order.source` + `Lead`）→ 解锁市场看板；  
> ② `RefundRecord` → 解锁财务看板；  
> ③ `TeacherSalary` → 解锁利润看板；  
> ④ `MetricSnapshot` 物化层 → 性能拐点后必做。