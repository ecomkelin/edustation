# CourseProduct 模块 API 文档

> 基础路径：`/api/v1/course-products`
>
> 课程产品管理。`CourseProduct` 合并了原 `CourseTemplate`（教学大纲）和 `CoursePackage`（售卖规格）：
> 一个产品既定义了"课的内容"（名称、学科、总课时、教学大纲），也定义了"课的售卖规则"（价格、有效期）。
> 下游：`CourseInstance`（开班）以本产品为蓝本；`StudentProduct`（学生课包）购买的是本产品。

---

## 通用约定

- 请求头：`Authorization: Bearer <access>`、`x-org-id`。
- 权限码：
  - `courseProduct.read`
  - `courseProduct.write`

---

## 1. 课程产品列表

- **Method / Path**：`GET /api/v1/course-products`
- **权限**：`courseProduct.read`
- **查询参数**：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| subject | String (ObjectId) | 按学科过滤（匹配 `subjects` 数组中包含该 id 的产品） |
| isActive | Boolean | 上下架状态 |
| keyword | String | 按 `name` 模糊匹配 |
| page | Number | 默认 1 |
| pageSize | Number | 默认 20 |

- **成功响应** (`200 OK`)：`{ data: { items: CourseProduct[], total, page, pageSize } }`。

`CourseProduct` 元素结构：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String | CourseProduct._id |
| subjects | Object[] | 关联学科列表（populate）——**建议性**字段，可空可多 |
| name | String | 产品名 |
| totalLessons | Number | 总课时 |
| minutesPerLesson | Number | 单节课时长（分钟），默认 90 |
| price | Number | 售价（元） |
| validDays | Number | 有效天数 |
| syllabus | String | 教学大纲 |
| isActive | Boolean | 是否在售 |
| meta | Object | 扩展属性 |

---

## 2. 课程产品详情

- **Method / Path**：`GET /api/v1/course-products/:id`
- **权限**：`courseProduct.read`
- **成功响应** (`200 OK`)：单个 CourseProduct 对象。

---

## 3. 创建课程产品

- **Method / Path**：`POST /api/v1/course-products`
- **权限**：`courseProduct.write`
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| subjects | String[] / String | 否 | 关联学科（数组，建议性）；可传单个 id 兼容旧版。**全部 id 必须属于本机构** |
| name | String | 是 | 产品名，<= 100 字符 |
| totalLessons | Number | 是 | 总课时，> 0 |
| minutesPerLesson | Number | 否 | 单节课时长（分钟），> 0；不传则默认 90 |
| price | Number | 是 | 售价，>= 0 |
| validDays | Number | 是 | 有效天数，>= 1 |
| syllabus | String | 否 | 教学大纲，<= 2000 字符 |
| isActive | Boolean | 否 | 默认 true |
| meta | Object | 否 | 扩展属性 |

- **成功响应** (`201 Created`)：返回创建的 CourseProduct。

---

## 4. 更新课程产品

- **Method / Path**：`PUT /api/v1/course-products/:id`
- **权限**：`courseProduct.write`
- **请求体**：所有字段均可选。
- **成功响应** (`200 OK`)：返回更新后的 CourseProduct。

---

## 5. 删除课程产品

- **Method / Path**：`DELETE /api/v1/course-products/:id`
- **权限**：`courseProduct.write`
- **约束**：当存在 `CourseInstance` 或已支付 `Order` 时拒绝删除，返回 `400`。
- **成功响应** (`200 OK`)：`{ success: true }`。

---

## 错误码

| 状态码 | 场景 |
| ------ | ---- |
| 400 | 存在下级引用 / 参数校验失败 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 课程产品不存在 |
