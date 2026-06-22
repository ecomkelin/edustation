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
> 详见 [memory: lesson-work-to-student-work]。

**字段**：

- `lessonAttendance`（LessonAttendance ref — immutable 主锚）
- `lessonSchedule`（冗余，便于直接展示）
- `student`（Student ref）
- `courseInstance`（冗余）
- `subject`（冗余）
- `title`
- `fileUrls`（[String] — url 数组）
- `description`

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
