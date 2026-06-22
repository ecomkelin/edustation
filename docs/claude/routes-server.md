# 后端路由索引 (routes-server.md)

> **何时读这个文件**：改 / 加 / 删 / 查后端 API 路由、跨模块影响分析、给路由提 bug 时读。
> **一行摘要**：本项目所有后端 HTTP 路由的"总表 + 编号表"，按模块号 MM 固定顺序排列；
>          改任何 `*.routes.js` 必须同步本文件。

---

## 0. 编号规则(速查)

格式: `R-MMPP`
- MM: 模块号 (01-33, 详见 §2 模块清单; 永不重排)
- PP: 模块内序号 (00-99, 顺位追加; 不重排, 不填空)

PP 槽位约定:
- `00..05` = list / detail / create / update / delete / removable-check (5 件套)
- `06..09` = lookup / stats / tree / sync
- `10..19` = 业务专用动词
- `20..29` = 状态机动词
- `30..39` = 子资源/嵌套
- `40..49` = 批量操作/预览
- `50..59` = 视图/特殊列表
- `60..69` = 业务流动词
- `70..79` = 客户端 C 端专用
- `80..89` = 平台超管字典 CRUD
- `90..99` = webhook / 实验 (99 留 deprecated)

新增模块: MM = max(现有 MM) + 1

## 1. 列字段说明

| 列 | 含义 |
|---|---|
| ID | 路由编号 (`R-MMPP`) |
| Method | HTTP 方法 |
| Path | 完整路径 (含 `:id` 占位) |
| Auth | 见下方简写表 |
| Permission | 业务权限码 (无则留 — ; 多码用 `/`) |
| Function | 一句话功能 (≤ 20 字) |
| 备注 | SSE / Webhook / Deprecated / 共享前缀 / 高风险等 |

Auth 列简写:
- `OPEN` = 公开 (无需 auth)
- `AUTH` = 仅 authenticate
- `PERM` = authenticate + requirePermission('xxx')
- `ADMIN` = authenticate + requirePlatformAdmin
- `ADMIN_PWD` = authenticate + requirePlatformPassword (高风险删)
- `GUARD` = authenticate + activeStudent (+ requireEnrolledStudent)
- `HMAC` = webhookAuth (webhook 验签)
- `NONE` = 直连, 无中间件 (health 等)

## 2. 模块清单 (MM 分配)

| MM | 模块 | URL 前缀 | 文件 | 端点数 |
|----|---|---|---|---:|
| 01 | auth + captcha | /auth /captcha | auth/, captcha/ | 8 |
| 02 | user | /users | user/ | 16 |
| 03 | position | /positions | position/ | 8 |
| 04 | student | /students | student/ | 12 |
| 05 | subject | /subjects | subject/ | 6 |
| 06 | category | /categories | category/ | 7 |
| 07 | region | /regions | region/ | 7 |
| 08 | school | /schools | school/ | 6 |
| 09 | org + orgPromotion | /orgs /orgs/:id/promotion | org/, orgPromotion/ | 10 |
| 10 | courseProduct | /course-products | courseProduct/ | 9 |
| 11 | courseInstance | /course-instances | courseInstance/ | 7 |
| 12 | courseEnrollment | /course-enrollments | courseEnrollment/ | 7 |
| 13 | room | /rooms | room/ | 6 |
| 14 | lessonSchedule | /lesson-schedules | lessonSchedule/ | 16 |
| 15 | lessonAttendance | /lesson-attendances | lessonAttendance/ | 9 |
| 16 | studentWork | /student-works | studentWork/ | 6 |
| 17 | order | /orders | order/ | 5 |
| 18 | studentProduct | /student-products | studentProduct/ | 4 |
| 19 | report | /reports | report/ | 7 |
| 20 | points | /points | points/ | 3 |
| 21 | pointsAdmin | /points-admin | pointsAdmin/ | 5 |
| 22 | pet (client) | /pet | pet/pet.routes.js | 10 |
| 23 | petAdmin | /admin/pet | petAdmin/ | 18 |
| 24 | petCatalog | /admin/pet | pet/petCatalog.admin.routes.js | 11 |
| 25 | parent | /parents | parent/ | 14 |
| 26 | childLead | /child-leads | childLead/ | 11 |
| 27 | trialBooking | /trial-bookings | trialBooking/ | 14 |
| 28 | agent | /agent | agent/ | 15 |
| 29 | accessControl | /access-control | accessControl/ | 32 |
| 30 | storage | /storage | storage/ | 8 |
| 31 | legal | /legal | legal/ | 10 |
| 32 | site-config | /site-config | siteConfig/ | 2 |
| 33 | health | /health | health/ | 1 |
| **合计** | | | | **~276** |

## 3. 路由总表 (按 MM 排序)

### MM=01 auth + captcha (URL: /auth, /captcha)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0100 | POST | /auth/login | OPEN | — | 登录 | 限流 + 滑块 |
| R-0101 | POST | /auth/refresh | OPEN | — | 刷新 access token | httpOnly cookie |
| R-0102 | POST | /auth/logout | AUTH | — | 登出 | 清 cookie |
| R-0103 | GET | /auth/me | AUTH | — | 当前用户信息 | |
| R-0104 | PUT | /auth/me | AUTH | — | 自助改资料 | 白名单字段 |
| R-0105 | POST | /auth/change-password | AUTH | — | 自助改密码 | 撤销所有 refresh |
| R-0110 | GET | /captcha/challenge | OPEN | — | 拿滑块挑战 | captcha 是 auth 防刷伴生 |
| R-0111 | POST | /captcha/verify | OPEN | — | 提交滑块答案 | 一次性 pass |

### MM=02 user (URL: /users)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0200 | GET | /users | PERM | user.read | 列表 | |
| R-0201 | GET | /users/:id | PERM | user.read | 详情 | |
| R-0202 | POST | /users | PERM | user.write | 新建 | |
| R-0203 | PUT | /users/:id | PERM | user.write | 更新 | |
| R-0204 | DELETE | /users/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-0205 | GET | /users/:id/removable-check | PERM | user.read | 删除预检 | |
| R-0206 | GET | /users/lookup | PERM | user.read | 按手机号查 | |
| R-0207 | GET | /users/unaffiliated | ADMIN | — | 游离用户列表 | 平台超管 |
| R-0208 | PUT | /users/unaffiliated/:id | ADMIN | — | 改游离用户 | 平台超管 |
| R-0209 | POST | /users/unaffiliated/:id/reset-password | ADMIN | — | 重置游离用户密码 | 平台超管 |
| R-0210 | PUT | /users/:id/block | ADMIN | — | 黑名单 | 平台超管 |
| R-0211 | PUT | /users/:id/unblock | ADMIN | — | 解黑名单 | 平台超管 |
| R-0212 | PUT | /users/:id/positions | PERM | user.write | 调整职位 | |
| R-0213 | POST | /users/:id/org | PERM | user.write | 关联到机构 | |
| R-0215 | POST | /users/:id/reset-password | PERM | user.resetPassword | 管理员重置密码 | |
| R-0216 | POST | /users/:id/change-password | PERM | — | 管理员代改密码 | |

### MM=03 position (URL: /positions)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0300 | GET | /positions | PERM | position.read | 列表 | |
| R-0301 | GET | /positions/:id | PERM | position.read | 详情 | |
| R-0302 | POST | /positions | PERM | position.write | 新建 | |
| R-0303 | PUT | /positions/:id | PERM | position.write | 更新 | |
| R-0304 | DELETE | /positions/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-0305 | GET | /positions/:id/removable-check | PERM | position.read | 删除预检 | |
| R-0306 | GET | /positions/permissions-catalog | PERM | position.write | 权限码字典 | |
| R-0307 | GET | /positions/source-orgs | ADMIN | — | 跨机构同步: 可选源机构 | 平台超管 |
| R-0308 | GET | /positions/by-org/:orgId | ADMIN | — | 跨机构同步: 源机构职位 | 平台超管 |
| R-0309 | POST | /positions/sync | ADMIN | — | 跨机构同步: 复制到目标 | 平台超管 |
| R-0312 | PUT | /positions/:id/permissions | PERM | position.write | 调整权限码 | |

### MM=04 student (URL: /students)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0400 | GET | /students | PERM | student.read | 列表 | |
| R-0401 | GET | /students/:id | PERM | student.read | 详情 | |
| R-0402 | POST | /students | PERM | student.write | 新建 | |
| R-0403 | PUT | /students/:id | PERM | student.write | 更新 | |
| R-0404 | DELETE | /students/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-0405 | GET | /students/:id/removable-check | PERM | student.read | 删除预检 | |
| R-0406 | GET | /students/:id/profile | PERM | student.read | 学习画像 | 6 字段结构化 |
| R-0407 | PUT | /students/:id/profile | PERM | student.write | 更新学习画像 | |
| R-0410 | PUT | /students/:id/block | ADMIN | — | 黑名单 | 平台超管 |
| R-0411 | PUT | /students/:id/unblock | ADMIN | — | 解黑名单 | 平台超管 |
| R-0414 | PUT | /students/:id/guardians | ADMIN | — | 重绑监护人 | 平台超管 |
| R-0472 | GET | /students/me | AUTH | — | 当前活跃孩子 | 家长端 |

### MM=05 subject (URL: /subjects)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0500 | GET | /subjects | PERM | subject.read | 列表 | |
| R-0501 | GET | /subjects/:id | PERM | subject.read | 详情 | |
| R-0502 | POST | /subjects | PERM | subject.write | 新建 | |
| R-0503 | PUT | /subjects/:id | PERM | subject.write | 更新 | |
| R-0504 | DELETE | /subjects/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-0505 | GET | /subjects/:id/removable-check | PERM | subject.read | 删除预检 | |
| R-0507 | GET | /subjects/source-orgs | ADMIN | — | 跨机构同步: 源机构列表 | 平台超管 |
| R-0508 | GET | /subjects/by-org/:orgId | ADMIN | — | 跨机构同步: 源机构学科 | 平台超管 |
| R-0509 | POST | /subjects/sync | ADMIN | — | 跨机构同步: 复制到目标 | 平台超管 |

### MM=06 category (URL: /categories)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0600 | GET | /categories | AUTH | — | 列表 | 任何登录用户 |
| R-0601 | GET | /categories/:id | AUTH | — | 详情 | |
| R-0602 | POST | /categories | PERM | 动态 (按 model) | 新建 | model=Student→student.write / Subject→subject.write / LeadTag+Channel→recruit.write |
| R-0603 | PUT | /categories/:id | PERM | 动态 (按 model) | 更新 | 同上 |
| R-0604 | DELETE | /categories/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-0605 | GET | /categories/:id/removable-check | AUTH | — | 删除预检 | |
| R-0608 | GET | /categories/tree | AUTH | — | 树形结构 | |

### MM=07 region (URL: /regions)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0700 | GET | /regions | AUTH | — | 列表 | 跨机构公共字典 |
| R-0701 | GET | /regions/:id | AUTH | — | 详情 | |
| R-0702 | POST | /regions | ADMIN | — | 新建 | 平台超管 |
| R-0703 | PUT | /regions/:id | ADMIN | — | 更新 | 平台超管 |
| R-0704 | DELETE | /regions/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-0705 | GET | /regions/:id/removable-check | AUTH | — | 删除预检 | |
| R-0708 | GET | /regions/tree | AUTH | — | 树形结构 | |

### MM=08 school (URL: /schools)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0800 | GET | /schools | PERM | school.read | 列表 | |
| R-0801 | GET | /schools/:id | PERM | school.read | 详情 | |
| R-0802 | POST | /schools | PERM | school.write | 新建 | |
| R-0803 | PUT | /schools/:id | PERM | school.write | 更新 | |
| R-0804 | DELETE | /schools/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-0805 | GET | /schools/:id/removable-check | PERM | school.read | 删除预检 | |

### MM=09 org + orgPromotion (URL: /orgs, /orgs/:id/promotion)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-0900 | GET | /orgs | ADMIN | — | 列表 | 平台超管 |
| R-0901 | GET | /orgs/:id | ADMIN | — | 详情 | 平台超管 |
| R-0902 | POST | /orgs | ADMIN | — | 新建 | 平台超管 |
| R-0903 | PUT | /orgs/:id | ADMIN | — | 更新 | 平台超管 |
| R-0917 | POST | /orgs/:id/toggle-active | ADMIN | — | 启用/停用 | 机构禁物理删除 |
| R-0930 | GET | /orgs/:id/promotion | PERM | org-promotion.read | 推广信息 | orgPromotion 子路由 |
| R-0931 | PUT | /orgs/:id/promotion | PERM | org-promotion.write | 更新推广信息 | |
| R-0953 | GET | /orgs/:id/candidate-principals | ADMIN | — | 候选法人 | 平台超管 |

### MM=10 courseProduct (URL: /course-products)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1000 | GET | /course-products | PERM | courseProduct.read | 列表 | |
| R-1001 | GET | /course-products/:id | PERM | courseProduct.read | 详情 | |
| R-1002 | POST | /course-products | PERM | courseProduct.write | 新建 | |
| R-1003 | PUT | /course-products/:id | PERM | courseProduct.write | 更新 | |
| R-1004 | DELETE | /course-products/:id | ADMIN_PWD | — | 物理删除 | 高风险, 互锁 Order/StudentProduct |
| R-1005 | GET | /course-products/:id/removable-check | PERM | courseProduct.read | 删除预检 | |
| R-1007 | GET | /course-products/_sync/source-orgs | ADMIN | — | 跨机构同步: 源机构列表 | 平台超管 |
| R-1008 | GET | /course-products/_sync/by-org/:orgId | ADMIN | — | 跨机构同步: 源机构产品 | 平台超管 |
| R-1009 | POST | /course-products/_sync | ADMIN | — | 跨机构同步: 复制到目标 | 平台超管 |

### MM=11 courseInstance (URL: /course-instances)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1100 | GET | /course-instances | PERM | courseInstance.read | 列表 | |
| R-1101 | GET | /course-instances/:id | PERM | courseInstance.read | 详情 | |
| R-1102 | POST | /course-instances | PERM | courseInstance.write | 新建开班 | |
| R-1103 | PUT | /course-instances/:id | PERM | courseInstance.write | 更新 | |
| R-1104 | DELETE | /course-instances/:id | ADMIN_PWD | — | 软删 | 状态互锁 |
| R-1105 | GET | /course-instances/:id/removable-check | PERM | courseInstance.read | 删除预检 | |
| R-1113 | PUT | /course-instances/:id/status | PERM | courseInstance.write/setStatus | 状态变更 | cancelled 仅超管 |

### MM=12 courseEnrollment (URL: /course-enrollments)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1200 | GET | /course-enrollments | PERM | courseEnrollment.read | 列表 | |
| R-1201 | GET | /course-enrollments/:id | PERM | courseEnrollment.read | 详情 | |
| R-1202 | POST | /course-enrollments | PERM | courseEnrollment.write | 新建报名 | |
| R-1203 | PUT | /course-enrollments/:id | PERM | courseEnrollment.write | 更新(分班) | |
| R-1204 | DELETE | /course-enrollments/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-1205 | GET | /course-enrollments/:id/removable-check | PERM | courseEnrollment.read | 删除预检 | |
| R-1213 | PUT | /course-enrollments/:id/status | PERM | courseEnrollment.write | 状态变更 | enrolled/withdrawn |

### MM=13 room (URL: /rooms)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1300 | GET | /rooms | PERM | room.read | 列表 | |
| R-1301 | GET | /rooms/:id | PERM | room.read | 详情 | |
| R-1302 | POST | /rooms | PERM | room.write | 新建 | |
| R-1303 | PUT | /rooms/:id | PERM | room.write | 更新 | |
| R-1304 | DELETE | /rooms/:id | ADMIN_PWD | — | 物理删除 | 高风险, 互锁 CourseInstance/LessonSchedule |
| R-1305 | GET | /rooms/:id/removable-check | PERM | room.read | 删除预检 | |

### MM=14 lessonSchedule (URL: /lesson-schedules)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1400 | GET | /lesson-schedules | PERM | lessonSchedule.read | 列表 | |
| R-1401 | GET | /lesson-schedules/:id | PERM | lessonSchedule.read | 详情 | |
| R-1402 | POST | /lesson-schedules | PERM | lessonSchedule.write | 单条新建 | |
| R-1403 | PUT | /lesson-schedules/:id | PERM | lessonSchedule.write | 更新 | |
| R-1404 | DELETE | /lesson-schedules/:id | ADMIN_PWD | — | 物理删除 | 高风险, 互锁考勤/作品 |
| R-1405 | GET | /lesson-schedules/:id/removable-check | PERM | lessonSchedule.read | 删除预检 | |
| R-1420 | POST | /lesson-schedules/:id/prepare | PERM | lessonSchedule.write | 准备上课 | scheduled → preparing |
| R-1421 | POST | /lesson-schedules/:id/start | PERM | lessonSchedule.write | 开始上课 | preparing → in_progress |
| R-1422 | POST | /lesson-schedules/:id/finish | PERM | lessonSchedule.write | 完成排课 | → finished |
| R-1424 | POST | /lesson-schedules/:id/archive | PERM | lessonSchedule.write | 归档 | finished → archived |
| R-1425 | POST | /lesson-schedules/:id/sync-attendances | PERM | lessonSchedule.write | 补齐名单 | 修 prepare 后报名漏建考勤 |
| R-1440 | POST | /lesson-schedules/preview | PERM | lessonSchedule.write | 批量排课预览 | 不入库 |
| R-1441 | POST | /lesson-schedules/generate | PERM | lessonSchedule.write | 批量排课生成 | 入库 |
| R-1442 | GET | /lesson-schedules/:id/sync-attendances/preview | PERM | lessonSchedule.read | 补齐名单预览 | UI 决定按钮显隐 |
| R-1450 | GET | /lesson-schedules/calendar | PERM | lessonSchedule.read | 日历视图 | |
| R-1451 | GET | /lesson-schedules/conflicts | PERM | lessonSchedule.read | 冲突预检 | |

### MM=15 lessonAttendance (URL: /lesson-attendances)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1500 | GET | /lesson-attendances | PERM | lessonAttendance.read | 列表 | |
| R-1502 | POST | /lesson-attendances | PERM | lessonAttendance.write | 手动添加考勤 | prepare 后补报名 |
| R-1526 | POST | /lesson-attendances/check-in | PERM | lessonAttendance.write | 签到 | |
| R-1527 | PUT | /lesson-attendances/:id/complete | PERM | lessonAttendance.write | 完成 | → completed |
| R-1528 | PUT | /lesson-attendances/:id/no-show | PERM | lessonAttendance.write | 缺席 | → no_show |
| R-1529 | PUT | /lesson-attendances/:id/evaluation | PERM | lessonAttendance.write | 更新课评 | |
| R-1530 | GET | /lesson-attendances/:id/works | PERM | studentWork.read | 考勤关联作品 | |
| R-1542 | POST | /lesson-attendances/bulk-mark | PERM | lessonAttendance.write | 批量登记 | 一次保存整节课 |
| R-1562 | POST | /lesson-attendances/:id/makeup | PERM | lessonAttendance.write | 补课 | 补建 completed 记录 |

### MM=16 studentWork (URL: /student-works)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1600 | GET | /student-works | PERM | studentWork.read | 列表 | 支持多维过滤 |
| R-1601 | GET | /student-works/:id | PERM | studentWork.read | 详情 | C 端 detail 用 |
| R-1602 | POST | /student-works | PERM | studentWork.write | 上传作品 | JSON 入参 + 预上传 fileIds |
| R-1603 | PATCH | /student-works/:id | PERM | studentWork.write | 更新 | 4 snapshot 字段不可改 |
| R-1604 | DELETE | /student-works/:id | ADMIN_PWD | — | 物理删除 | 高风险, 无业务引用 |
| R-1605 | GET | /student-works/:id/removable-check | PERM | studentWork.read | 删除预检 | 始终可删 |

### MM=17 order (URL: /orders)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1700 | GET | /orders | PERM | order.read | 列表 | |
| R-1701 | GET | /orders/:id | PERM | order.read | 详情 | |
| R-1702 | POST | /orders | PERM | order.write | 新建订单 | |
| R-1721 | POST | /orders/:id/pay | PERM | order.pay | 支付 | pending → paid |
| R-1723 | POST | /orders/:id/cancel | PERM | order.write | 取消 | pending → cancelled |

### MM=18 studentProduct (URL: /student-products)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1800 | GET | /student-products | PERM | studentProduct.read | 列表 | |
| R-1801 | GET | /student-products/:id | PERM | studentProduct.read | 详情 | |
| R-1806 | GET | /student-products/:id/remaining | PERM | studentProduct.read | 剩余课时 | |
| R-1869 | POST | /student-products/gift | PERM | studentProduct.gift | 赠课 | 员工直接建 StudentProduct |

### MM=19 report (URL: /reports)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1950 | GET | /reports/overview | PERM | report.read | 经营总览 | 营收/订单/学员/出勤 |
| R-1951 | GET | /reports/lesson-consumption | PERM | report.read | 课消与课表 | |
| R-1952 | GET | /reports/room-utilization | PERM | report.read | 教室利用率 | |
| R-1953 | GET | /reports/teacher-productivity | PERM | report.read | 老师产能 | |
| R-1954 | GET | /reports/points-activity | PERM | report.read | 积分与活跃 | |
| R-1955 | GET | /reports/recruit-promoter | PERM | recruit.read | 推广人 ROI | 招生看板 |
| R-1956 | GET | /reports/recruit-teacher-conversion | PERM | recruit.read | 试听老师转化率 | 招生看板 |

### MM=20 points (URL: /points)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2000 | GET | /points/transactions | GUARD | — | 积分流水 | 当前活跃孩子 |
| R-2060 | POST | /points/earn | GUARD | — | 手动获取积分 | stub, 阶段 2 接 trigger |
| R-2072 | GET | /points/me | GUARD | — | 当前孩子积分余额 | |

### MM=21 pointsAdmin (URL: /points-admin)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2100 | GET | /points-admin/accounts | PERM | points.read | 账户列表 | |
| R-2101 | GET | /points-admin/accounts/:studentId | PERM | points.read | 单孩子账户 | |
| R-2106 | GET | /points-admin/reasons | PERM | points.read | 原因字典 | Category(model=PointsReason) |
| R-2110 | GET | /points-admin/transactions | PERM | points.read | 流水列表 | |
| R-2115 | POST | /points-admin/accounts/:studentId/adjust | PERM | points.write | 手动加/扣分 | |

### MM=22 pet client (URL: /pet)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2200 | GET | /pet/events | GUARD | — | 事件流水 | |
| R-2206 | GET | /pet/species | GUARD | — | 物种字典 | |
| R-2207 | GET | /pet/items | GUARD | — | 道具字典 | |
| R-2263 | POST | /pet/adopt | GUARD | — | 领养 | 未报班不可用 |
| R-2264 | POST | /pet/hatch | GUARD | — | 孵化 | |
| R-2265 | POST | /pet/feed | GUARD | — | 喂养 | |
| R-2266 | POST | /pet/equip | GUARD | — | 换装 | |
| R-2267 | POST | /pet/swap-egg | GUARD | — | 换蛋 | |
| R-2268 | POST | /pet/tier-down | GUARD | — | 降阶 | |
| R-2272 | GET | /pet/me | GUARD | — | 我的宠物 | 懒创建 |

### MM=23 petAdmin (URL: /admin/pet)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2300 | GET | /admin/pet/accounts | PERM | pet.read | 账户列表 | 共享 /admin/pet 前缀 |
| R-2301 | GET | /admin/pet/accounts/:id | PERM | pet.read | 详情 | |
| R-2303 | PUT | /admin/pet/accounts/:id | PERM | pet.write | 更新 | |
| R-2306 | GET | /admin/pet/accounts-by-student | PERM | pet.read | 按 studentId 查 | 课堂展示页用 |
| R-2307 | GET | /admin/pet/events | PERM | pet.read | 事件流水 | |
| R-2363 | POST | /admin/pet/accounts | PERM | pet.write | 代领养 | 老师/admin 代操作 |
| R-2364 | POST | /admin/pet/accounts/:id/hatch | PERM | pet.write | 代孵化 | |
| R-2365 | POST | /admin/pet/accounts/:id/feed | PERM | pet.write | 代喂养 | |
| R-2366 | POST | /admin/pet/accounts/:id/equip | PERM | pet.write | 代换装 | |
| R-2367 | POST | /admin/pet/accounts/:id/swap-egg | PERM | pet.write | 代换蛋 | |
| R-2368 | POST | /admin/pet/accounts/:id/tier-down | PERM | pet.write | 代降阶 | |
| R-2373 | POST | /admin/pet/grant-item | PERM | pet.write | 代买装饰 | 扣学员积分 + unlocked |
| R-2374 | POST | /admin/pet/grant-consumable | PERM | pet.write | 代买食物/玩具 | 扣学员积分 + 立即喂 |
| R-2375 | GET | /admin/pet/shop | PERM | pet.read | 商城列表（admin 端） | 不走 C 端 activeStudent 中间件 |

### petShop C 端 (URL: /pet/shop)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2370 | GET | /pet/shop | GUARD | enrolled? | 商城列表（items + consumables） | active student 上下文 |
| R-2371 | POST | /pet/shop/buy-item | GUARD | enrolled | 学生买装饰 | 扣学生积分 + unlocked |
| R-2372 | POST | /pet/shop/buy-consumable | GUARD | enrolled | 学生买食物/玩具 | 扣学生积分 + 立即喂 |

### MM=24 petCatalog (URL: /admin/pet)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2480 | GET | /admin/pet/species | PERM | pet.read | 物种列表 | 共享 /admin/pet 前缀 |
| R-2481 | POST | /admin/pet/species | ADMIN | pet.write | 新建物种 | 平台超管 |
| R-2482 | GET | /admin/pet/species/:id | PERM | pet.read | 物种详情 | |
| R-2483 | PUT | /admin/pet/species/:id | ADMIN | pet.write | 更新物种 | 平台超管 |
| R-2484 | GET | /admin/pet/species/:id/removable-check | PERM | pet.read | 删除预检 | |
| R-2485 | DELETE | /admin/pet/species/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-2486 | GET | /admin/pet/items | PERM | pet.read | 道具列表 | |
| R-2487 | POST | /admin/pet/items | ADMIN | pet.write | 新建道具 | 平台超管 |
| R-2488 | GET | /admin/pet/items/:id | PERM | pet.read | 道具详情 | |
| R-2489 | PUT | /admin/pet/items/:id | ADMIN | pet.write | 更新道具 | 平台超管 |
| R-2490 | GET | /admin/pet/items/:id/removable-check | PERM | pet.read | 删除预检 | |
| R-2491 | DELETE | /admin/pet/items/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-2492 | GET | /admin/pet/consumables | PERM | pet.read | 消耗品列表 | |
| R-2493 | POST | /admin/pet/consumables | ADMIN | pet.write | 新建消耗品 | 平台超管 |
| R-2494 | GET | /admin/pet/consumables/:id | PERM | pet.read | 消耗品详情 | |
| R-2495 | PUT | /admin/pet/consumables/:id | ADMIN | pet.write | 更新消耗品 | 平台超管 |
| R-2496 | GET | /admin/pet/consumables/:id/removable-check | PERM | pet.read | 删除预检 | |
| R-2497 | DELETE | /admin/pet/consumables/:id | ADMIN_PWD | — | 物理删除 | 高风险 |

### MM=25 parent (URL: /parents)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2500 | GET | /parents | PERM | recruit.read | 列表 | |
| R-2501 | GET | /parents/:id | PERM | recruit.read | 详情 | |
| R-2503 | PUT | /parents/:id | PERM | recruit.write | 更新基础信息 | |
| R-2504 | DELETE | /parents/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-2505 | GET | /parents/:id/removable-check | PERM | recruit.read | 删除预检 | |
| R-2506 | GET | /parents/:id/profile | PERM | recruit.read | 家长画像 | 挂在 UserOrgRel |
| R-2507 | PUT | /parents/:id/profile | PERM | recruit.write | 更新画像 | |
| R-2510 | GET | /parents/:id/activities | PERM | recruit.read | 触点时间线 | 聚合所有孩子 |
| R-2541 | POST | /parents/with-child | PERM | recruit.write | 新建家长+首孩 | 1 API 核心 |
| R-2542 | POST | /parents/bulk-import | PERM | recruit.write | 批量导入 | Excel 上传后调用 |
| R-2543 | POST | /parents/:id/children | PERM | recruit.write | 同家长加孩 | |
| R-2544 | POST | /parents/:id/recompute-lifecycle | PERM | recruit.write | 重算 lifecycle | |
| R-2545 | POST | /parents/:id/tags | PERM | recruit.write | 加标签 | |
| R-2546 | DELETE | /parents/:id/tags/:tagId | PERM | recruit.write | 删标签 | |

### MM=26 childLead (URL: /child-leads)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2600 | GET | /child-leads | PERM | recruit.read | 列表 | |
| R-2601 | GET | /child-leads/:id | PERM | recruit.read | 详情 | |
| R-2602 | POST | /child-leads | PERM | recruit.write | 新建(单孩子) | parentId 必填 |
| R-2603 | PUT | /child-leads/:id | PERM | recruit.write | 更新 | |
| R-2604 | DELETE | /child-leads/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-2605 | GET | /child-leads/:id/removable-check | PERM | recruit.read | 删除预检 | |
| R-2610 | GET | /child-leads/:id/activities | PERM | recruit.read | 触点时间线 | |
| R-2644 | POST | /child-leads/:id/activities | PERM | recruit.write | 记录触点 | |
| R-2645 | PUT | /child-leads/:id/activities/:actId | PERM | recruit.write | 编辑触点 | 24h 内或超管 |
| R-2646 | DELETE | /child-leads/:id/activities/:actId | ADMIN_PWD | — | 物理删触点 | 高风险, 无软删 |
| R-2662 | POST | /child-leads/:id/unconvert | PERM | recruit.convert | 撤销转化 | 5 分钟内 |

### MM=27 trialBooking (URL: /trial-bookings)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2700 | GET | /trial-bookings | PERM | recruit.read | 列表 | |
| R-2701 | GET | /trial-bookings/:id | PERM | recruit.read | 详情 | |
| R-2703 | PUT | /trial-bookings/:id | PERM | recruit.write | 更新(cancelled/remark) | |
| R-2704 | DELETE | /trial-bookings/:id | ADMIN_PWD | — | 物理删除 | 高风险 |
| R-2705 | GET | /trial-bookings/:id/removable-check | PERM | recruit.read | 删除预检 | |
| R-2726 | POST | /trial-bookings/:id/check-in | PERM | recruit.write | 到店打卡 | |
| R-2727 | POST | /trial-bookings/:id/complete | PERM | recruit.write | 完成 | |
| R-2740 | POST | /trial-bookings/:id/convert-preview | PERM | recruit.convert | 转化预览 | 返回 initialPassword |
| R-2741 | POST | /trial-bookings/for-child | PERM | recruit.write | 为已转化孩子新建预约 | |
| R-2742 | POST | /trial-bookings/batch-schedule | PERM | recruit.write | 批量排课 | 核心 |
| R-2743 | POST | /trial-bookings/:id/reschedule-time | PERM | recruit.write | 改预约时间 | scheduled → scheduled |
| R-2744 | POST | /trial-bookings/:id/revert-to-unscheduled | PERM | recruit.write | 退回未约 | scheduled → awaiting |
| R-2745 | POST | /trial-bookings/:id/reschedule-from-cancelled | PERM | recruit.write | 取消后再约 | cancelled → 新 awaiting |
| R-2761 | POST | /trial-bookings/:id/convert | PERM | recruit.convert | 转化执行 | 建 User/Student |

### MM=28 agent (URL: /agent)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2800 | GET | /agent/ping | AUTH | — | ping | 开发期排查 |
| R-2801 | POST | /agent/chat | AUTH | — | 普通 chat | 兼容旧 AiChatTest |
| R-2802 | POST | /agent/parse-file | PERM | agent.write | 文件解析 | 单测用 |
| R-2803 | POST | /agent/chat/stream | PERM | agent.write | SSE 流式 chat | SSE |
| R-2804 | POST | /agent/execute | PERM | agent.write | 高风险工具执行 | 单独端点 |
| R-2806 | GET | /agent/tools | PERM | agent.read | 工具元数据 | |
| R-2810 | GET | /agent/conversations | PERM | agent.read | 会话列表 | |
| R-2811 | POST | /agent/conversations | PERM | agent.write | 新建会话 | |
| R-2812 | GET | /agent/conversations/:id | PERM | agent.read | 会话详情 | |
| R-2813 | PATCH | /agent/conversations/:id | PERM | agent.write | 修改会话 | 软删/标题 |
| R-2814 | DELETE | /agent/conversations/:id | PERM | agent.write | 软删会话 | |
| R-2815 | POST | /agent/conversations/:id/messages | PERM | agent.write | 手工追加消息 | 调试/补登 |
| R-2820 | GET | /agent/admin/conversations | ADMIN | — | 平台会话列表 | 平台超管 |
| R-2821 | GET | /agent/admin/conversations/:id | ADMIN | — | 平台会话详情 | 平台超管 |
| R-2822 | POST | /agent/admin/conversations/batch-delete | ADMIN | — | 平台批量软删 | 平台超管 |

### MM=29 accessControl (URL: /access-control)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-2900 | GET | /access-control/devices | PERM | accessControl.read | 设备列表 | Admin |
| R-2901 | POST | /access-control/devices | PERM | accessControl.write | 新建设备 | Admin |
| R-2902 | GET | /access-control/devices/:id | PERM | accessControl.read | 设备详情 | Admin |
| R-2903 | PUT | /access-control/devices/:id | PERM | accessControl.write | 更新设备 | Admin |
| R-2904 | DELETE | /access-control/devices/:id | ADMIN_PWD | — | 物理删除设备 | 高风险 |
| R-2905 | GET | /access-control/devices/:id/removable-check | PERM | accessControl.read | 删除预检 | Admin |
| R-2910 | GET | /access-control/face-profiles | PERM | accessControl.read | 人脸档案列表 | Admin |
| R-2911 | POST | /access-control/face-profiles | PERM | accessControl.write | 录入人脸 | Admin |
| R-2912 | GET | /access-control/face-profiles/:id | PERM | accessControl.read | 档案详情 | Admin |
| R-2913 | POST | /access-control/face-profiles/:id/revoke | PERM | accessControl.write | 撤销人脸 | Admin |
| R-2914 | DELETE | /access-control/face-profiles/:id | ADMIN_PWD | — | 物理删除档案 | PoC: 软删代替 |
| R-2915 | GET | /access-control/face-profiles/:id/removable-check | PERM | accessControl.read | 删除预检 | Admin |
| R-2920 | GET | /access-control/access-events | PERM | accessControl.read | 进出流水列表 | Admin |
| R-2922 | GET | /access-control/access-events/:id | PERM | accessControl.read | 单条流水 | Admin |
| R-2927 | GET | /access-control/access-events/stats | PERM | accessControl.read | 进出统计 | Admin |
| R-2930 | GET | /access-control/pickups | PERM | accessControl.read | 接送授权列表 | Admin |
| R-2931 | POST | /access-control/pickups | PERM | accessControl.pickup | 新建接送授权 | Admin |
| R-2932 | GET | /access-control/pickups/:id | PERM | accessControl.read | 授权详情 | Admin |
| R-2933 | PUT | /access-control/pickups/:id | PERM | accessControl.pickup | 更新授权 | Admin |
| R-2934 | POST | /access-control/pickups/:id/revoke | PERM | accessControl.pickup | 撤销授权 | Admin |
| R-2940 | GET | /access-control/consent/template | PERM | accessControl.read | 同意书模板 | Admin |
| R-2970 | POST | /access-control/client/face-profiles/enroll-my-child | GUARD | — | 家长录入孩子人脸 | Client |
| R-2971 | POST | /access-control/client/face-profiles/enroll-self | GUARD | — | 家长录入自己人脸 | Client |
| R-2972 | POST | /access-control/client/pickups | GUARD | — | 家长新建接送授权 | Client |
| R-2973 | GET | /access-control/client/pickups | GUARD | — | 家长查接送授权 | Client |
| R-2974 | POST | /access-control/client/pickups/:id/revoke | GUARD | — | 家长撤销授权 | Client |
| R-2975 | GET | /access-control/client/access-events/my-child | GUARD | — | 家长查孩子进出 | Client |
| R-2978 | GET | /access-control/client/access-events/as-pickup | GUARD | — | 接送人视角的进出 | Client |
| R-2976 | POST | /access-control/devices/:id/regenerate-secret | PERM | accessControl.write | 重新生成设备密钥 | Admin |
| R-2977 | POST | /access-control/devices/:id/door-state | PERM | accessControl.write | 设置门状态 | Admin |
| R-2943 | GET | /access-control/client/consent/my | GUARD | — | 我的同意书 | Client |
| R-2944 | POST | /access-control/client/consent/sign | GUARD | — | 签同意书 | Client |
| R-2945 | POST | /access-control/client/consent/:id/withdraw | GUARD | — | 撤回同意书 | Client |
| R-2990 | POST | /access-control/webhook/:deviceSn | HMAC | — | 进出事件回调 | Webhook |
| R-2992 | POST | /access-control/webhook/:deviceSn/heartbeat | HMAC | — | 设备心跳 | Webhook |

### MM=30 storage (URL: /storage)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3000 | GET | /storage/files | PERM | storage.read | 文件列表 | |
| R-3001 | POST | /storage/upload | AUTH | — | 单文件上传 | 无 storage.write 门控 |
| R-3002 | POST | /storage/upload-many | AUTH | — | 多文件上传 | max 20 个 |
| R-3003 | GET | /storage/files/:id | PERM | storage.read | 文件详情 | |
| R-3004 | POST | /storage/files/:id/bind | PERM | storage.write | 显式绑定引用 | |
| R-3005 | POST | /storage/files/:id/unbind | PERM | storage.write | 显式解绑引用 | |
| R-3006 | GET | /storage/files/:id/removable-check | PERM | storage.read | 删除预检 | 任意已认证 |
| R-3007 | DELETE | /storage/files/:id | PERM | storage.write | 物理删除 | refCount=0 才让删 |

### MM=31 legal (URL: /legal)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3100 | GET | /legal/platform | OPEN | — | 平台协议清单 | manifest |
| R-3101 | GET | /legal/platform/:key | OPEN | — | 平台单份协议 | markdown+html |
| R-3130 | GET | /legal/orgs/:orgId/legal-docs | PERM | legal.read | 机构协议列表 | |
| R-3131 | GET | /legal/orgs/:orgId/legal-docs/:key | OPEN | — | 机构单份协议 | 家长 C 端 |
| R-3132 | PUT | /legal/orgs/:orgId/legal-docs/:key | PERM | legal.write | 新版协议 | 软停旧+建新 |
| R-3133 | GET | /legal/orgs/:orgId/legal-docs/:key/history | PERM | legal.read | 协议历史 | |
| R-3134 | POST | /legal/orgs/:orgId/legal-docs/:key/disable | PERM | legal.write | 停用协议 | |
| R-3172 | GET | /legal/me/pending | AUTH | — | 我的待签协议 | |
| R-3173 | POST | /legal/me/consents | AUTH | — | 批量签同意 | |
| R-3174 | GET | /legal/me/consents | AUTH | — | 我的同意历史 | |

### MM=32 site-config (URL: /site-config)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3200 | GET | /site-config | OPEN | — | 平台配置 | admin Footer + client 备案 |
| R-3201 | PUT | /site-config | ADMIN | — | 更新配置 | 平台超管 |

### MM=33 health (URL: /health)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3300 | GET | /health | NONE | — | 健康检查 | 不挂 /api 前缀, 含 DB 状态 |

## 4. 变更日志

### 4.1 废弃路由 (Deprecated)

> 永不删除 R 编号; 标 deprecated 后移至此表, 不再列入 §3

| ID | 原路径 | 废弃日期 | 替代 |
|---|---|---|---|

### 4.2 变更记录 (倒序)

| 日期 | 改动 | R 编号 | 操作 |
|---|---|---|---|
| 2026-06-22 | 路由编号方案落地 | 全部 | init |
