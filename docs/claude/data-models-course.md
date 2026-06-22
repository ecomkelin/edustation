# 数据模型 - Subject / CourseProduct / CourseInstance

> **何时读这个文件**：改学科、课程产品、开班、排课计划、三档价格时读。
> **一行摘要**：教学核心三件套 — Subject（学科）/ CourseProduct（课包 + 三档价格）/ CourseInstance（开班 + 排课计划子文档 + acceptedCourseProducts）。

---

> 所有外键使用小写实体名（如 `student`、`courseInstance`），无 `Id` 后缀，便于 `populate`。
> 每个核心实体均包含 `meta: { type: Mongoose.Schema.Types.Mixed, default: {} }` 用于存储扩展属性。

---

## Subject（学科）

- `org`（Org ref）
- `name`
- `category`（Category ref — `model='Subject'`）

## CourseProduct（课程产品）

**合并自**原 `CourseTemplate` + `CoursePackage`：既是教学大纲也是可售卖的最小单位。
后续如需把"教学大纲"和"售卖规格"（48 节/96 节）拆开，可再增加 `CoursePackage` 指向 `CourseProduct`。

**字段**：

- `org`（Org ref）
- `subjects`（[Subject ref] — 关联学科，**数组、可空、可多**，仅作为给学生报名/购课时的"该产品适合的学科"建议，不做强校验）
- `name`
- `totalLessons`
- `minutesPerLesson`（单节课时长，默认 90 — 用于 UI 展示与排课时间块预估，不参与业务强约束）
- `syllabus`
- **三档价格**（详见下）
- `validDays`
- `isActive`

### 三档价格（核心商业逻辑）

| 字段 | 角色 | UI 表现 |
|---|---|---|
| `originalPrice` | **原价**（心理锚点，不直接销售） | 划线价展示，让客户感觉"赚到" |
| `discountPrice` | **折扣价**（默认销售价） | 是订单创建时拷贝到 `Order.items[].unitPrice` 的基准 |
| `promotionPrice` | **活动价**（限时/限量活动价） | 仅当 `promotionActive=true` 时才在 UI 上展示与允许销售 |
| `promotionActive` | Boolean，默认 `false` | 控制活动价是否生效；可由机构管理员手动开启/关闭 |

**不变式**：`originalPrice > discountPrice > promotionPrice >= 0`
（service 层校验；`promotionPrice=0` 表示"免费赠课"）

阶段 3 之后可补充 `promotionStart/promotionEnd` 时间窗与"活动库存"等。

## CourseInstance（开班）

**字段**：

- `org`（Org ref）
- `courseProduct`（CourseProduct ref）
- `teacher`（User ref — 默认老师，可被单节课覆盖）
- `room`（Room ref — 默认教室，可被单节课覆盖）
- `schedulePlan`（排课计划子文档 — 详见下）
- `acceptedCourseProducts`（[CourseProduct ref] — 消课时允许使用的 StudentProduct 对应的课程产品列表）
- `startDate`
- `maxStudents`（UI 上的参考；不强制校验，详见 §enrollment 文档）
- `status`：`planning` / `enrolling` / `active` / `closed`

### schedulePlan（排课计划子文档）

定义"本次开班怎么上"：

- `lessonsPerWeek`：每周上课次数（1-7，例如"每周 2 节"）
- `restDays`：每周固定休息日（`[Number]`，0=周日，1=周一, ..., 6=周六；例如"周三/周日休"）
- `totalPlannedLessons`：本次开班计划的总课时数（默认取 `CourseProduct.totalLessons`）
- `minutesPerLesson`：本次开班每节时长（可空；为空时回落 `CourseProduct.minutesPerLesson`）

**用途**：批量排课时辅助计算总课次、UI 上展示"每周 X 课，周 Y 休"、预估结课日期。

### acceptedCourseProducts（消课选包范围）

- 默认 `[courseProduct]`（即只匹配本开班产品下的课包）
- 配置多个时：学生持有任一 `acceptedCourseProducts` 下的、未过期、`remainingLessons > 0` 的 StudentProduct 都可用于消课
- **适用场景**：主课带附课（如"钢琴课"可消耗"乐理课包"）、老学员课包沿用、跨产品互认

### 教师/教室默认值

`teacher` 与 `room` 仅作为开班默认值，**单节课**（LessonSchedule）可临时指定不同老师/教室（代课、临时换场地）。

## 试听专用 CourseInstance

新流程不再创建试听专用开班；历史 `isTrialLesson=true` 的 LessonSchedule 仅供历史展示。

`courseInstance.service.list` 默认 `filter.isTrial={$ne:true}` 隐藏试听专用开班，排课接口可显式 `?includeTrial=true`。
