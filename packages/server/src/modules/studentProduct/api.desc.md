# StudentProduct 模块 API 文档

> 基础路径：`/api/v1/student-products`
>
> 学生持有的课程产品管理。`StudentProduct` 是学生持有某个 `CourseProduct` 的实例。
>
> 两条创建路径：
>  1. **订单支付**：`Order.pay` 自动按 items 逐项创建（`source='order'`）
>  2. **员工赠课**：`POST /student-products/gift` 直接创建（`source='gift'`；需 `studentProduct.gift` 权限）
>
> 赠课产生的 StudentProduct 在管理后台/家长端**标红**展示，并显示 `giftReason` 让家长知悉来源。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `studentProduct.read` —— 查看学生持有的产品（含赠课记录）
  - `studentProduct.gift` —— 员工赠课（独立于 `order.write`）
- 源类型（`STUDENT_PRODUCT_SOURCES`）：`order`（订单付款）/ `gift`（员工赠课）。

---

## 1. 学生持有的产品

- **Method / Path**：`GET /api/v1/student-products`
- **权限**：`studentProduct.read`
- **查询参数**：

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| student | String (ObjectId) | 否 | 学生 ID（不传则查本机构全部） |
| isActive | Boolean | 否 | 仅显示启用中的产品（默认 true） |
| source | String | 否 | 按来源过滤：`order` / `gift` |
| page | Number | 否 | 默认 1 |
| pageSize | Number | 否 | 默认 20，上限 200 |

- **成功响应** (`200 OK`)：`{ data: { items: StudentProduct[], total, page, pageSize } }`。

`StudentProduct` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | StudentProduct._id |
| student | Object | 学生（populate） |
| source | String | `order` / `gift` |
| order | Object\|null | 来源订单（populate；`source='gift'` 时为 null） |
| courseProduct | Object | 课程产品（populate） |
| totalLessons | Number | 总课时 |
| remainingLessons | Number | 剩余课时 |
| expireDate | Date\|null | 过期时间 |
| isActive | Boolean | 是否启用（耗尽/过期自动 false） |
| giftReason | String\|null | 赠课原因（仅 `source='gift'`） |
| giftedBy | Object\|null | 赠课员工（populate；仅 `source='gift'`） |
| giftedAt | Date\|null | 赠课时间（仅 `source='gift'`） |
| createdAt / updatedAt | Date | 时间戳 |

---

## 2. 产品详情

- **Method / Path**：`GET /api/v1/student-products/:id`
- **权限**：`studentProduct.read`
- **成功响应** (`200 OK`)：单个 StudentProduct 对象。

---

## 3. 剩余课时

- **Method / Path**：`GET /api/v1/student-products/:id/remaining`
- **权限**：`studentProduct.read`
- **说明**：轻量接口，仅返回剩余课时相关字段，供客户端顶部"剩余 X 课时"展示频繁轮询。
- **成功响应** (`200 OK`)：

```json
{
  "data": {
    "id": "...",
    "remainingLessons": 7,
    "totalLessons": 16,
    "isActive": true,
    "expireDate": "2027-06-08T...",
    "source": "order",
    "giftReason": null
  }
}
```

---

## 4. 赠课（员工直接创建 StudentProduct）

- **Method / Path**：`POST /api/v1/student-products/gift`
- **权限**：`studentProduct.gift`（独立权限，无此权限者无法赠课）
- **说明**：员工绕过订单支付直接为学生创建课包。**`giftReason` 必填**，写明赠课原因（试听课奖励 / 投诉补偿 / 老学员维护 / 内部测试 等）。
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| student | String (ObjectId) | 是 | 学生 ID |
| courseProduct | String (ObjectId) | 是 | 课程产品 ID |
| giftReason | String | 是 | 赠课原因，1-500 字 |
| totalLessons | Number | 否 | 总课时（不传时 = `CourseProduct.totalLessons`） |
| expireDate | Date | 否 | 过期时间（不传时 = now + `CourseProduct.validDays` 天） |

- **副作用**：
  - 写入 `source='gift'`，`order=null`，`giftedBy=当前用户`，`giftedAt=now`
  - 该记录在 UI 上**标红**展示，并在家长端显示 `giftReason`
- **约束**：
  - 学生必须属于本机构
  - 课程产品必须属于本机构且 `isActive=true`
  - `giftReason` 必须非空
- **成功响应** (`201 Created`)：返回新建的 StudentProduct。

---

## 副作用说明

- `LessonAttendance.complete`（消课）会**事务性扣减** `remainingLessons`，到 0 时 `isActive=false`。
- `expireDate < now` 时，`isActive` 也会被自动置为 `false`（按需由后台任务或读路径计算）。
- **选包规则**（FIFO）：见 CLAUDE.md 7.4 节。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 缺少 `student` 参数 / `giftReason` 空 / 课包下架 |
| 401 | 未登录 |
| 403 | 权限不足（无 `studentProduct.gift` 权限时赠课被拒） |
| 404 | StudentProduct 不存在 |
