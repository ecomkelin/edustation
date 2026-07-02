# 数据模型 - 报名 / 排课 / 考勤 / 作品 / 消课

> **何时读这个文件**：改报名、排课、考勤、补课、作品上传、消课选包、FIFO 规则时读。
> **一行摘要**：核心业务链路 — CourseEnrollment（报名，宽松校验）→ LessonSchedule（排课）→ LessonAttendance（考勤自动生成 + 消课扣课时）→ StudentWork（作品，可选）。

---

> 所有外键使用小写实体名（如 `student`、`courseInstance`），无 `Id` 后缀，便于 `populate`。
> 每个核心实体均包含 `meta: { type: Mongoose.Schema.Types.Mixed, default: {} }` 用于存储扩展属性。

---

## CourseEnrollment（课程报名）

**字段**：

- `org`（Org ref）
- `student`（Student ref）
- `courseInstance`（CourseInstance ref）
- `status`：`enrolled` / `completed` / `dropped` / `withdrew`
- `enrolledAt`

**唯一索引**：`(student, courseInstance)` — 防止重复报名。

### 报名校验（宽松策略）

仅校验 `CourseInstance.status ∈ {enrolling, active}`。

- **不校验 StudentProduct**：学生可以先报名、之后再购课；能否消课、能否生成 LessonAttendance 由排课环节按"学生当前是否持有有效 StudentProduct"判断。
- **不校验 `maxStudents` 名额**：超额报名是允许的；业务上的"分班"动作是把部分学生从当前开班 move 到另一个开班（修改 `courseInstance`）。`maxStudents` 仅作为 UI 上的参考。

### 报名后的"自动加入消课"

一旦 CourseEnrollment 创建成功，排课时**只要**学生持有 `CourseInstance.acceptedCourseProducts` 中任一课程产品下的、未过期、`remainingLessons > 0` 的 StudentProduct，就会被自动纳入 LessonAttendance 名单——无需额外操作。

## LessonSchedule（排课）

**字段**：

- `courseInstance`（CourseInstance ref）
- `lessonNo`
- `plannedStartTime`
- `plannedEndTime`
- `teacher`（可与 CourseInstance 默认值不同 — 代课）
- `room`（可与 CourseInstance 默认值不同 — 临时换场地）
- `status`
- `materials`（[ObjectId<Ref:File>] — 备课资料附件）
- `isTrialLesson: Boolean` — 试听专用排课标记；排课 UI 默认过滤 `isTrialLesson=false`

## LessonAttendance（考勤）

**字段**：

- `lessonSchedule`（LessonSchedule ref）
- `student`（Student ref）
- `studentProduct`（StudentProduct ref — 可空；生成考勤时无课包则为 null）
- `status`：`scheduled` / `arrived` / `completed` / `no_show` / `leave` / `madeup`（2026-06 引入，见 [memory: madeup-attendance-status]）
- `actualStartTime` / `actualEndTime`
- `remark`
- `meta.makeupOf`（LessonSchedule ref — 标记本考勤是补哪节课的；见 [memory: makeup-and-attendance-page]）

## StudentWork / LessonWork（作品）

> **2026-06 改名**：原 `LessonWork` → `StudentWork`，锚定 `lessonAttendance` (immutable) + 冗余 `courseInstance` / `subject`。
> 2026-07-01 大改：R-1600 扩参（日/等级/上传者/排序）+ R-1606 KPI + R-1640 CSV 导出 + R-1670 C 端 me 端点；C 端 3 placeholder（作品墙 / 详情 / 上传）实装。
> 详见 [memory: lesson-work-to-student-work] + [memory: student-works-completion-2026-07-01]。

**字段**：

- `lessonAttendance`（LessonAttendance ref — immutable 主锚）
- `lessonSchedule`（冗余，便于直接展示）
- `student`（Student ref）
- `courseInstance`（冗余）
- `courseInstance.courseProduct`（双层 populate 时冗余；只 populate `name` 时可走 courseProduct）
- `subject`（冗余）
- `title`
- `fileUrls`（[String] — url 数组）
- `description`
- `level`（1~5 整数 / null；员工评定，可后期 PATCH）
- `uploadedBy`（User ref — 实际上传者：老师 / 家长 / 学员本人）

### 不可变性的三道防线

1. Schema 层 `immutable: true`：4 个 snapshot 字段（lessonAttendance / lessonSchedule / courseInstance / subject）+ `org` 在 save / findOneAndUpdate 时直接抛错
2. `pre('findOneAndUpdate' / 'updateOne' / 'updateMany')` hook：兜底 strip `$set` 里的这 4 字段 + `org`，防止 raw driver bypass
3. 路由层 PATCH 白名单 `['title','description','fileUrls','level']`（service 层强制 strip）

### 业务规则

- 同一考勤下 title 不能重复（`{lessonAttendance:1, title:1}` 唯一索引；重复 409）
- 一节课可上传多个作品（不同 title）
- C 端**只读**：家长只有查询权限（detail / me），不能 create / update / delete；这些操作走 admin 端 `studentWork.write` 权限码
- 物理删除走 `requirePlatformPassword`（超管 + 密码二次确认）

### 索引

```js
{ org:1, lessonSchedule:1 }     // 本节课的全部作品
{ org:1, subject:1, createdAt:-1 }  // 学科分析
{ org:1, courseInstance:1, createdAt:-1 }  // 开班维度
{ student:1, createdAt:-1 }     // 家长端"我的作品"(R-1670 /me)
{ org:1, lessonAttendance:1 }   // attendance.works
{ lessonAttendance:1, title:1 } unique  // 同一考勤下不可重名
```

### 查询过滤维度（2026-07-01 全部生效）

- `lessonAttendance` / `lessonSchedule` / `courseInstance` / `subject` / `student`：按关联维度
- `uploadedBy`：按上传者（admin 列表可看到是老师还是家长传的）
- `createdAtFrom` / `createdAtTo`：ISO 字符串日期范围
- `minLevel` / `maxLevel`：等级闭区间 1~5（多选等级拆成两端点传给后端）
- `sort`：8 个白名单值，默认 `-createdAt`

### R-1670 GET /student-works/me — C 端 "我的作品"

- `x-active-student-id` 由 C 端 `request.js` 自动注入（[memory: c-end-me-endpoint-pattern]）
- 路由层只挂 `authenticate` + `requireOrg` + `activeStudent`（GUARD），不走 `requirePermission`
- `activeStudent` middleware 校验 `req.user` 是该学生的 `guardian` 之一；平台超管豁免
- 强制覆盖 `student = req.activeStudentId`，避免越权读到别人孩子的作品
- 默认 `sort = -createdAt`，分页参数 `page` / `pageSize` 沿用 R-1600

### R-1606 GET /student-works/stats — KPI 聚合

聚合本期 [from, to] + 上一期 [prevFrom, prevTo)：

```js
StudentWork.aggregate([
  { $match: { org, ...其他过滤, createdAt: { $gte: from, $lte: to } } },
  { $group: {
      _id: null,
      total: { $sum: 1 },
      ratedCount: { $sum: { $cond: [{ $ne: ['$level', null] }, 1, 0] } },
      levelSum: { $sum: { $cond: [{ $ne: ['$level', null] }, '$level', 0] } }
  } }
])
```

`avgLevel = ratedCount > 0 ? Number((levelSum / ratedCount).toFixed(2)) : null`，避免 0/0 = NaN。

默认时间范围：本期 = 本月 1 号 00:00 ~ 现在；上一期 = 上月同时长（区间长度与本期一致）。

## 核心业务规则

### LessonAttendance 生成时机

LessonSchedule 创建时，**立即**为该开班下所有 `enrolled` 状态的 CourseEnrollment 各生成一条 LessonAttendance（初始 `scheduled`），便于老师提前看到名单。

**关键过滤**：仅当该学生**当前**持有 `CourseInstance.acceptedCourseProducts` 中任一课程产品下的、未过期、`remainingLessons > 0` 的 StudentProduct 时，才生成考勤。

**没有可用课包的学生在考勤名单上缺席**，UI 应把"报了该开班但本节课没考勤"的学生单独标出来，提示续费/购课。

### 分班

当一个开班报名超额时，业务做法是把部分学生的 `courseInstance` 调整到另一个开班（更新 CourseEnrollment.courseInstance），不是在前置环节拒绝报名。

### 消课规则

- LessonAttendance 状态变更为 `completed`（已消课）时，从对应 StudentProduct 扣减 1 课时
- `no_show` / `leave` 不扣课时
- `madeup`（补课时段 — 见 [memory: madeup-attendance-status]）与 `completed` 等价扣课时，但来源标识不同

### StudentProduct 选包规则（FIFO）

考勤消课时若学生在该开班 `acceptedCourseProducts` 范围内有多个未过期未用完课包，按 `expireDate` 升序 FIFO（最早过期优先）。

`studentProduct` 字段为 null（生成考勤时无课包）的记录不允许 `complete`。

### LessonWork 是可选的

考勤为 `completed`（已消课）且本节课布置了作品时创建。

---

## StudentWork — 未实装 / Phase 2+ 路线（2026-07-01 立项）

> 本期（2026-07-01）把 StudentWork 推到 MVP 完整化：admin 端 KPI / 排序 / 视图切换 / CSV 导出 + C 端 3 占位页（作品墙 / 详情 / 上传）实装。但仍有 3 件事没做，留给后续 PR：

### TODO 1: Admin 端 "家长视角预览" dialog（mobile-frame）

- **动机**: 教务/老师在 admin 改完作品设置（标签、批次、可见范围），需要立刻看到家长视角的长什么样再做决策。
- **现状**: 项目无 `<MobileFrame>` 基建 (grep `MobileFrame | PhoneFrame` 无命中)。当前想预览只能让家长扫码或切到 client dev server，操作成本高。
- **目标**: 在 `StudentWorks.vue` 行操作加 "家长视角预览" 按钮，弹出 `<el-dialog>` 内嵌 375rpx 宽的 iframe 指向 client `localhost:5174/pages/work/detail?id=xxx`。
- **前置依赖**:
  - 新增 `packages/admin/src/components/MobileFrame.vue`（375rpx 边框 + 顶栏模拟 + 黑色 notch）
  - 决定 iframe 来源：client dev server URL（admin 启动时探测）+ mock 渲染二选一
  - 若选 mock：写一份 `<WorkWallMockDialog.vue>` 复用 client CSS tokens，不依赖 client dev server
- **预估工作量**: 1 PR / 半天

### TODO 2: C 端 "班级作品墙"（全班作品含其他孩子）

- **动机**: 家长看到自家作品是 Phase 1 MVP；社交化需要看到 "同班孩子在做什么"（按开班聚合），可比可学。
- **现状**: R-1670 `/student-works/me` 仅按 active student 过滤；如果改成 "按 CI 过滤"，会暴露其他孩子的姓名 / 头像 / 标题（家长可能不知情）。
- **目标**: 后端新增 R-1609 `GET /student-works/by-class?courseInstance=xxx` 走 `studentWork.read` 权限（在 admin 端使用），隐私字段（student.realName / uploadedBy.mobile）强制脱敏成 `同学A` / `同学B`。C 端不开放（家长没员工权限码）。
- **前置依赖**:
  - 隐私策略讨论（脱敏到什么粒度？仅姓名 or 全部头像？）
  - C 端家长授权机制（家长加通讯录联系人？谁授权谁看到谁的作品？）
  - 跨模块路由 R 号：MM=16 已有 1600-1606+1640，60..69 业务流动词槽可放 R-1660-1669
- **预估工作量**: 1 立项 PR + 1 实施 PR / 2-3 天

### TODO 3: C 端 PDF / 音频 在线预览（不下载）

- **动机**: 当前 detail.vue 用 `download + openDocument`（PDF 走系统阅读器）或仅给一个 "下载" 按钮（音频）。H5 体验差，小程序 / App 更糟。
- **现状**: `uni.openDocument` 在 H5 调用不可用；音频无 native 播放器。
- **目标**:
  - PDF：H5 用 iframe + pdfjs 预览（需新引入 `pdfjs-dist` 或 CDN 加载）；小程序用 `<web-view src="https://...pdf">`。
  - 音频：用 uni-app `<audio :src="url" controls :poster="...">` 在 H5 直接播；小程序用原生 audio 组件。
- **前置依赖**: 决定是否引入 pdfjs（10MB+）；跨端测试 matrix（H5 + 微信小程序 + iOS/Android）。
- **预估工作量**: 1 PR / 1 天（不带跨端兼容）

### 共同前置

- **新增权限码**: TODO 2 需要 `studentWork.readByClass`（admin 端使用），按 §6 走 4 处同步（[memory: position-dual-hardcode-pitfall]）
- **routes-server.md 同步**: 任何新 R 编号必须按 §14 入口同步登记
- **CLAUDE.md §14 表**: 不需要新条目，归 "改学生作品" 即可

---

**详见** [memory: student-works-completion-2026-07-01] 立项记录（包含 3 个端点完整代码引用 + 文件路径）。
