# Storage 模块 · API 文档

> 统一文件管理：`/api/v1/storage/*`
>
> **设计目标**：所有上传场景（头像、作品、课程附件、备课资料、机构 logo、宠物头像、通用附件）走同一套上传/删除/引用追踪。
>
> **阶段 1**：local 驱动（落本地磁盘 + express.static 暴露）。  
> **阶段 2**：s3 驱动（MinIO，driver 替换，业务代码零改动）。

## 权限码

- `storage.read`：查看文件列表 / 详情 / 下载
- `storage.write`：上传 / 绑定 / 解绑 / 删除

> 删除走 `GET /files/:id/removable-check` 预检 + 前端 `<DestructiveConfirm>` 弹挡板；不叠加超管密码（与 `studentWork.delete` 区别：文件不含隐私）。

## 端点

### 1. 上传（单文件）

`POST /api/v1/storage/upload?scope=avatar`

- Headers: `Authorization: Bearer <access>`、`x-org-id: <id>`
- Body: `multipart/form-data`，字段名 `file`
- Query: `scope` 必填（`avatar | work | lessonMaterial | courseAttachment | pet | org | general`）
- 限制: 20MB；MIME 白名单（image/*, video/*, audio/*, application/pdf）

返回 `201`：

```json
{
  "success": true,
  "code": 201,
  "data": {
    "id": "65f...",
    "url": "/uploads/avatar/2026-06/20260613/abc.jpg",
    "scope": "avatar",
    "mime": "image/jpeg",
    "size": 12345,
    "dedup": false
  }
}
```

> `dedup: true` 表示后端检测到同 org + 同 sha256 已存在，复用旧文件，**不会**重复落盘。

### 2. 上传（多文件）

`POST /api/v1/storage/upload-many?scope=work`

- Body: `multipart/form-data`，字段名 `files`（最多 20）

返回 `201`：

```json
{
  "success": true,
  "data": { "items": [{ "id": "...", "url": "...", ... }, ...] }
}
```

### 3. 列表

`GET /api/v1/storage/files?scope=work&originalName=水墨&isOrphan=false&from=2026-06-01&to=2026-06-30&page=1&pageSize=20`

| 参数 | 类型 | 说明 |
|---|---|---|
| `scope` | String | 过滤 scope |
| `originalName` | String | 文件名模糊 |
| `uploader` | ObjectId | 上传者 ID |
| `isOrphan` | Boolean | 仅看孤儿（未被引用的） |
| `from` / `to` | ISO Date | 时间范围 |
| `page` / `pageSize` | Number | 分页 |

返回：`{ items: [...], total, page, pageSize }`。`items[].refs` 已带 `label`（如 "学生作品"）。

### 4. 详情

`GET /api/v1/storage/files/:id`

返回单文件详情，含 `refs: [{entity, entityId, field, label, boundAt}]`。

### 5. 显式 bind

`POST /api/v1/storage/files/:id/bind`

Body：

```json
{ "refs": [{ "entity": "StudentWork", "entityId": "...", "field": "fileUrls" }] }
```

幂等：重复 bind 同一 `(entity, entityId, field)` 不重复计数。

> 业务模块通常**不直接调**本端点；上传后业务侧 update 接口内部调 `fileBind.bindUrls()` 自动处理。

### 6. 显式 unbind

`POST /api/v1/storage/files/:id/unbind`，Body 同上。空 refs 后 `isOrphan=true`。

### 7. 预检删除

`GET /api/v1/storage/files/:id/removable-check`

返回：

```json
{
  "success": true,
  "data": {
    "canRemove": false,
    "blockers": [
      { "entity": "StudentWork", "label": "学生作品", "count": 2,
        "hint": "请先解除该文件在「学生作品.fileUrls」上的引用（2 处）后再删" }
    ]
  }
}
```

### 8. 删除

`DELETE /api/v1/storage/files/:id`

- `canRemove=true` → 200，物理删除文件 + 文档
- `canRemove=false` → 422 + `data.blockers`

## 业务接入示例

### 上传头像

```js
// 前端
const fd = new FormData()
fd.append('file', blob)
const { data } = await http.post('/storage/upload?scope=avatar', fd, {
  headers: { 'Content-Type': 'multipart/form-data' }
})
form.avatar = data.url
await http.put(`/users/${userId}`, { avatar: data.url })
// 后端 user.service.update 内部调 fileBind.diffSingle 自动追踪引用
```

### 上传作品

```js
// 前端：先调 storage 拿 fileIds，再调 studentWorks
const fd = new FormData()
for (const f of files) fd.append('files', f)
const { data: up } = await http.post('/storage/upload-many?scope=work', fd, {...})
await http.post('/student-works', {
  lessonAttendance, title,
  fileIds: up.items.map(i => i.id),
  fileUrls: up.items.map(i => i.url)  // 后端再 bind
})
```

## 阶段 2 切 MinIO

`config.storage.driver = 's3'`，新增 `s3.driver.js` 实现同一接口（`@aws-sdk/client-s3`）。  
File 模型、`fileBind` 逻辑、API 契约、前端 UI **全部不动**。
