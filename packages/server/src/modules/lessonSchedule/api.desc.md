# LessonSchedule 模块 API 文档

> 基础路径：`/api/v1/lesson-schedules`
>
> 排课管理。`LessonSchedule` 是某个 `CourseInstance` 的具体一节课（按 `lessonNo` 编号），
> 拥有计划开始/结束时间、老师、教室、状态。创建/更新时强制**冲突检测**（同老师或同教室在同一时段已存在排课时返回 `422`，并在 `data.conflicts` 给出冲突列表）。
>
> 排课的状态机（5 个 + 1 个死胡同）：
>
> ```
> scheduled      初始化；CourseInstance 排课时自动生成
>     ↓ 教务手动转（仅在 plannedStartTime 24h 窗口内可转）
> preparing      准备上课；可预先登记请假学生的考勤
>     ↓ 老师点「开始上课」
> in_progress    正在上课；actualStartTime 由 service 写入
>     ↓ 教务填实际下课时间后转
> completed      结束上课；actualEndTime 由 service 写入
>     ↓ 所有考勤课评完成后教务转
> archived       完成归档；归档后家长可对老师评价
>
> scheduled → cancelled（取消：老师请假等；需要回滚已生成的 LessonAttendance）
> ```
>
> **创建后排课自动为已报名学生生成 LessonAttendance**。**仅当**学生在排课时**持有 `CourseInstance.acceptedCourseProducts` 中任一课程产品下的、未过期、`remainingLessons > 0` 的 `StudentProduct` 时**才会被生成考勤；没有可用课包的学生在名单上缺席（这是给家长"续费/购课"的信号）。
>
> **批量排课**支持两种节奏模式（由 `CourseInstance.schedulePlan.mode` 决定）：
>  - `weekly`：每周 N 节 + 固定休息日（按日历周）
>  - `cycle`：上 X 休 Y（连续滚动周期；不绑日历周；如"上 5 休 1"）

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `lessonSchedule.read`
  - `lessonSchedule.write`
- 状态枚举（`LESSON_SCHEDULE_STATUSES`）：`scheduled` / `preparing` / `in_progress` / `completed` / `archived` / `cancelled`。
- 排课计划模式（`SCHEDULE_PLAN_MODES`）：`weekly` / `cycle`。
- 冲突响应（`422`）：`{ success: false, code: 422, message, data: { conflicts: [...] } }`

---

## 1. 排课列表（按时间过滤）

- **Method / Path**：`GET /api/v1/lesson-schedules`
- **权限**：`lessonSchedule.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| start | Date (ISO8601) | 起始时间（含） |
| end | Date (ISO8601) | 结束时间（含） |
| courseInstance | String (ObjectId) | 按开班实例过滤 |
| teacher | String (ObjectId) | 按老师过滤 |
| room | String (ObjectId) | 按教室过滤 |
| status | String | 状态过滤（可逗号分隔多值，例如 `preparing,in_progress,completed`） |
| statuses | String | 同 status，逗号分隔；与 status 同时存在时**后者生效**（推荐用 status 即可） |
| page | Number | 默认 1 |
| pageSize | Number | 默认 50 |

- **排序规则**（服务端固定，列表/日历共用）：
  1. **状态优先级**：`archived > completed > in_progress > preparing > scheduled > cancelled`
  2. **组内时间**：有 `actualStartTime` 的按 `actualStartTime` 升序（in_progress / completed / archived 走这条）；
     没有 `actualStartTime` 的按 `plannedStartTime` 升序（preparing / scheduled 走这条）。
- **成功响应** (`200 OK`)：`{ data: { items: LessonSchedule[], total, page, pageSize } }`。

`LessonSchedule` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | LessonSchedule._id |
| courseInstance | Object | 关联开班实例（populate） |
| lessonNo | Number | 第几节课（同一 instance 内从 1 起） |
| plannedStartTime | Date | 计划开始 |
| plannedEndTime | Date | 计划结束 |
| teacher | Object | 老师（populate） |
| room | Object | 教室（populate） |
| status | String | 状态枚举（见上方状态机） |
| actualStartTime | Date \| null | 实际上课开始（"开始上课"时写入） |
| actualEndTime | Date \| null | 实际上课结束（"结束上课"时写入） |
| actualStartReason | String \| null | 实际开始与计划相差 ≥5 分钟时的理由 |
| actualEndReason | String \| null | 实际结束与计划相差 ≥5 分钟时的理由 |
| title | String | 本节主题（可选） |
| notes | String | 备注 |
| remindStatus | `'none'` \| `'sent'` \| `'partial'` | 本节课的统一提醒状态 |
| remindedAt | Date \| null | 最近一次提醒推送时间 |

---

## 2. FullCalendar 友好格式（日历视图专用）

- **Method / Path**：`GET /api/v1/lesson-schedules/calendar`
- **权限**：`lessonSchedule.read`
- **用途**：日历视图（`/schedule/calendar`）按可视时间窗拉取事件。
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| from | Date (ISO8601) | 否 | 可视区起始（含），不传则取"now - 7d" |
| to | Date (ISO8601) | 否 | 可视区结束（含），不传则取"now + 30d" |
| courseInstance | String (ObjectId) | 否 | 按开班实例过滤 |
| teacher | String (ObjectId) | 否 | 按老师过滤 |
| room | String (ObjectId) | 否 | 按教室过滤 |
| status | String | 否 | 状态过滤（可逗号分隔多值） |

- **成功响应** (`200 OK`)：`{ data: [{ id, title, start, end, status, lessonNo, teacher, room, courseInstance: { id, name } }] }`
- **注意**：返回的是数组（不做分页）；前端按可视区裁剪；切换视图 / 翻页时都会重新拉取。

---

## 3. 排课详情

- **Method / Path**：`GET /api/v1/lesson-schedules/:id`
- **权限**：`lessonSchedule.read`

返回 `LessonSchedule` 详情（含 `actualStartTime` / `actualEndTime`）。

---

## 4. 创建排课（含冲突检测）

- **Method / Path**：`POST /api/v1/lesson-schedules`
- **权限**：`lessonSchedule.write`

请求体同旧版；冲突时返回 `422` + `data.conflicts: [{ id, lessonNo, plannedStartTime, plannedEndTime, courseInstance, teacher, room, status }]`。

---

## 5. 更新排课

- **Method / Path**：`PUT /api/v1/lesson-schedules/:id`
- **权限**：`lessonSchedule.write`
- **可写字段**：
  - 元数据：`plannedStartTime` / `plannedEndTime` / `teacher` / `room` / `title` / `notes`
  - 实际时间（教务补录）：`actualStartTime` / `actualEndTime`
  - 理由：`actualStartReason` / `actualEndReason`
- **约束**：
  - `status` **不在此端点变更**（走专用 `/prepare` `/start` `/finish` `/archive`）。
  - 已完成 / 已归档的排课只允许改 `notes` / `title`。
  - 已取消的排课完全锁死。
  - 改时间/老师/教室会触发冲突检测，失败时返回 `422` + `data.conflicts`。
  - **5 分钟差异校验**：
    - `|actualStartTime - plannedStartTime| ≥ 5min` → `actualStartReason` 必填，否则 `400`。
    - `|actualEndTime - plannedEndTime| ≥ 5min` → `actualEndReason` 必填，否则 `400`。

---

## 6. 批量排课 —— 预览（不入库）

- **Method / Path**：`POST /api/v1/lesson-schedules/preview`
- **权限**：`lessonSchedule.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| courseInstance | String (ObjectId) | 是 | 开班实例（其 `schedulePlan.mode` 决定 weekly / cycle 算法） |
| startDate | Date (YYYY-MM-DD) | 是 | 第一节课日期 |
| startTime | String (HH:mm) | 是 | 当日开始时间 |
| endTime | String (HH:mm) | 是 | 当日结束时间（必须 > startTime） |
| teacher | String (ObjectId) | 否 | 不传则用开班默认老师 |
| room | String (ObjectId) | 否 | 不传则用开班默认教室 |
| title | String | 否 | 本节主题 |
| count | Number (1-500) | 否 | 预览前 N 条（默认 10） |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "mode": "cycle",
    "totalPlanned": 48,
    "alreadyScheduled": 4,
    "remaining": 44,
    "entries": [
      { "lessonNo": 5, "plannedStartTime": "...", "plannedEndTime": "...", "teacher": "...", "room": "...", "title": "..." }
    ],
    "conflicts": [
      { "id": "...", "lessonNo": 3, "plannedStartTime": "...", "courseInstance": {...}, "teacher": {...}, "room": {...} }
    ]
  }
}
```

---

## 7. 批量排课 —— 生成（入库 + 自动考勤）

- **Method / Path**：`POST /api/v1/lesson-schedules/generate`
- **权限**：`lessonSchedule.write`
- **请求体**：同 `preview`（无 `count`），并新增：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| titleMap | Object<Number, String> | 否 | 每节主题覆盖 `{ [lessonNo]: title }`；未指定的 lessonNo 沿用 `title`（默认） |

- **成功响应** (`201 Created`)：`{ data: { created: 44, entries: [id...], conflicts: [] } }`
- **存在冲突时**：返回 `422` + `data.conflicts`，**不入库**；请先让用户去解决冲突再重试。
- **副作用**：每条新排课触发 `generateAttendancesForSchedule`（按 StudentProduct 持有情况生成 LessonAttendance）。

### 解决冲突：客户端策略（管理后台行为）

`/preview` 总是返回 `data.conflicts`（已存在的冲突排课列表）—— 即便本次没有任何冲突也会带 `[]`。
`/generate` 在仍有冲突时整体拒绝。

管理后台的"批量排课"弹窗对冲突的处理策略：

1. **后端 `/preview` 返回 `data.conflicts`** 时，前端按 `teacher.id + room.id + plannedStartTime` 三元组比对，标记预览表里**与已有冲突行对应的行**（红底 + 警告图标）。
2. 用户可在预览表里**逐行删除**（删除仅修改预览数组，不入库）。"生成"按钮在**还有任何残留冲突行**时置灰。
3. 用户亦可在弹窗顶部**更换老师/教室**（默认从开班带出），或调整起始日期/上课时间，点击"预览"重算。
4. 都无法解决时（结构性冲突），用户应去 `CourseInstance` 编辑页调整 `schedulePlan`（那里有锁字段保护）。

---

## 8. 单条加一节（开班详情页"加一节"按钮）

> 适用场景：开班已存在但未排满，需要手动补一节（无需走批量）。
> 用 `POST /api/v1/lesson-schedules`（第 4 节）即可，**`lessonNo` 取 `scheduledCount + 1`**（前端从 `courseInstance.detail.scheduledCount` 取值）。
> 冲突检测/错误返回结构与"批量生成"完全一致（`422` + `data.conflicts`），前端可复用。
> 副作用：自动为该开班下持有有效 StudentProduct 的 enrolled 学生生成 LessonAttendance。

## 9. 冲突预检（独立 GET）

- **Method / Path**：`GET /api/v1/lesson-schedules/conflicts`
- **权限**：`lessonSchedule.read`
- **用途**：编辑对话框"实时校验"
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| plannedStartTime | Date (ISO8601) | 是 | 计划开始 |
| plannedEndTime | Date (ISO8601) | 是 | 计划结束 |
| teacher | String (ObjectId) | 否 | |
| room | String (ObjectId) | 否 | |
| excludeId | String (ObjectId) | 否 | 编辑时排除自身 |

- **成功响应** (`200 OK`)：`{ data: { conflicts: [...] } }`

---

## 10. 准备上课（scheduled → preparing）

- **Method / Path**：`POST /api/v1/lesson-schedules/:id/prepare`
- **权限**：`lessonSchedule.write`
- **行为**：将 `status` 从 `scheduled` 切到 `preparing`。
- **校验**：
  - 仅 `scheduled` 可转；其他状态返回 `400`。
  - **24 小时窗口**：仅 `now ≥ plannedStartTime - 24h` 可转；否则 `400` 并提示还差多少分钟。
- **失败**：`404` / `400`。
- **入口**：排课列表（`/schedule`）操作列的「转预备」按钮（满足条件才显示）。

---

## 11. 开始上课

- **Method / Path**：`POST /api/v1/lesson-schedules/:id/start`
- **权限**：`lessonSchedule.write`
- **行为**：写 `actualStartTime = now()`，若 `status ∈ {scheduled, preparing}` 则同时切到 `in_progress`。
- **失败**：`404`（不存在）/ `400`（已取消 / 已完成 / 已归档）。

---

## 12. 结束上课

- **Method / Path**：`POST /api/v1/lesson-schedules/:id/finish`
- **权限**：`lessonSchedule.write`
- **请求体**（可空）：
  - `actualEndTime`: Date (ISO8601)，实际下课时间（默认 `now()`）
  - `actualEndReason`: String，理由（≥5 分钟差异时必填）
- **行为**：写 `actualEndTime`，若之前无 `actualStartTime` 则用 `plannedStartTime` 补；`status → completed`。
- **失败**：`404` / `400`（已取消 / 尚未开始 / 5 分钟差异未填理由）。

---

## 13. 删除排课

- **Method / Path**：`DELETE /api/v1/lesson-schedules/:id`
- **权限**：超管 + 平台密码（`requirePlatformPassword`）
- **约束**：本排课下若有"已消课"考勤或作品，禁止删除；同步清掉未开始的考勤。
- 旧版 `/batch` 已移除，由 `/preview` + `/generate` 替代。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 已完成/已取消/未开始等约束 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 排课不存在 |
| 409 | `(courseInstance, lessonNo)` 唯一冲突 |
| 422 | 排课冲突（老师/教室时段重叠），`data.conflicts` 含冲突列表 |
