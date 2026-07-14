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
- `ADMIN_PWD` = authenticate + requirePlatformPassword (高风险删, 平台超管)
- `PERM+PWD` = authenticate + requirePermission('xxx') + requireBodyPassword (工作流类弱化, 2026-07-08 立项)
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
| 17 | order | /orders | order/ | 8 |
| 18 | studentProduct | /student-products | studentProduct/ | 6 |
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
| 34 | finance | /finance | finance/ | 17 |
| 35 | audit | /audit-logs | audit/ | 5 |
| 40 | notification (v0.9) | /notifications | notification/ | 12 |
| **合计** | | | | **~311** |

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
| R-0472 | GET | /students/me | AUTH | — | 当前活跃孩子 | 家长端; 2026-07-05 修: 跨 org 列所有孩子 (userId 全量), populate org.name + school.name; 用于 active-student-header 切换器跨机构展示 |
| R-0473 | GET | /students/me/stats | AUTH | — | 多个孩子的 stat 聚合 (剩余课时 / 积分 / 近 7 天课程) | 2026-07-05; 专为 C 端 "我的" 页 kid-card 自带 stat; 跨 kid 1 次返; 2026-07-05 修: 跨 org 聚合 (家长在多机构各报班的孩子一齐显示), 不再被 req.orgId 截断 |
| R-0474 | GET | /students/me/profile | AUTH + ACTIVE | — | 当前活跃孩子的学习画像 (6 字段 + lastUpdatedBy/At) | 2026-07-11; C 端首页「学习画像」+ 学生 profile 页; 跳过 requirePermission, 走 activeStudent 中间件校验 "x-active-student-id 是 req.user 监护人"; 解决家长 Position 无 student.read 权限时 R-0406 403 的问题 (沿用 [memory: c-end-me-endpoint-pattern] /me 范式) |

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
| R-0932 | GET | /orgs/:id/public | AUTH | — | 公开机构主页 | C 端家长; 白名单字段 (隐藏合规 PII); 2026-07-03 扩展 subjects[]/teachers[]/products[] 3 段 (并发 Category/UserOrgRel/CourseProduct); 2026-07-10 扩展 courseInstances[] 1 段 (status ∈ enrolling/active; populate teacher + courseProduct.subjects; startDate↑; 限 20; 跳过 isTrial) |
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
| R-1101A | GET | /course-instances/:id/me | C-END | (activeStudent) | C 端开班详情 | 跳过 courseInstance.read 权限码;校验 activeStudent 是该开班报名学生 (允许回看退班/已结课);复用 detail 返回 + 增 myEnrollmentStatus;2026-07-04 立项修复 C 端 instance-detail 403 |
| R-1102 | POST | /course-instances | PERM | courseInstance.write | 新建开班 | |
| R-1103 | PUT | /course-instances/:id | PERM | courseInstance.write | 更新 | |
| R-1104 | DELETE | /course-instances/:id | ADMIN_PWD | — | 软删 (deletedAt) | 状态互锁 |
| R-1105 | GET | /course-instances/:id/removable-check | PERM | courseInstance.read | 删除预检 | |
| R-1106 | POST | /course-instances/:id/recover | ADMIN_PWD | — | 取消归档 (recover) | 2026-07-08 立项;把已软删的开班恢复, 仍需超管+密码 |
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
| R-1214 | GET | /course-enrollments/me | C-END | (activeStudent) | 我的报名列表 | 默认排除 withdrawn; 2026-07-03 spread req.query 支持 page/pageSize/status 过滤 |
| R-1215 | GET | /course-enrollments/me/by-instance/:courseInstanceId | C-END | (activeStudent) | 单课进度 (已上/计划总/剩余) | 聚合 LessonSchedule+Attendance |

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
| R-1421 | POST | /lesson-schedules/:id/start | PERM | lessonSchedule.write | 开始上课 | preparing → in_progress; body 可选 actualStartTime / actualStartReason |
| R-1422 | POST | /lesson-schedules/:id/finish | PERM | lessonSchedule.write | 完成排课 | → finished |
| R-1424 | POST | /lesson-schedules/:id/archive | PERM | lessonSchedule.write | 归档 | finished → archived |
| R-1425 | POST | /lesson-schedules/:id/sync-attendances | PERM | lessonSchedule.write | 补齐名单 | 修 prepare 后报名漏建考勤 |
| R-1440 | POST | /lesson-schedules/preview | PERM | lessonSchedule.write | 批量排课预览 | 不入库 |
| R-1441 | POST | /lesson-schedules/generate | PERM | lessonSchedule.write | 批量排课生成 | 入库 |
| R-1442 | GET | /lesson-schedules/:id/sync-attendances/preview | PERM | lessonSchedule.read | 补齐名单预览 | UI 决定按钮显隐 |
| R-1450 | GET | /lesson-schedules/calendar | PERM | lessonSchedule.read | 日历视图 | |
| R-1451 | GET | /lesson-schedules/conflicts | PERM | lessonSchedule.read | 冲突预检 | |
| R-1492 | GET | /lesson-schedules/me/calendar | GUARD | — | 我的课表 | C 端家长; active student 上下文; 仅 enrolled 开班下的排课 |
| R-1493 | GET | /lesson-schedules/me/by-instance/:courseInstanceId | GUARD | — | 开班内我的排课+考勤 | C 端家长; active student 上下文; instance-detail.vue 用; service 校验学生是该开班的 enrolled/archived 报名 |
| R-1494 | GET | /lesson-schedules/me/:id | GUARD | — | 课程详情(单节排课) | C 端家长; schedule/detail.vue 用; 修复家长调业务端 /:id 403; service 校验学生在该开班有有效报名; 返回 shape 跟 detail() 对齐(含考勤 + resolvedContent) |

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
| R-1536 | GET | /lesson-attendances/me | GUARD | — | 我的考勤 | C 端家长; active student 上下文; 默认 status∈{scheduled,completed,madeup,leave} 适合上传作品 |
| R-1562 | POST | /lesson-attendances/:id/makeup | PERM | lessonAttendance.write | 补课 | 补建 completed 记录 |
| R-1563 | POST | /lesson-attendances/:id/archive | PERM | lessonAttendance.write | 归档 | 2026-07-08; 软隐藏已结束学期的考勤, 反归档可逆 |
| R-1564 | POST | /lesson-attendances/:id/unarchive | PERM | lessonAttendance.write | 取消归档 | 同上 |

### MM=16 studentWork (URL: /student-works)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1600 | GET | /student-works | PERM | studentWork.read | 列表 | 多维过滤 + 日期/等级/上传者/排序,详见 §16.1 |
| R-1601 | GET | /student-works/:id | PERM | studentWork.read | 详情 | C 端 detail 用 |
| R-1602 | POST | /student-works | PERM | studentWork.write | 上传作品 | JSON 入参 + 预上传 fileIds |
| R-1603 | PATCH | /student-works/:id | PERM | studentWork.write | 更新 | 4 snapshot 字段不可改 |
| R-1604 | DELETE | /student-works/:id | ADMIN_PWD | — | 物理删除 | 高风险, 无业务引用 |
| R-1605 | GET | /student-works/:id/removable-check | PERM | studentWork.read | 删除预检 | 始终可删 |
| R-1606 | GET | /student-works/stats | PERM | studentWork.read | KPI 聚合 | 本期/上一期 total·ratedCount·avgLevel·unratedCount |
| R-1640 | GET | /student-works/export.csv | PERM | studentWork.read | CSV 导出 | BOM + ; 分隔 (Excel 友好); 仿 AuditLogs.exportCsv |
| R-1670 | GET | /student-works/me | GUARD | — | 我的作品 | C 端家长; active student 上下文 |
| R-1607 | POST | /student-works/:id/archive | PERM | studentWork.write | 归档 | 2026-07-08; 软隐藏老作品, 反归档可逆; 不需密码 |
| R-1608 | POST | /student-works/:id/unarchive | PERM | studentWork.write | 取消归档 | 同上 |

**§16.1 R-1600 新增 Query 参数**（2026-07-01）:

- `createdAtFrom` / `createdAtTo`：ISO 字符串日期范围（任一传即生效）
- `minLevel` / `maxLevel`：等级闭区间 1~5
- `uploadedBy`：上传者 User._id
- `sort`：默认 `-createdAt`；可选 `-createdAt / createdAt / -updatedAt / updatedAt / -level / level / title / -title`

### MM=17 order (URL: /orders)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1700 | GET | /orders | PERM | order.read | 列表 | |
| R-1701 | GET | /orders/:id | PERM | order.read | 详情 | |
| R-1702 | POST | /orders | PERM | order.write | 新建订单 | |
| R-1721 | POST | /orders/:id/pay | PERM | order.pay | 支付 | pending → paid |
| R-1722 | POST | /orders/:id/refund | PERM | order.pay | 退款 | 部分退款支持; 联动 StudentProduct 软停用; 累计退完转 refunded |
| R-1723 | POST | /orders/:id/cancel | PERM | order.write | 取消 | pending → cancelled |
| R-1704 | DELETE | /orders/:id | ADMIN_PWD | — | 物理删除 | 中风险, 互锁 StudentProduct.order; 业务硬门挡 paid/refunded |
| R-1705 | GET | /orders/:id/removable-check | PERM | order.read | 删除预检 | |
| R-2078 | GET | /orders/me | AUTH | — | 家长 C 端名下所有 kid 跨机构订单 | 2026-07-05 重构: 不再强制绑 activeStudentId, userId 反查所有 kid 子集; query.student/status/page/pageSize 任选; populate student.name+org; 响应含 orgIds + kidMap 给前端筛选项用 |

### MM=18 studentProduct (URL: /student-products)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-1800 | GET | /student-products | PERM | studentProduct.read | 列表 | |
| R-1801 | GET | /student-products/:id | PERM | studentProduct.read | 详情 | |
| R-1806 | GET | /student-products/:id/remaining | PERM | studentProduct.read | 剩余课时 | |
| R-1869 | POST | /student-products/gift | PERM | studentProduct.gift | 赠课 | 员工直接建 StudentProduct |
| R-1804 | DELETE | /student-products/:id | ADMIN_PWD | — | 物理删除 | 中风险, 互锁 LessonAttendance.studentProduct + CourseEnrollment.studentProduct |
| R-1805 | GET | /student-products/:id/removable-check | PERM | studentProduct.read | 删除预检 | |
| R-2080 | GET | /student-products/me/:id/usage | GUARD | — | 单课包消费明细 (C 端) | 复用 R-1806 getUsage 业务, service 加 activeStudent 校验防越权; 2026-07-10 立项 — 客户端「我的课包」点课包弹层展示, 移除之前走的 toast |

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
| R-2307 | GET | /admin/pet/events | PERM | pet.read | 事件流水（cursor 分页：query=cursor&limit） | 2026-06-22 由 page 改 cursor |
| R-2363 | POST | /admin/pet/accounts | PERM | pet.write | 代领养 | 老师/admin 代操作 |
| R-2364 | POST | /admin/pet/accounts/:id/hatch | PERM | pet.write | 代孵化 | |
| R-2365 | POST | /admin/pet/accounts/:id/feed | PERM | pet.write | 代喂养 | |
| R-2366 | POST | /admin/pet/accounts/:id/equip | PERM | pet.write | 代换装 | |
| R-2367 | POST | /admin/pet/accounts/:id/swap-egg | PERM | pet.write | 代换蛋 | |
| R-2368 | POST | /admin/pet/accounts/:id/tier-down | PERM | pet.write | 代降阶 | |
| R-2376 | POST | /admin/pet/accounts/:id/tier-up | PERM | pet.write | 手动升阶 | 满级+经验达标时主动升阶（不扣积分） |
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
| R-2700 | GET | /trial-bookings | PERM | recruit.read | 列表 | 含 preStudent.activitySummary + parent.aggregateActivitySummary (2026-06-24) |
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
| R-2830 | POST | /agent/chat/support | AUTH | — | 平台客服 SSE | C 端 4 tab 永久会话 (meta.supportUser=true) |
| R-2831 | POST | /agent/chat/support/reset | AUTH | — | 清空客服会话 | 保留 conv 行, 清消息 |
| R-2832 | GET  | /agent/chat/support/history | AUTH | — | 客服会话历史 | 含 messages; 无会话时返 conversation=null |

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
| R-3132 | PUT | /legal/orgs/:orgId/legal-docs/:key | PERM | legal.write | 新版协议 (允许空白) | 软停旧+建新; **2026-07-11 contentMarkdown 改 optional** 支持"快速建空白模板" |
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

### MM=34 finance (URL: /finance)

> 财务管理 (2026-06-25 立项)：账本 (FinanceAccount) + 流水 (FinanceTransaction) + 收支原因字典 (复用 Category.model='FinanceReason')。流水为 append-only ledger, 物理删除走 requirePlatformPassword + 业务门挡; Phase 1 不挂 Order 自动联动, 财务岗手动录入。
> 权限码：`finance.read` (列表/详情/汇总/字典只读) / `finance.write` (写账本/写流水/转账/字典 CRUD)。
> 详见 [data-models-finance.md](./data-models-finance.md) 与 [modules/finance/api.desc.md](../../packages/server/src/modules/finance/api.desc.md)。

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3400 | GET | /finance/accounts | PERM | finance.read | 账本列表 | isPrimary desc, createdAt desc |
| R-3401 | GET | /finance/accounts/primary | PERM | finance.read | 默认账本 | isPrimary=true && isActive=true |
| R-3402 | GET | /finance/accounts/:id | PERM | finance.read | 账本详情 | 含最近 10 笔流水 |
| R-3403 | POST | /finance/accounts | PERM | finance.write | 新建账本 | 按 type 强校验子字段 |
| R-3404 | PUT | /finance/accounts/:id | PERM | finance.write | 更新账本 | 白名单字段, 禁改 type/balance/isPrimary |
| R-3405 | DELETE | /finance/accounts/:id | ADMIN_PWD | — | 物理删除账本 | 高风险, 业务门挡 balance=0 + 非 isPrimary, 互锁 FinanceTransaction.account |
| R-3406 | GET | /finance/accounts/:id/removable-check | PERM | finance.read | 删除预检 | |
| R-3410 | GET | /finance/transactions | PERM | finance.read | 流水列表 | 按 occurredAt desc, 支持 accountId/type/reason/dateFrom/dateTo |
| R-3411 | GET | /finance/transactions/summary | PERM | finance.read | 流水汇总 | groupBy=reason/account/day/month |
| R-3412 | GET | /finance/transactions/:id | PERM | finance.read | 流水详情 | |
| R-3413 | POST | /finance/transactions | PERM | finance.write | 写一笔流水 | income/expense; service 校验 type+reason.direction |
| R-3414 | POST | /finance/transactions/transfer | PERM | finance.write | 转账 | 同 session 写 2 笔 (out+in), 共享 transferGroupId |
| R-3420 | GET | /finance/reasons | PERM | finance.read | 字典列表 | direction=in/out 过滤 |
| R-3421 | POST | /finance/reasons | PERM | finance.write | 新建字典 | direction 必填 (in/out) |
| R-3422 | PUT | /finance/reasons/:id | PERM | finance.write | 更新字典 | |
| R-3423 | DELETE | /finance/reasons/:id | ADMIN_PWD | — | 物理删除字典 | 中风险, 互锁 FinanceTransaction.reason |
| R-3424 | GET | /finance/reasons/:id/removable-check | PERM | finance.read | 删除预检 | |

### MM=35 audit (URL: /audit-logs)

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3500 | GET | /audit-logs | ADMIN | — | 列表 (分页 + 筛选) | platform-admin 硬门; query: page/pageSize/method/statusCode/userId/orgId/path/q/from/to/requestId |
| R-3501 | GET | /audit-logs/stats | ADMIN | — | 统计 (method × statusCode 桶) | |
| R-3502 | GET | /audit-logs/options | ADMIN | — | 筛选下拉 (去重 method/path/users) | |
| R-3503 | GET | /audit-logs/export.csv | ADMIN | — | 导出 CSV (BOM, Excel 友好) | |
| R-3504 | GET | /audit-logs/:id | ADMIN | — | 详情 | |

### MM=40 notification (URL: /notifications)

> 推送通知模块 (2026-07-11 v0.9 立项). 三层架构: Channel Adapter → NotificationService → Notification 模型.
> MVP 仅站内 Inbox; C 端 /me/* 跳过 requirePermission 仅 activeStudent 校验 (沿用 c-end-me-endpoint-pattern);
> 管理后台 publish/templates/logs 走 notification.* 权限码.
> **2026-07-13 拆 /me 与 /me/staff 子路由**: /me 挂 activeStudent 给家长; /me/staff 不挂给员工, 解决"员工调 /me 依赖不传 header 的隐含契约". 详见 [data-models-notification.md](data-models-notification.md).

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-4001 | POST | /notifications/publish | PERM | notification.send | 内部发布通知 | body 必填 type/recipientId; **可选 recipientRole (parent/staff/platform, 默认 parent)** — 员工触发点 (task_assigned/rejected/approved/cancelled + lesson_preparing) 传 'staff', 否则 Notification 落库 role 错位; payload/vars/scheduledFor 可选; 业务触发 (lessonSchedule/taskCron) 与代发都走这里 |
| R-4002 | GET | /notifications/me | AUTH | — | 我的 inbox (家长) | query: page/pageSize/status/archived/activeStudentId; 默认隐藏已归档; 路由组挂 activeStudent 中间件 |
| R-4003 | GET | /notifications/me/unread-count | AUTH | — | 红点未读数 (家长) | query: activeStudentId; 仅 count, 聚合不拉详情 |
| R-4004 | POST | /notifications/:id/read | AUTH | — | 标记已读 | 资源属主校验 (recipient == req.user.id); 幂等 (已读再调不动); 员工/家长共用 |
| R-4005 | POST | /notifications/me/read-all | AUTH | — | 一键已读 (家长) | query: activeStudentId |
| R-4006 | POST | /notifications/:id/archive | AUTH | — | 归档 | 资源属主校验; 归档同时若 unread 自动标 read; 员工/家长共用 |
| R-4007 | POST | /notifications/me/archive-all | AUTH | — | 一键归档 (家长) | query: activeStudentId |
| R-4008 | GET | /notifications/me/preferences | AUTH | — | 我的偏好 (家长) | 懒创建: 首次调用按默认策略建 |
| R-4009 | PUT | /notifications/me/preferences | AUTH | — | 改我的偏好 (白名单) | body 白名单: globalEnabled / categories.* / channels.*.enabled / quietHours |
| R-4010 | GET | /notifications/templates | PERM | notification.read | 模板列表 (机构 + 平台默认合并) | 机构优先, 平台默认兜底; 用于管理后台 |
| R-4011 | PUT | /notifications/templates/:type/:channel | PERM | notification.write | 新增 / 编辑模板 | 机构维度覆盖平台默认; 唯一索引 (org, type, channel) |
| R-4012 | GET | /notifications/admin/logs | PERM | notification.read | 发送流水 (30 天) | query: channel/status/page/pageSize; NotificationLog TTL 30d |
| R-4013 | GET | /notifications/me/staff | AUTH | — | 员工 inbox 列表 | **2026-07-13 新增**: 不挂 activeStudent, 给员工 (老师/教务/财务/超管) 拉自己的 task_assigned/rejected/approved/cancelled + lesson_preparing 等通知; query: page/pageSize/status/archived |
| R-4014 | GET | /notifications/me/staff/unread-count | AUTH | — | 员工红点 | 同上, 仅 count; admin 顶栏 NotificationBell.vue 30s 轮询 |
| R-4015 | POST | /notifications/me/staff/read-all | AUTH | — | 员工一键已读 | |
| R-4016 | POST | /notifications/me/staff/archive-all | AUTH | — | 员工一键归档 | |

### MM=41 system ops (URL: /admin/cron)

> 该模块无业务逻辑, 只暴露 `setInterval` 定时任务的运行时状态。  
> 用途: 排查 cron 是否在跑 / 是否报错 / 多副本场景识别哪台没启动 cron。  
> 配套日志格式: `pid=<pid> uptime=+<sec>s [<name>] tick: <key>=<val> ...`

| 编号 | Method | Path | Auth | 权限码 | 用途 | 备注 |
|---|---|---|---|---|---|---|
| R-4101 | GET | /admin/cron/status | PLATFORM_ADMIN | — | 所有 cron 实时状态 + 全局视图 | 进程级 uptime + 每 cron stats + replicas[] (跨副本心跳) + cronLocks[] (当前 leader 持有者); 不写 audit |
| R-4102 | POST | /admin/cron/:name/tick | PLATFORM_ADMIN | — | 手动 trigger 单个 cron | 绕过 leader 锁, 用于调试; 计数 totalManualTicks; 404 当 name 不存在 |

**§41.1 涵盖的 cron**（2026-07-13 共 6 个）:

- `taskCron` (60s, **leader**) — 过期扫描 + 周期模板生成 + 到期任务通知
- `archiveCron` (12h) — Task/StudentWork/LessonAttendance 自动归档 (幂等 updateMany, 不需要锁)
- `notificationCron` (5min, **leader**) — 调度时间到期的通知派发 (dispatch 会发微信/短信)
- `petCron` (1h, **leader**) — 宠物饥饿衰减 + 死亡重生 (写 PetEvent)
- `loginRateLimitSweep` (5min) — 清空已解锁的限流桶 (进程内存)
- `captchaSweep` (1min) — 清过期 captcha challenge + pass (进程内存)

> **leader**: 该 cron 启用了分布式锁 (mongo `cron_locks` collection), 多副本部署时只让一个进程跑, 其他副本 `helper.skip()` 跳过 (累加 `totalSkipped`)。详见 `cronLock.js`。

**§41.2 排查套路**:

- `secondsSinceLastRun > intervalMs * 3` → cron 停了 (没崩但卡死)
- `totalErrors / totalTicks > 0.05` → 高错误率, 看 `lastError`
- `totalSkipped` 持续增长 → 当前副本没抢到锁, 看 mongosh `db.cron_locks.find()` 确认 owner 是谁
- 多副本部署时, 端点返回各副本自己的状态; 要全局视图另起聚合服务

**§40.1 默认偏好策略**（2026-07-11）:

- 总开关: `globalEnabled=true` (默认)
- 分类默认: lesson/task/order/evaluation/access/system = `enabled=true` (channels=['inbox']); point/pet = `enabled=false`
- 渠道默认: inbox=`enabled=true capability=true` (永远); wechatMini=`enabled=true capability=绑微信?`; wechatPublic/sms/push=`enabled=false`
- `isChannelEnabled` 综合判定: 全关 globalEnabled / category / channel / capability 四道闸门
- inbox 必到: publish 时强制把 'inbox' 放 channels[] 第一行, 即便其他渠道全 skip

**§40.2 触发点**（MVP）:

- `lessonSchedule.generateAttendancesForSchedule` → 给每个考勤的 guardians 发 `lesson_remind_1h` (scheduledFor=plannedStart-1h)
- `taskCron.notifyDueToday` (每分钟 tick) → 给今天到期任务的 assignee+supervisor+creator 发 `task_due` (即时)

**§40.3 扩展路线**:

- Phase 2: 微信小程序订阅消息 + wechatMini ChannelAdapter (需先在微信公众平台申请订阅消息模板 ID)
- Phase 3: 短信 (阿里云) + 微信公众号模板消息
- Phase 4: WebSocket 实时推送 + UniPush (小程序关闭时保底)

## 4. 变更日志

### 4.1 废弃路由 (Deprecated)

> 永不删除 R 编号; 标 deprecated 后移至此表, 不再列入 §3

| ID | 原路径 | 废弃日期 | 替代 |
|---|---|---|---|

### 4.2 变更记录 (倒序)

| 日期 | 改动 | R 编号 | 操作 |
|---|---|---|---|
| 2026-07-13 | 通知模块 MM=40 v0.9 扩展: 加 5 个员工侧触发点 (task_assigned/rejected/approved/cancelled + lesson_preparing), 拆 /me/staff 子路由 (员工不挂 activeStudent), 加 admin NotificationBell 铃铛红点 + StaffInbox 全量页; publish 入参 `recipientRole` (parent/staff/platform, 默认 parent) 解决 staff role 标错位; seed 加 5 模板 (占位符 taskTitle/actorName/comment/score/dueAt/priority); task.service notifyDueToday 修 B1 (assignee 取 a.user); 修复 routes-server.md | R-4001~R-4016 | add/modify |
| 2026-07-14 | 内容模块 Article + Video 回退 platform-only (用户决策): service 删除 orgId 必传校验 + filter 移除 `org: orgId`; admin CRUD (R-3602~3607/R-3804~3809) `requirePermission('xx.read/write')` → `requirePlatformAdmin`; C 端公开端点 (R-3600/3601/R-3800~3802) 移除 x-org-id 依赖; `/videos/:id/play` (R-3803) 移除 requireOrg; `contentEngagement.service.record` 入参去掉 orgId, 内部从 activeStudentId 反查 `Student.org` 作为事件分桶 key (engagement 流仍 per-org); `articleUsageChecks`/`videoUsageChecks` 不带 org; permissionLabels article/video group 标注 platform-only; DEFAULT_POSITIONS 「管理员/教务」撤销 4+2 码 article/video.read/write; initial.data.json 梓潼 3 Position + 绵阳 1 Position 同步清理 (9 行); admin DefaultLayout 「科普内容」子组从「机构管理」挪到「系统管理 → 平台配置」并 requirePlatform; admin router `/content/articles` + `/content/videos` 加 `meta.platform=true`; content.seed.js `upsertArticles/upsertVideos` 不接 orgId, run() 自带 drop articles+videos collections + `contentengagements.deleteMany({contentType:'game'})`; C 端 explore.vue / api / pages.json 0 改动 (x-org-id 自动透传但被 service 忽略); 同日 Game 模块整条下线 (R-3700~R-3710 全部 DEPRECATED, doc 仅留 R 号段追溯) | R-3602~3609/R-3804~3811 全部 Auth 改 platform-admin; R-3612 requirePermission → requirePlatformAdmin; 删 Game 章节 | modify |
| 2026-07-13 | 系统运维 MM=41 升级 v2 (cron 多副本 + 优雅停机 + 手动 trigger + 副本心跳 + 互斥): R-4102 进程内手动 tick 互斥 (并发返 409 + conflict 详情); cronRegistry 加 `manualTickLocks` Map + `manualTickInFlight` 字段; dieAndRebirth 返 'ok'\|'cas_failed'\|'no_tier_config' (sweepOne 据此 stats 计数, 不再静默谎报 'died'); PetEvent 加 eventKey 字段 + sparse unique 索引做幂等 (mongosh 触发 _id Cast 静默丢数据改用独立字段); sweepOne 返回 'die_error' → stats.errors (pet.tier 数据异常); | R-4101/R-4102 | modify |
| 2026-07-11 | 通知模块 MM=40 v0.9 立项: 4 model + 3 service + inbox adapter + cron + 12 端点 R-4001~R-4012; MVP 仅站内 Inbox (C 端 /me/* + 管理后台 publish/templates/logs); 触发点 lesson_remind_1h (lessonSchedule) + task_due (taskCron); 默认偏好 lesson/task/order/access 开 + point/pet 关; seed 2 平台默认模板 | R-4001 ~ R-4012 | add |
| 2026-07-11 | 机构协议 R-3132 PUT 允许 contentMarkdown 为空 (validator `optional({values:'falsy'})` + service 兼容空字符串); 新增 5 个空白占位 key seed (org-about/org-faq/points-rule/share-rule/org-contact), 接入 init-seeds.js 跑 legal.seed | R-3132 | modify |
| 2026-06-22 | 路由编号方案落地 | 全部 | init |
| 2026-06-25 | 订单/课包物理删除门控上线 (中风险范式) | R-1704 / R-1705 / R-1804 / R-1805 | add |
| 2026-06-25 | 订单退款端点 R-1722 上线 (支持部分退款 + SP 软停用) | R-1722 | add |
| 2026-06-25 | 财务模块 MM=34 上线 (账本 + 流水 + 字典; account-ledger pattern) | R-3400 ~ R-3424 | add |
| 2026-06-27 | 审计日志 MM=35 上线 (操作留痕中间件 + 5 端点; 仅平台超管可见; controller 零侵入) | R-3500 ~ R-3504 | add |
| 2026-07-08 | 员工任务模块 MM=39 上线 (三角色协作 + checklist + 监督人审批 + 看板 + 周期任务模板 + cron; 6 model + 22 端点 + 5 admin 视图; §8.1 物理删除防护) | R-3900 ~ R-3919, R-3920/21 归档, R-3922 item 删除 | add |
| 2026-07-10 | C 端单课包消费明细 R-2080 上线 (复用 admin R-1806 getUsage 业务; service.getUsageMe 强校验 student == activeStudentId 防越权; 客户端「我的课包」点课包弹层展示, 移除 toast 占位) | R-2080 | add |
| 2026-07-03 | R-1214 /course-enrollments/me spread req.query 支持 page/pageSize/status 过滤 (C 端全量列表页用) | R-1214 | modify |
| 2026-07-03 | R-0932 /orgs/:id/public 扩展学科/老师/课包 3 段 (并发 Category+UserOrgRel+CourseProduct) | R-0932 | modify |
| 2026-07-10 | R-0932 /orgs/:id/public 扩展开课信息 courseInstances[] 1 段 (enrolling+active 按 startDate↑; populate teacher + courseProduct.subjects; 限 20; 跳过 isTrial) | R-0932 | modify |
| 2026-07-03 | 内容模块 MM=36 article + MM=37 game 上线 (平台超管发, C 端探索 tab 展示; 6+7=13 端点; admin CRUD + 公开端点 + viewCount/playCount 原子计数; tab2 child → explore 改名 + globe 图标) | R-3600 ~ R-3605 / R-3700 ~ R-3706 | add |
| 2026-07-03 | 内容模块 MM=38 video 上线 (科普视频平台级; 8 端点; 与 Article/Game 一致评级; C 端 explore tab 视频 section 默认 1 个 (R-3800 featured) + 文章 4 个 (1 头条+3 列表) + 游戏 加载更多式分页; seed 6 段 mp4 demo) | R-3800 ~ R-3807 | add |
| 2026-07-03 | 内容模块 MM=36/37/38 下放 per-org: service filter org=null → org=req.orgId (强制 x-org-id); 写操作 requirePlatformAdmin → requirePermission('xx.write'); admin 菜单移到「机构管理 → 科普内容」; C 端 explore.vue 无改动靠 x-org-id 自动隔离; seed Org.find 循环每个启用 Org 各一份 | R-3602~3605/R-3703~3706/R-3804~3807 + 所有公开 GET | modify |
| 2026-07-04 | 科普内容运营分析 (ContentEngagement event log): 新建 content_engagements collection + adminStats/adminRowStats 6 端点 (article.read/video.read/game.read); video/game /play 接受 body.durationMs + 记录 activeStudentId+sessionMs (game /play 加 mws.requireOrg); article detail 自动记 1 条 event (sessionMs=0); 复用 reportCache 60s TTL + resolveRange time-range; admin UI 删「下架」按钮 (改用 editDialog isPublished switch) + 加 KpiCard 顶栏 + per-row stats 列; C 端 video-play / game-launch onPause/onEnded/onUnload report durationMs | R-3606/3607/R-3707/3708/R-3808/3809 | add |
| 2026-07-04 | 科普内容超管物理删除 (CLAUDE.md §8.1 三重防护): 6 新端点 (3 module × {POST /:id/purge ADMIN_PWD + GET /:id/removable-check PERM}); service 增 `articleUsageChecks/gameUsageChecks/videoUsageChecks` 命名函数 + `remove(id, orgId)` + `removableCheck(id, orgId)`; 挡 ContentEngagement.contentId 引用 (assertUnused 422); admin UI 在「操作」列加 `<DestructiveConfirm>` 「误操删除」按钮 (v-if=isPlatformAdmin, 宽度 100→170); 普通员工只看到「编辑」 | R-3608/3609/R-3709/3710/R-3810/3811 | add |
| 2026-07-04 | admin edit 正文空白修复: article.adminList 投影剔除 contentMarkdown + contentHtml 省带宽 → dialog edit 时 textarea 显示空白; 新增 R-3612 GET /articles/admin/:id (adminDetail, 含大字段, 草稿也能看); ContentArticles.vue#openEdit async fetch detail 后再开 dialog | R-3612 | add |

### MM=36 article (URL: /articles)

> 平台级科普文章 (2026-07-03 立项, 2026-07-14 回退 platform-only). org=null 平台级, 跨机构对所有家长可见; 仅平台超管可发布/编辑 (requirePlatformAdmin).
> 2026-07-14 内容回退: service 不再校验 orgId, 公开端点无需 x-org-id; engagement.record 内部从 activeStudentId 反查 kid.org 分桶.
> C 端探索 tab 「趣味科普」section 显示最新 4 篇（实际拉 12 客户端截前 4, 单端点不分页 — seed 超过 12 时再开 R-3606 `/articles/recent?limit=4`）.

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3600 | GET | /articles | — | — | C 端公开列表 (已发布 + 分页) | query: category/page/pageSize; 不返 contentHtml; platform-only 不过滤 org |
| R-3601 | GET | /articles/:id | — | — | C 端公开详情 (+1 viewCount 原子更新) | 只返 isPublished=true; 404 if 草稿/已下架; 不过滤 org; bumpViewCount 顺手记 1 条 engagement (sessionMs=0, kid.org 反查) |
| R-3602 | GET | /articles/admin/list | ADMIN | (platform-admin) | 后台列表 (含草稿) | query: isPublished/category/keyword/page/pageSize; **2026-07-14 改造**: requirePlatformAdmin 中间件 (article.read perm 留作 catalog 占位, 从普通 Position 撤销持有) |
| R-3603 | POST | /articles/admin | ADMIN | (platform-admin) | 后台创建 | body 必填 title/contentMarkdown; 服务端 marked 编译 contentHtml; **2026-07-14 改造**: requirePlatformAdmin; 写 org=null |
| R-3604 | PUT | /articles/admin/:id | ADMIN | (platform-admin) | 后台更新 | contentMarkdown 改 → 重编译 contentHtml; **2026-07-14 改造**: requirePlatformAdmin; filter 不带 org |
| R-3605 | DELETE | /articles/admin/:id | ADMIN | (platform-admin) | 软下架 (isPublished=false) | **2026-07-14 改造**: requirePlatformAdmin; filter 不带 org; 不物理删除; **2026-07-04 admin UI 已删除「下架」按钮, editDialog.isPublished switch 替代** |
| R-3606 | GET | /articles/admin/stats | ADMIN | (platform-admin) | 顶部 KPI 卡 (累计浏览 / 独立观众) | **2026-07-14 改造**: requirePlatformAdmin; engagement 按 req.orgId 过滤 (per-org 事件流); query: range=today|week|month; 60s 进程内缓存 |
| R-3607 | GET | /articles/admin/row-stats | ADMIN | (platform-admin) | per-row Map<contentId, {totalEvents, uniqueStudents, totalMs}> | **2026-07-14 改造**: requirePlatformAdmin; engagement 按 req.orgId 过滤; admin list 注入 _stats |
| R-3608 | POST | /articles/admin/:id/purge | ADMIN_PWD | — | **超管物理删除** (2026-07-04) | CLAUDE.md §8.1 三重防护; **2026-07-14 改造**: usageChecks filter 不带 org (内容 platform-only) |
| R-3609 | GET | /articles/admin/:id/removable-check | ADMIN | (platform-admin) | **删除预检** | **2026-07-14 改造**: requirePlatformAdmin (article.read perm 已从普通 Position 撤销); 返 `{canRemove, blockers}` |
| R-3612 | GET | /articles/admin/:id | ADMIN | (platform-admin) | **admin 单条详情** (含 contentMarkdown + contentHtml) | 2026-07-04 新增; adminList 为省带宽显式剔除大字段, edit dialog 需要原文回填; 不过滤 isPublished (草稿也能看); **2026-07-14 改造**: requirePlatformAdmin |

### MM=37 game (URL: /games) — **DEPRECATED 2026-07-14**

> **2026-07-14 彻底下线**（用户决策）: 模块整条删除（model / service / controller / routes / seed / menu / permission 全部清空）。  
> 端点代码已不存在，仅保留 R 号段供历史归档。 ContentEngagement 中 contentType='game' 历史事件由 contentSeed.run() 自动 `deleteMany` 清空。
>
> 历史表（仅供追溯，禁止新增端点借用此段 PP）:

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3700 | GET | /games | — | — | _(下线)_ | 历史 C 端列表 |
| R-3701 | GET | /games/:id | — | — | _(下线)_ | 历史 C 端详情 |
| R-3702 | POST | /games/:id/play | AUTH | — | _(下线)_ | 历史 C 端启动计数 |
| R-3703 | GET | /games/admin/list | ADMIN | ~~game.read~~ | _(下线)_ | 历史后台列表 |
| R-3704 | POST | /games/admin | ADMIN | ~~game.write~~ | _(下线)_ | 历史后台创建 |
| R-3705 | PUT | /games/admin/:id | ADMIN | ~~game.write~~ | _(下线)_ | 历史后台更新 |
| R-3706 | DELETE | /games/admin/:id | ADMIN | ~~game.write~~ | _(下线)_ | 历史软下架 |
| R-3707 | GET | /games/admin/stats | ADMIN | ~~game.read~~ | _(下线)_ | 历史 KPI |
| R-3708 | GET | /games/admin/row-stats | ADMIN | ~~game.read~~ | _(下线)_ | 历史 per-row |
| R-3709 | POST | /games/admin/:id/purge | ADMIN_PWD | — | _(下线)_ | 历史超管物理删除 |
| R-3710 | GET | /games/admin/:id/removable-check | PERM | ~~game.read~~ | _(下线)_ | 历史删除预检 |

### MM=38 video (URL: /videos)

> 平台级科普视频 (2026-07-03 立项, 2026-07-14 回退 platform-only). org=null 平台级, 跨机构对所有家长可见; 仅平台超管可发布/编辑 (requirePlatformAdmin); C 端公开 + web-view 播放.
> 2026-07-14 内容回退: service 不再校验 orgId, 公开端点无需 x-org-id; engagement.record 内部从 activeStudentId 反查 kid.org 分桶.
> C 端展示策略 (2026-07-03 用户决策): 探索 tab 「趣味科普视频」section 默认显示最新 1 个 (R-3800 featured); 「查看所有」CTA 跳 `/pages/content/video-list` 走 R-3801 加载更多式分页.

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3800 | GET | /videos/featured | — | — | C 端默认展示 (最新 1 个英雄位) | sort by publishedAt desc limit 1; platform-only (org=null); 不需要 x-org-id |
| R-3801 | GET | /videos | — | — | C 端公开全量列表 (已发布 + 分页) | query: category/page/pageSize (max 50); platform-only; 不过滤 org |
| R-3802 | GET | /videos/:id | — | — | C 端公开详情 | bumpViewCount 原子 +1; 不过滤 org |
| R-3803 | POST | /videos/:id/play | AUTH | — | C 端播放计数 (+1, 原子) | **2026-07-14 改造**: 不再 requireOrg (内容 platform-only); engagement.record 内部反查 kid.org; 失败不影响前端 |
| R-3804 | GET | /videos/admin/list | ADMIN | (platform-admin) | 后台列表 (含草稿) | query: isPublished/category/keyword/page/pageSize; **2026-07-14 改造**: requirePlatformAdmin 中间件 (video.read perm 留作 catalog 占位, 从普通 Position 撤销持有) |
| R-3805 | POST | /videos/admin | ADMIN | (platform-admin) | 后台创建 | videoUrl 必填且 https://; **2026-07-14 改造**: requirePlatformAdmin; 写 org=null |
| R-3806 | PUT | /videos/admin/:id | ADMIN | (platform-admin) | 后台更新 | **2026-07-14 改造**: requirePlatformAdmin; filter 不带 org |
| R-3807 | DELETE | /videos/admin/:id | ADMIN | (platform-admin) | 软下架 (isPublished=false) | **2026-07-14 改造**: requirePlatformAdmin; filter 不带 org; **2026-07-04 admin UI 已删除「下架」按钮** |
| R-3808 | GET | /videos/admin/stats | ADMIN | (platform-admin) | 顶部 KPI 卡 (累计播放 / 独立观众 / 累计观看时长) | **2026-07-14 改造**: requirePlatformAdmin; engagement 按 req.orgId 过滤 (per-org 事件流); query: range=today|week|month; 60s 进程内缓存 |
| R-3809 | GET | /videos/admin/row-stats | ADMIN | (platform-admin) | per-row Map<contentId, stats> | **2026-07-14 改造**: requirePlatformAdmin; engagement 按 req.orgId 过滤; admin list 注入 _stats |
| R-3810 | POST | /videos/admin/:id/purge | ADMIN_PWD | — | **超管物理删除** (2026-07-04) | CLAUDE.md §8.1 三重防护; **2026-07-14 改造**: usageChecks filter 不带 org (内容 platform-only) |
| R-3811 | GET | /videos/admin/:id/removable-check | ADMIN | (platform-admin) | **删除预检** | **2026-07-14 改造**: requirePlatformAdmin (video.read perm 已从普通 Position 撤销); 返 `{canRemove, blockers}` |

### MM=39 task (URL: /tasks)

> 员工任务模块 (2026-07-08 立项). 三角色协作: creator (1 个) / assignees (≥1) / supervisors (必填 1 个, 默认=creator).
> 多执行人各自勾选 checklist (TaskItem); 全员 submitted → 任务进 submitted → 监督人 review.
> 周期任务由 TaskTemplate 模板 + cron 触发,自动生成 Task 实例.
> C 端不挂 (家长无任务模块). 物理删除走 §8.1 (requirePlatformPassword + 业务门挡 submitted/approved).
> 详见 [data-models-task.md](data-models-task.md).

| ID | Method | Path | Auth | Permission | Function | 备注 |
|---|---|---|---|---|---|---|
| R-3900 | POST | /tasks | PERM | task.write | 创建任务 | body 必填 title/startAt/dueAt/assignees/supervisors; items 可选; service 校验 assignees ⊂ 同机构; **2026-07-08 加**: body.creator 可选 — 仅 `req.user.isPlatformAdmin=true` 接受(默认 = 机构管理员, 前端从 userOptions 筛), 普通员工 controller 强制 creator=self; **2026-07-08 修**: post-create detail() 必须传 req.user 作 actor, 不能用新 creator (否则 canViewTask 用新 creator 校验, 她可能没 task.read 权限 → 403) |
| R-3901 | GET | /tasks | PERM | task.read | 列表 (含可见性过滤) | query: myRole/status/type/priority/assignee/creator/supervisor/keyword/dueBefore/dueAfter/page/pageSize; 无 task.read 时只看我相关 |
| R-3902 | GET | /tasks/:id | PERM | task.read | 详情 (含 items/reviews/comments) | service.canViewTask 校验可见性,否则 403 |
| R-3903 | PATCH | /tasks/:id | PERM | task.write | 编辑任务 | 仅 creator / task.write 可改; 终态 (approved/cancelled/expired) 拒绝; status 只能走专用端点 |
| R-3904 | DELETE | /tasks/:id | PERM+PWD | task.delete | 物理删除任务 (工作流类, §8.1 弱化) | **2026-07-08 改**: 平台超管 OR 任务 creator 本人; 中间件 `requirePermission('task.delete') + requireBodyPassword` (前者挡权限位, 后者校验 body.password); 业务硬门挡 submitted/approved; 互锁 TaskItem/TaskReview/TaskComment |
| R-3905 | POST | /tasks/:id/submit | PERM | task.read | 执行人「提交完成」 | 校验自己所有条目 done; 写 Task.assignees[].status=submitted |
| R-3906 | POST | /tasks/:id/review | PERM | task.review | 监督人审批 | 必填 result (approved/rejected/requested_changes); 写 TaskReview 留痕 |
| R-3907 | POST | /tasks/:id/cancel | PERM | task.write | 取消任务 | 仅 creator / task.write; 可选 reason (作为评论留痕) |
| R-3908 | POST | /tasks/:id/items | PERM | task.write | 加 checklist 条目 | 校验 assignee ⊂ Task.assignees; 触发 recomputeTaskState |
| R-3909 | PATCH | /tasks/:id/items/:itemId | PERM | task.read | 勾/取消条目 | 条目 assignee 本人 / task.write; 可选重新分配; 触发 recomputeTaskState |
| R-3910 | POST | /tasks/:id/comments | PERM | task.read | 评论 | content 必填; mentions 解析后存 (通知中心用) |
| R-3911 | GET | /tasks/:id/removable-check | PERM | task.read | **删除预检** | DestructiveConfirm precheck; 返 `{canRemove, blockers}` |
| R-3912 | GET | /tasks/stats | PERM | task.read | 我的统计 (列表/详情页顶部用) | 返 mineTotal/mineDue/mineOverdue/mineSubmitted/mineReview |
| R-3913 | GET | /tasks/kanban | PERM | task.read | 看板 4 列分桶 | query: assignee/type/priority/scope=mine\|all; 返 {todo, inProgress, pendingReview, done} |
| R-3914 | POST | /tasks/templates | PERM | task.write | 创建周期模板 | 必填 title/defaultAssignees/defaultSupervisors/schedule.kind; nextRunAt 自动算 |
| R-3915 | GET | /tasks/templates | PERM | task.read | 模板列表 | query: isActive/page/pageSize |
| R-3916 | PATCH | /tasks/templates/:id | PERM | task.write | 编辑模板 | 改 schedule 重新算 nextRunAt |
| R-3917 | DELETE | /tasks/templates/:id | PERM | task.delete | 删除模板 | 已有 Task 不受影响 (Task.fromTemplate 软引用) |
| R-3918 | POST | /tasks/templates/:id/run-now | PERM | task.write | 立即跑一次 (测试用) | 写 TaskGenerationLog (status=success) |
| R-3919 | POST | /tasks/templates/:id/pause \| /resume | PERM | task.write | 暂停/恢复模板 | pause → nextRunAt=null; resume → 重算 nextRunAt |
| R-3920 | POST | /tasks/:id/archive | PERM | task.delete | 归档 (软隐藏) | 2026-07-08 立项; list/kanban/stats 默认隐藏, 写操作全部 422; 不需密码 |
| R-3921 | POST | /tasks/:id/unarchive | PERM | task.delete | 取消归档 | 同上; 反归档可逆, 幂等 |
| R-3922 | DELETE | /tasks/:id/items/:itemId | PERM | task.write | 删除 checklist 条目 | 2026-07-08 立项 (堵 R-3904 挡板无入口的洞); **2026-07-08 改**: 权限扩到「条目 assignee / 任务 creator / 平台超管 / task.write / task.delete」(解死锁: creator 想删任务必先能清空 checklist); 终态/归档态 422; 触发 recomputeTaskState |

**§39.1 归档 query 参数**（2026-07-08）:

- `?archived=true` 列表只看已归档; 默认隐藏
- `?includeArchived=true` 详情 bypass 403 (从归档 tab 跳详情用)

---


