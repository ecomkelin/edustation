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
- `objectives`（[String] — 教学目标，UI chip 列表）
- `description`（String — 课程简介）
- `posterFileId` / `videoFileId`（File ref — 宣传海报 / 视频，scope=`subjectSyllabus`）
- `syllabus`（教学大纲子文档 — 见下文）
- `lessonMaterials`（每堂课课件子文档 — 见下文）

### syllabus（教学大纲子文档）

- `totalLessons`（Number，冗余字段，恒等于 `lessons.length`）
- `lessons: [{ lessonNo, topic, description, objectives, durationMinutes }]`
- `lessonNo` 严格 `1..N` 升序；同一 `Subject` 内唯一
- 后端 `subject.service.normalizeSyllabusLessons` 静默过滤非法项

### lessonMaterials（每堂课课件子文档）

- `items: [{ lessonNo, fileIds: [ObjectId ref File] }]`
- `lessonNo` 与 `syllabus.lessons[].lessonNo` 对齐（不强校验 — 可能先有课件后写大纲）
- `fileIds` 走 `fileBind` 维护引用计数（field=`lessonMaterials`，entity=`SUBJECT`）
- 跨机构同步时 `fileIds` 全部清空（fileId 跨机构失效）
- **2026-07-20 详情返回 enrich**：服务端 `subject.service.enrichLessonMaterials` 把 `fileIds[]` 中每个 ObjectId 替换为 `{ _id, originalName, url, mime, size }`；前端直接在表格/dialog 显示真实文件名 + 点击触发预览

### Subject UI 拆分 (2026-07-20)

教学大纲 + 课件内容多，新建/编辑基础信息时不挤在弹窗。**三处视图分离**：

| 入口                  | 范围                       | 说明 |
|-----------------------|----------------------------|------|
| 列表 `/subjects`       | 名称 / 分类 / 大纲节数 / 课件组数 / 教学目标 / 海报 + **「详情」** + (平台超管) **「误操删除」** | 「详情」→ `/subjects/:id` |
| 详情页 `/subjects/:id` | 基本信息只读 + 头部 **「编辑基础信息」** + **教学大纲内嵌编辑器** + **课件内嵌编辑器** + 误操删除 | 三段式卡片，编辑大纲/课件都走 `PUT /subjects/:id` 仅传对应子字段 |
| 新建弹窗 (仅)          | 仅 名称 / 分类 / 目标 / 海报 / 视频 / 简介 | 弹窗已不再做编辑用途——列表编辑入口全在详情页 |

后端无需新增端点：

- 列表 → `GET /api/v1/subjects` (R-0500)
- 详情 → `GET /api/v1/subjects/:id` (R-0501) — 内含 enrichLessonMaterials
- 新建 → `POST /api/v1/subjects` (R-0502)
- 编辑（基础信息 + 大纲 + 课件）→ `PUT /api/v1/subjects/:id` (R-0503) 仅传对应子字段
- 误操删除 → `DELETE /api/v1/subjects/:id` (R-0504)
- 删除预检 → `GET /api/v1/subjects/:id/removable-check` (R-0505)
- **课件 PDF 预览 (2026-07-20)** → iframe 嵌 `GET /api/v1/storage/files/:id/stream?disposition=inline` (R-3010)；服务端 set `Content-Disposition: inline` + `Cache-Control: no-store, private` → 浏览器内嵌查看而非另存。注意：浏览器内置 PDF viewer 仍带下载按钮 —— 这是软保护，配合业务宣导使用。

### 课件限定 PDF + 视频 (2026-07-20)

业务上线发现「课件」承担不了「附件」角色 (image / audio / Office 太多元, 业务真用每天都上传不合规范的素材), 收紧到 **PDF + 视频 (mp4 / mov / webm / avi / mkv / m4v)**：

- [packages/admin/src/views/subjects/SubjectDetail.vue](packages/admin/src/views/subjects/SubjectDetail.vue) `beforeMaterialUpload`: 拒非 PDF + 视频 (mime + 后缀兜底, 空 mime 用 `.ext` 兜)
- 同上 `onPickMaterials` (FilePicker 多选): 静默丢弃非允许文件, 累计丢弃数 toast 「已忽略 N 个文件（课件只接受 PDF / 视频）」
- 共享 helper `isAllowedMaterial({ mime, originalName })` —— 上传 / 选文件共用同一规则

服务端 [packages/server/src/config/index.js](packages/server/src/config/index.js) `allowedMime` 当前包括 image / video / audio / pdf, 由前端按 scope 限定. 阶段 2 可在 storage.service 加 scope → allowedMime 矩阵 (per-scope 收紧).

**未来再放宽范围**时: 把新 mime 类型加入 `ALLOWED_MATERIAL_MIME` 数组 + `ALLOWED_MATERIAL_EXT` 正则即可。

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
