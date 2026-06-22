# 数据模型 - 文件存储（File / Storage Driver）

> **何时读这个文件**：改文件上传、文件管理、Storage 驱动切换（local / s3）、引用追踪、删除预检、上传业务字段（avatar/logo/附件）时读。
> **一行摘要**：统一文件服务 — File model + StorageDriver 抽象（阶段 1 local / 阶段 2 s3）+ 引用追踪（refs[]）保证删前必查。

---

> **已落地（2026-06）**：见 `../packages/server/src/modules/storage/`、`../packages/server/src/models/File.model.js`、`shared/permissions.json`（storage 组）。阶段 1 走 local 驱动，MinIO 切入口预留。

---

## 目标

所有上传场景（头像 / 作品 / 课程附件 / 备课资料 / 机构 logo / 宠物头像 / 通用附件）走统一的 `/api/v1/storage/*` 端点，引用追踪、删除预检、文件管理 UI 一并提供。

## StorageDriver 抽象

`StorageDriver` 接口：

- `putObject(key, buffer, mimeType)`
- `removeObject(key)`
- `getPublicUrl(key)`

**驱动实现**：

- 阶段 1：`local`（本地磁盘 + express.static）
- 阶段 2：`s3`（MinIO / AWS S3 / 阿里云 OSS 都走 AWS SDK），业务代码零改动

## 多租户隔离

- **local 驱动**：共用一个 `uploads/` 根，每个文件 key 含 `scope/YYYY-MM/YYYYMMDD/uuid.ext`
- **阶段 2 MinIO**：单 bucket（`edustation`），按业务域 scope 划前缀
- **权限**：`File.org` 必填，跨 org 操作 403

## 引用追踪（核心机制）

**File 文档结构**：

- `refs: [{entity, entityId, field}]` — 谁在引用这个文件
- `refCount`（Number）— 当前引用数
- `isOrphan`（Boolean）— 是否无引用

**业务模块通过 `modules/storage/fileBind.js` 的工具维护引用**：

- `diffSingle(oldVal, newVal, entity, entityId, field)` — 单值字段（如 avatar）
- `diffArray(oldArr, newArr, entity, entityId, field)` — URL 数组（如 fileUrls）
- `diffArrayById(oldArr, newArr, entity, entityId, field)` — ObjectId 数组（如 attachments）

**删除预检**：直接看 `refCount`，refCount>0 → 422 + 详细 blockers。

## 上传策略

### 阶段 1（已落地）

- multipart `POST /storage/upload?scope=...`（单）或 `/storage/upload-many`（多）
- server 用 `multer.memoryStorage()` 收 buffer
- driver.putObject 落盘
- 写 File 文档

**安全限制**：

- 20MB 上限
- MIME 白名单：`image/*, video/*, audio/*, application/pdf`

### 阶段 2（待开发）

- 后端发预签名 PUT URL
- 客户端直传 MinIO
- `POST /storage/files/:id/confirm` 落 File 文档
- 业务侧逻辑与阶段 1 一致

## 模块位置

- 后端：`../packages/server/src/modules/storage/`（routes / controller / service / drivers / fileBind）
- API 文档：模块内 `api.desc.md`

## 管理后台

左侧菜单"系统管理 > 文件管理" → `/files`

- 列表 + 过滤 + 预览 + 删除
- 删除走 DestructiveConfirm + removable-check 预检
- 文件不涉及隐私，**不叠加超管密码门控**（与 `studentWork.delete` 区别）

## 业务字段扩展（已有引用 File 的字段）

| Model.field | 字段类型 | 维护方式 |
|---|---|---|
| `User.avatar` | String（跨租户） | diffSingle |
| `Org.logo` | String（按 org） | diffSingle |
| `Pet.avatar` | String（按 org） | diffSingle |
| `StudentWork.fileUrls` | [String] | diffArray |
| `CourseProduct.attachments` | [ObjectId<Ref:File>] | diffArrayById |
| `LessonSchedule.materials` | [ObjectId<Ref:File>] | diffArrayById |

> 新增引用 File 的字段时，沿用对应的 diff* 工具，保证引用计数正确。

## 权限码

`storage.read` / `storage.write`（在 `shared/permissions.json` 的 `storage` 组）

## 环境变量

```bash
# 阶段 1
STORAGE_DRIVER=local
UPLOAD_DIR=uploads             # local 驱动专用，默认 uploads/
UPLOAD_BASE_URL=/uploads       # local 驱动专用，默认 /uploads

# 阶段 2
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=edustation
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

## 安全

- 20MB 体积限制 + MIME 白名单强制
- 删除走"removable-check 预检 + 前端 DestructiveConfirm"
- `refs` 引用唯一索引 + 同 driver 内 key 唯一索引防重
