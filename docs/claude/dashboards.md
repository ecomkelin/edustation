# 经营看板 / 数据分析

> **何时读这个文件**：改仪表盘页面、新增/调整看板卡片、报表聚合管道、性能拐点后做 MetricSnapshot 物化时读。
> **一行摘要**：5 块经营看板（经营总览 / 课消与课表 / 教室与排课利用率 / 老师产能与绩效 / 积分与家长活跃），所有指标按 x-org-id 隔离。

---

## 模块位置

- 后端：`../packages/server/src/modules/report/`（聚合管道）
- 前端：`../packages/admin/src/views/Dashboard.vue`（ECharts 渲染）

## 看板清单

| # | 看板 | 接口 | 核心指标 |
|---|------|------|---------|
| 1 | **经营总览** | `GET /api/v1/reports/overview` | 今日/本月营收、待支付金额、新增/流失学员、在读数、活跃课包数、总剩余课时、待续费数、7 日内过期课包数、7 日出勤率 |
| 2 | **课消与课表** | `GET /api/v1/reports/lesson-consumption` | 本月已消/计划消、出勤率/请假率/未到率、各开班消课进度、课评均分 Top / 低分名单、老师产能 Top 10 |
| 3 | **教室与排课利用率** | `GET /api/v1/reports/room-utilization` | 教室周占用率/空置率、每日峰值时段（小时热力）、排课冲突告警、开班满班率分布 |
| 4 | **老师产能与绩效** | `GET /api/v1/reports/teacher-productivity` | 人均周/月课时、班级数、学生数、课时密度、课评均分、消课完成率 |
| 5 | **积分与家长活跃** | `GET /api/v1/reports/points-activity` | 积分发放/消耗/余额（按 type 维度饼图）、活跃家长数（近 7/30 天）、宠物等级分布 |

> 所有接口挂 `requirePermission('<对应模块>.read')` 门控（看板归口到 `student.read` / `order.read` 等已有权限码，不新增权限码）；按 `req.org._id` 强制隔离。

## 招生看板（2026-06 新增）

挂在 `recruit` 组，不复用 `report.read`。

- `GET /api/v1/reports/recruit-promoter` — 推广人员 ROI（按 Parent.promoteBy 聚合：家长数/孩子数/转化数/转化率）
- `GET /api/v1/reports/recruit-teacher-conversion` — 试听老师转化率（按 TrialBooking.teacher 聚合：试听过/到店/完成/已报名/转化率）

阶段 2 再做：

- `recruit-parent-lifecycle`（家长生命周期分布）
- `recruit-source-roi`（渠道 ROI）

详见 [data-models-recruit.md](./data-models-recruit.md) §招生看板。

## 时间维度

- 入参 `?range=today|week|month|custom&from=&to=`（默认 `month`）
- 内部统一以 `req.org._id` 业务日为窗口
- 暂不引入 `MetricSnapshot` 物化层，所有指标实时聚合；T+1 物化层待性能压力出现后再加

## 已知 bug

- 早期 Report 聚合管道用了不存在的 `$amount` 字段（应为 `$paidAmount`），pending 同根
- 修复后必须确保 cache key 包含 `orgId` 桶前缀（否则 invalidate 永远清不到）
- 详见 [memory: report-aggregation-yuan-bug] / [memory: report-cache-key-bucket-bug]

## 待开发（需数据切片）

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

**立项目的优先级建议**：

1. 招生漏斗（`Order.source` + `Lead`）→ 解锁市场看板
2. `RefundRecord` → 解锁财务看板
3. `TeacherSalary` → 解锁利润看板
4. `MetricSnapshot` 物化层 → 性能拐点后必做
