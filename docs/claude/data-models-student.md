# 数据模型 - Student

> **何时读这个文件**：改学生 schema、家长-学生交互、监护人查询、家长切换孩子时读。
> **一行摘要**：Student 是机构内学员档案，关联到家长 User（guardianUser），所有家长操作都通过 User 上下文代理。

---

## Student（学员）

**核心字段**：

- `org`（Org ref）
- `name`
- `gender`
- `birthday`
- `guardianUser`（User ref — 主监护人；目前是单值，未来可扩 `guardians[]`）
- `notes`
- `meta`（Mixed — 扩展属性）

## 家长-子女交互设计（重要）

- 家长登录后始终在顶部显示当前活跃子女（单子女**不跳过选择步骤**，保持 UI 统一）。
- 单子女时显示"当前孩子：xx"，但无切换列表；多子女时可切换。
- 所有学生接口在请求头中传递 `x-active-student-id`。
- 切换 active student 时，前端 store 更新并 localStorage 持久化。

## 跨模块查询家长沟通画像（2026-06-16）

业务侧入口（学生管理页）需要查"该学员主监护人最近联系过谁、何时"：

- 路径：`Student.guardians[0]` → `User.mobile` → `Parent` → `UserOrgRel`（三态语义：未登记/已登记无联系/已联系）
- list 批量查用三步聚合，避免 N+1
- 详见 [memory: parent-profile-cross-module-lookup]

## 转化来源（Parent.user → Student）

招生转化（`trialBooking.service.convert`）时：

1. 首孩转化：`Parent.user` 从 null 回填到新建的 User
2. `Student.create` 从 `ChildLead` 拷贝 name/gender/school/grade/className
3. 次孩转化：复用已有 User（同 mobile），新建独立 Student

## 学生与课包 / 排课的关联

- `Order.student` / `StudentProduct.student`：一对一购课关系
- `CourseEnrollment.student`：报名关系
- `LessonAttendance.student` / `LessonWork.student`：考勤/作品
- 所有 N 关系按 `x-active-student-id` 隔离（家长只能看到当前 active child 的数据）

## 后续字段扩展建议

> 见 CLAUDE.md §16.3 "待开发" 表：
> - `Student.source`（来源渠道）+ `firstOrderAt`（首次下单时间） → 解锁新老家长比、获客成本归因
