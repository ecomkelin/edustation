# Student 模块 API 文档

> 基础路径：`/api/v1/students`
>
> 学生管理。学生是机构内的业务实体（不登录系统），由家长（User）代为操作。
> `Student` 与 `User` 的关联字段：
> - `guardianUser` —— 主监护人（首登家长）
> - `guardians` —— 全部监护人（多对多）

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `student.read` —— 查看学生列表/详情
  - `student.write` —— 创建/更新/删除/关联家长
- 学生列表自动按当前 org 过滤；`me` 接口专为家长设计。

---

## 1. 家长查自己的子女

- **Method / Path**：`GET /api/v1/students/me`
- **权限**：authenticated（家长）——**不要求** `student.read` 权限
- **说明**：当前登录用户在当前 org 关联的所有学生（主监护人或在 `guardians` 中）。客户端顶部"当前孩子"下拉即来自此接口。
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| isActive | Boolean | 默认 `true` |

- **成功响应** (`200 OK`)：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| data | Student[] | 元素结构见下 |

`Student` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | Student._id |
| org | String | 机构 ID |
| name | String | 学生姓名 |
| gender | String | 性别枚举 |
| birthday | Date\|null | 生日 |
| guardianUser | String\|null | 主监护人 User._id |
| guardians | String[] | 全部监护人 User._id 列表 |
| notes | String | 备注 |
| isActive | Boolean | 是否在读 |
| meta | Object | 扩展属性 |

---

## 2. 当前机构学生列表

- **Method / Path**：`GET /api/v1/students`
- **权限**：`student.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| keyword | String | 按 `name` 模糊匹配 |
| gender | String | 性别 |
| isActive | Boolean | 在读状态 |
| guardian | String (ObjectId) | 按监护人过滤 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：`{ data: { items: Student[], total, page, pageSize } }`。

---

## 3. 学生详情

- **Method / Path**：`GET /api/v1/students/:id`
- **权限**：`student.read`
- **成功响应** (`200 OK`)：单个 Student 对象（populate 监护人信息）。

---

## 4. 创建学生

- **Method / Path**：`POST /api/v1/students`
- **权限**：`student.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| name | String | 是 | 学生姓名 |
| gender | String | 否 | 性别枚举 |
| birthday | Date | 否 | 生日 |
| notes | String | 否 | 备注 |
| guardianMobile | String | 否 | 监护人手机号；**若该手机号已注册为 User**，自动关联到 `guardians` 与 `guardianUser`；若未注册，则提示需在 `setGuardians` 中按 ID 关联 |
| meta | Object | 否 | 扩展属性 |

- **成功响应** (`201 Created`)：返回创建的 Student。
- **副作用**：若传 `guardianMobile` 且该手机号已是 `User`，会同步创建/更新 `UserOrgRel`。

---

## 5. 更新学生

- **Method / Path**：`PUT /api/v1/students/:id`
- **权限**：`student.write`
- **请求体**（均可选）：`name`, `gender`, `birthday`, `notes`, `isActive`, `meta`。
- **成功响应** (`200 OK`)：返回更新后的 Student。

---

## 6. 软删学生

- **Method / Path**：`DELETE /api/v1/students/:id`
- **权限**：`student.write`
- **说明**：`isActive=false`，保留历史订单/考勤关联数据。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 7. 关联/替换监护人

- **Method / Path**：`PUT /api/v1/students/:id/guardians`
- **权限**：`student.write`
- **说明**：整体替换 `guardians` 数组（不是合并）；`guardianUser` 仍指向首位或显式指定。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| guardianIds | String[] | 是 | 监护人 User._id 列表；空数组清空 |
| guardianUser | String (ObjectId) | 否 | 主监护人；不传则默认取 `guardianIds[0]` |

- **约束**：传入的 User 必须存在于本机构（`UserOrgRel` 中存在与本机构的关联），否则 `400`。
- **成功响应** (`200 OK`)：返回更新后的 Student。

---

## 8. 家长查多个孩子的 stat 聚合 (2026-07-05 新增)

- **Method / Path**：`GET /api/v1/students/me/stats`
- **权限**：authenticated（家长）—— 不要求 `student.read` 权限码
- **说明**：跨所有孩子一次性聚合 stat（剩余课时 / 积分 / 近 7 天课程数），单次请求替代 N 次强制 `activeStudent` 端点切换。专为 C 端「我的」页「每个孩子一卡自带 stat」渲染用。
- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "items": [
      {
        "id": "66ab12...",
        "name": "王兴宇",
        "gender": "male",
        "avatar": "https://...",
        "stats": {
          "lessonsLeft": 32,
          "points": 9620,
          "upcoming": 7
        }
      },
      {
        "id": "66ab34...",
        "name": "王兴武",
        "gender": "male",
        "avatar": null,
        "stats": { "lessonsLeft": 12, "points": 540, "upcoming": 3 }
      }
    ]
  }
}
```

字段说明：

| 字段 | 类型 | 来源 |
| ---- | ---- | ---- |
| id | String | Student._id |
| name | String | 学生姓名 |
| gender | String | 性别枚举 |
| avatar | String\|null | 学生头像 (image) |
| stats.lessonsLeft | Number | StudentProduct.`isActive=true` 且 `remainingLessons > 0` 之求和 |
| stats.points | Number | PointsAccount.`balance` (无记录返 0) |
| stats.upcoming | Number | 当前时间 ~ 7 天内 `LessonSchedule` 数 (按该 kid 报名的 courseInstance 计, 过滤 `cancelled/archived`) |

**降级策略**: 任一聚合失败 (超时 / 异常) 时该 kid stat 降为 0，整体不崩溃。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 监护人不属于本机构 / 参数校验失败 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 学生不存在 |

---

## 9. 学生详情页 — 概览 (2026-08-07 新增)

- **Method / Path**：`GET /api/v1/students/:id/overview`
- **权限**：`student.read`
- **说明**：学员详情页一次性聚合 — 档案 + 监护人 + 学习画像 + 家长沟通画像 + 10 项业务计数（用于 KPI 行）。学员不属于当前机构 → 404（防 IDOR 枚举）。
- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "profile": {
      "id": "66ab12...",
      "org": "6500...",
      "name": "王兴宇",
      "gender": "male",
      "birthday": "2016-03-12",
      "avatarSvgKey": "boy",
      "school": { "id": "...", "name": "梓潼县人民小学", "type": "primary", "address": "..." },
      "grade": "三年级",
      "className": "2班",
      "notes": "过敏: 鸡蛋",
      "isActive": true,
      "isBlocked": false,
      "blockedAt": null,
      "blockedReason": null,
      "guardians": [
        { "id": "...", "mobile": "138****5678", "realName": "王女士", "avatarSvgKey": "mom" }
      ],
      "guardianUser": "...",
      "learningProfile": {
        "personality": "...",
        "learningGoal": "...",
        "weakness": "...",
        "classFeedback": "...",
        "strengths": "...",
        "followUp": "...",
        "lastUpdatedBy": { "id": "...", "realName": "李老师" },
        "lastUpdatedAt": "2026-07-28T..."
      },
      "createdAt": "2026-01-15T...",
      "updatedAt": "2026-07-30T..."
    },
    "counters": {
      "enrollments": 2,
      "enrollmentsArchived": 1,
      "lessonAttendances": 87,
      "lessonAttendancesUpcoming": 5,
      "studentProducts": 4,
      "studentProductsActive": 3,
      "orders": 5,
      "works": 23,
      "pointsBalance": 9620,
      "petEvents": 41
    },
    "parentId": "...",
    "parentProfile": {
      "commStyle": "...",
      "familyBg": "...",
      "childFocus": "...",
      "followUp": "...",
      "lastUpdatedBy": { "id": "...", "realName": "..." },
      "lastUpdatedAt": "..."
    }
  }
}
```

`parentId` / `parentProfile` 为 null = 该学员未走招生流程（无主监护人手机号 / 或 Parent 不存在），前端据此禁用「家长画像」按钮。

---

## 10. 学生详情页 — 分域明细 (2026-08-07 新增)

- **Method / Path**：`GET /api/v1/students/:id/related/:domain`
- **权限**：`student.read`
- **说明**：分页拉详情页 tab 数据。学员不属于当前机构 → 404。
- **路径参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| domain | String | 见下表 7 个域 |

| domain | 含义 | 数据源 | 排序 |
| ------ | ---- | ------ | ---- |
| enrollments | 在册开班（含历史） | CourseEnrollment | createdAt desc |
| lessonAttendances | 考勤记录 | LessonAttendance | plannedStartTime desc |
| studentProducts | 课包 | StudentProduct | active→remaining desc→createdAt desc |
| orders | 订单 | Order | createdAt desc |
| works | 作品（仅未归档） | StudentWork | createdAt desc |
| pointsTransactions | 积分流水 | PointsTransaction（跨 org） | createdAt desc |
| petEvents | 宠物事件 | PetEvent | createdAt desc |

未知 `domain` → 400。

- **查询参数**：`page`（默认 1）, `pageSize`（默认 10）。
- **成功响应** (`200 OK`)：`{ data: { items: [...], total, page, pageSize } }`。

各域 `items[]` 元素结构见 [studentOverview.service.js](./studentOverview.service.js) 的 `listXxx` 函数。
