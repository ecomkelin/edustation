'use strict'

const { Schema, model } = require('mongoose')

/**
 * 统一文件（File）
 *
 * 全系统所有上传产物的唯一登记：用户头像、学生作品、课程附件、备课资料、
 * 机构 logo、宠物头像、通用附件……统一落在这里。
 *
 * 关系约定：
 *  - 每个 File 都有 `org`：平台超管上传的素材 `org` 为 null（极少场景，留口子）
 *  - `scope` 是粗粒度分类（枚举），用来在文件管理页分组、决定 UI 缩略图策略
 *  - 业务实体通过 `refs: [{entity, entityId, field}]` 反向引用 File
 *  - `refCount = refs.length`，删除预检时直接看它
 *  - `isOrphan = (refCount === 0)`，由 fileBind.js 在 unbind 时自动置 true
 *
 * 阶段 1 切 MinIO 时：driver 从 'local' 换 's3'，File 模型字段不变；
 *   `key` 变成 S3 object key，`url` 变成 presigned GET URL（或 CDN 公开 URL）。
 *
 * 安全：
 *  - `url` 不一定可直链（私有桶会签 7 天）；前端展示前应再调一次 /files/:id 拿最新 URL
 *  - 跨租户隔离：所有 service 都校验 file.org === req.orgId
 *  - mime 白名单在 storage.validator 里强制
 */

const REF_ENTITY = {
  USER: 'User',
  STUDENT_WORK: 'StudentWork',
  PET: 'Pet',
  ORG: 'Org',
  ORG_PROMOTION: 'OrgPromotion',
  COURSE_PRODUCT: 'CourseProduct',
  LESSON_SCHEDULE: 'LessonSchedule',
  SUBJECT: 'Subject',
  COURSE_INSTANCE: 'CourseInstance',
  // 2026-06-21 pet-system-v2-ext: 宠物图鉴三表的 imageFile 字段
  PET_SPECIES: 'PetSpecies',
  PET_ITEM: 'PetItem',
  PET_CONSUMABLE: 'PetConsumable'
}

const SCOPE = {
  AVATAR: 'avatar',
  WORK: 'work',
  LESSON_MATERIAL: 'lessonMaterial',
  COURSE_ATTACHMENT: 'courseAttachment',
  PET: 'pet',
  ORG: 'org',
  GENERAL: 'general',
  // 教学体系新增 scope：
  // - subjectSyllabus:           Subject 上的"宣传海报 / 宣传视频"（替代旧 posterUrl/videoUrl）
  // - subjectLessonMaterial:     Subject 上的"每堂课课件"
  // - courseInstanceLessonMaterial: CourseInstance 上快照的 + 特例补充的课件
  SUBJECT_SYLLABUS: 'subjectSyllabus',
  SUBJECT_LESSON_MATERIAL: 'subjectLessonMaterial',
  COURSE_INSTANCE_LESSON_MATERIAL: 'courseInstanceLessonMaterial',
  // 人脸识别门禁 (2026-06 立项)：
  // - faceAccessEnrollment:      录入人脸时的清晰照（保留 30 天作审计）
  // - faceAccessSnapshot:        进出抓拍图 — 授权人识别通过
  // - faceAccessStrangerSnapshot:进出抓拍图 — 陌生人（独立保留策略）
  // 强约束: 上述 3 个 scope 必须走 local driver 存储（人脸照片不得上公有云）
  FACE_ACCESS_ENROLLMENT: 'faceAccessEnrollment',
  FACE_ACCESS_SNAPSHOT: 'faceAccessSnapshot',
  FACE_ACCESS_STRANGER_SNAPSHOT: 'faceAccessStrangerSnapshot'
}

const FileSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    // 平台超管上传的素材（极少）可为 null；普通员工上传必填
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null, index: true },
    // 业务域（决定 UI 分组 + 缩略图策略）
    scope: {
      type: String,
      enum: Object.values(SCOPE),
      required: true,
      index: true
    },
    // 上传者（操作员）。审计用。
    uploader: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // ─── 驱动层抽象 ─────────────────────────────────────────
    driver: { type: String, enum: ['local', 's3'], default: 'local' },
    // 驱动内部寻址（local: 相对路径；s3: bucket key）
    key: { type: String, required: true },
    // 访问 URL（local: /uploads/...；s3: presigned GET 或 CDN 公开）
    url: { type: String, required: true },

    // ─── 元数据 ──────────────────────────────────────────────
    originalName: { type: String, trim: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    // sha256 hex（可选；阶段 1 由 service 计算后写入，便于去重 / 校验完整性）
    sha256: { type: String, default: null },

    // ─── 引用追踪 ────────────────────────────────────────────
    refs: [
      {
        // 业务实体名（如 'User' / 'StudentWork' / 'Pet' / 'Org' / 'CourseProduct' / 'LessonSchedule'）
        entity: { type: String, required: true },
        // 业务实体主键
        entityId: { type: Schema.Types.ObjectId, required: true, index: true },
        // 业务实体上的字段名（'avatar' | 'logo' | 'fileUrls' | 'attachments' | 'materials'）
        field: { type: String, required: true },
        // 绑定时间
        boundAt: { type: Date, default: Date.now }
      }
    ],
    // 冗余：refs 长度（避免每个删除预检都 aggregate）
    refCount: { type: Number, default: 0, min: 0 },
    // 无人引用的"孤儿"文件（用于"清理无用文件"批量任务）
    isOrphan: { type: Boolean, default: false, index: true },

    // 软删除标记（保留 30 天可恢复；物理删除走 service.remove）
    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true, collection: 'files' }
)

// 同 driver 内 key 唯一（防止上传时 key 冲突）
FileSchema.index({ driver: 1, key: 1 }, { unique: true })
// 业务模块按 org + scope 查文件列表
FileSchema.index({ org: 1, scope: 1, createdAt: -1 })
// 业务模块按 org + uploader 查"我上传的"
FileSchema.index({ org: 1, uploader: 1, createdAt: -1 })
// 找所有孤儿（清理任务）
FileSchema.index({ org: 1, isOrphan: 1, createdAt: -1 })
// 业务模块反向查"被哪些实体引用了"
FileSchema.index({ 'refs.entity': 1, 'refs.entityId': 1 })

module.exports = {
  File: model('File', FileSchema),
  FILE_SCOPE: SCOPE,
  REF_ENTITY
}
