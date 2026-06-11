# Pet 模块 API 文档（Stub）

> 基础路径：`/api/v1/pets`
>
> 宠物（积分养成）模块。家长登录后**始终操作当前激活子女**的宠物。
> 当前模块为 **Stub 实现**（仅占位路由），完整养成、换装、互动等能力将在阶段 2/3 扩展。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`、**`x-active-student-id`**。
- 中间件链：`mws.authenticate` → `mws.requireOrg` → `mws.activeStudent`（从 `x-active-student-id` 或默认值解析当前学生）。
- 不需 `student.read`，家长端无需任何业务权限码即可调用。

---

## 1. 当前孩子的宠物

- **Method / Path**：`GET /api/v1/pets/me`
- **权限**：authenticated（家长）
- **说明**：返回当前激活子女的宠物；若不存在则返回 `data: null`，客户端可引导"领养宠物"。
- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "id": "...",
    "student": "...",
    "petType": "cat",
    "level": 3,
    "experience": 240,
    "nickname": "小白",
    "updatedAt": "..."
  }
}
```

> **Stub 状态**：当前 `pet.controller.me` 可能直接返回 `null` 或固定占位对象。

---

## 2. 喂养宠物（Stub）

- **Method / Path**：`POST /api/v1/pets/feed`
- **权限**：authenticated
- **说明**：消耗积分（`-10`）为宠物增加经验。完整版本将根据 `petType` 与等级计算经验曲线。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| foodType | String | 否 | 食物类型（普通/高级/特级），默认 `normal` |

- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "pet": { "id": "...", "level": 3, "experience": 250 },
    "cost": 10
  }
}
```

> **Stub 状态**：当前接口为占位，不会真正扣减积分或写入经验。

---

## 数据模型（参考）

`Pet` 模型：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| student | ObjectId | 所属学生（一个学生一只宠物） |
| petType | String | 宠物类型枚举（`cat` / `dog` / `rabbit` / ...） |
| level | Number | 等级，从 1 起 |
| experience | Number | 当前经验值；达阈值升级 |
| nickname | String | 昵称 |
| meta | Object | 扩展属性（皮肤/装备等） |

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 缺少 `x-active-student-id` 且无默认孩子 |
| 401 | 未登录 |
| 404 | 学生/宠物不存在 |
