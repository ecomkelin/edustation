'use strict'

const { body, param, query } = require('express-validator')
const {
  ACCESS_DEVICE_VENDORS,
  ACCESS_EVENT_TYPES,
  ACCESS_DIRECTIONS,
  ACCESS_RESULTS,
  FACE_PROFILE_SUBJECT_TYPES,
  PICKUP_PERSON_TYPES,
  DOOR_STATE_MODES
} = require('@shared/enums')

/* ─── 通用 ─────────────────────────────────────────── */
exports.idParam = [param('id').isMongoId().withMessage('id 需为合法 ObjectId')]

exports.deviceSnParam = [
  param('deviceSn').isString().trim().isLength({ min: 1, max: 100 }).withMessage('deviceSn 必填')
]

/* ─── 设备 (AccessDevice) ─────────────────────────── */
exports.createDevice = [
  body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('name 1-100 字'),
  body('vendor').optional().isIn(ACCESS_DEVICE_VENDORS).withMessage('vendor 非法'),
  body('vendorModel').optional().isString().isLength({ max: 100 }),
  body('deviceSn').isString().trim().isLength({ min: 1, max: 100 }).withMessage('deviceSn 1-100 字'),
  body('ipAddress').optional({ values: 'falsy' }).isString().isLength({ max: 64 }),
  body('macAddress').optional({ values: 'falsy' }).isString().isLength({ max: 64 }),
  body('firmwareVersion').optional({ values: 'falsy' }).isString().isLength({ max: 64 }),
  body('location').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('webhookSigningKey')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('webhookSigningKey 8-128 字符'),
  body('capabilities').optional().isArray(),
  body('capabilities.*').optional().isString()
]

exports.updateDevice = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('vendor').optional().isIn(ACCESS_DEVICE_VENDORS),
  body('vendorModel').optional().isString().isLength({ max: 100 }),
  body('ipAddress').optional({ values: 'falsy' }).isString().isLength({ max: 64 }),
  body('macAddress').optional({ values: 'falsy' }).isString().isLength({ max: 64 }),
  body('firmwareVersion').optional({ values: 'falsy' }).isString().isLength({ max: 64 }),
  body('location').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('capabilities').optional().isArray(),
  body('isActive').optional().isBoolean()
]

exports.regenerateSecret = [
  body('newSigningKey')
    .optional()
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('newSigningKey 8-128 字符, 不传则自动生成')
]

exports.setDoorState = [
  body('mode').isIn(DOOR_STATE_MODES).withMessage('mode 非法'),
  body('reason').optional({ values: 'falsy' }).isString().isLength({ max: 200 })
]

exports.listDevices = [
  query('keyword').optional().isString().isLength({ max: 100 }),
  query('isActive').optional().isBoolean(),
  query('vendor').optional().isIn(ACCESS_DEVICE_VENDORS),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 })
]

/* ─── 人脸档案 (FaceProfile) ──────────────────────── */
exports.enrollFaceProfile = [
  body('subjectType').isIn(FACE_PROFILE_SUBJECT_TYPES).withMessage('subjectType 非法'),
  body('subjectId').isMongoId().withMessage('subjectId 需为合法 id'),
  body('consentRecordId').isMongoId().withMessage('consentRecordId 必填 (需先签电子同意书)'),
  body('enrollmentQuality').optional().isFloat({ min: 0, max: 1 }),
  // multipart: 'photo' 文件; validator 跳到 controller 验 (multer 已收)
  body('deviceIds').optional().isArray(),
  body('deviceIds.*').optional().isMongoId()
]

exports.revokeFaceProfile = [
  body('revokeReason').optional({ values: 'falsy' }).isString().isLength({ max: 200 })
]

exports.listFaceProfiles = [
  query('subjectType').optional().isIn(FACE_PROFILE_SUBJECT_TYPES),
  query('studentId').optional().isMongoId(),
  query('userId').optional().isMongoId(),
  query('isActive').optional().isBoolean().customSanitizer((v) => v === true || v === 'true'),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 })
]

/* ─── 进出流水 (AccessEvent) ───────────────────────── */
exports.listAccessEvents = [
  query('device').optional().isMongoId(),
  query('subjectType').optional({ values: 'falsy' }).isIn(FACE_PROFILE_SUBJECT_TYPES),
  query('subject').optional().isMongoId(),
  query('eventType').optional().isIn(ACCESS_EVENT_TYPES),
  query('direction').optional().isIn(ACCESS_DIRECTIONS),
  query('result').optional().isIn(ACCESS_RESULTS),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 200 })
]

/* ─── 接送授权 (AuthorizedPickup) ─────────────────── */
exports.createPickup = [
  body('student').isMongoId().withMessage('student 必填'),
  body('pickupPersonType').isIn(PICKUP_PERSON_TYPES).withMessage('pickupPersonType 非法'),
  body('pickupUser').optional({ values: 'falsy' }).isMongoId().withMessage('pickupUser 需为合法 id'),
  body('pickupName').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('pickupPhone')
    .optional({ values: 'falsy' })
    .matches(/^1[3-9]\d{9}$/)
    .withMessage('pickupPhone 需为 11 位手机号'),
  body('pickupIdCardLast4')
    .optional({ values: 'falsy' })
    .matches(/^\d{4}$/)
    .withMessage('pickupIdCardLast4 需为 4 位数字'),
  body('relationship').optional({ values: 'falsy' }).isString().isLength({ max: 20 }),
  body('faceProfile').optional({ values: 'falsy' }).isMongoId(),
  body('validFrom').isISO8601().withMessage('validFrom 需为 ISO 日期'),
  body('validUntil').isISO8601().withMessage('validUntil 需为 ISO 日期')
]

exports.updatePickup = [
  body('pickupName').optional().isString().isLength({ max: 50 }),
  body('pickupPhone').optional({ values: 'falsy' }).matches(/^1[3-9]\d{9}$/),
  body('pickupIdCardLast4').optional({ values: 'falsy' }).matches(/^\d{4}$/),
  body('relationship').optional().isString().isLength({ max: 20 }),
  body('faceProfile').optional({ values: 'falsy' }).isMongoId(),
  body('validFrom').optional().isISO8601(),
  body('validUntil').optional().isISO8601()
]

exports.revokePickup = [
  body('revokeReason').optional({ values: 'falsy' }).isString().isLength({ max: 200 })
]

exports.listPickups = [
  query('student').optional().isMongoId(),
  query('pickupUser').optional().isMongoId(),
  query('isActive').optional().isBoolean().customSanitizer((v) => v === true || v === 'true'),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 })
]

/* ─── 同意书 (UserConsent 复用) ───────────────────── */
exports.signConsent = [
  body('docKey')
    .isIn(['face-consent-student', 'face-consent-pickup', 'face-consent-staff'])
    .withMessage('docKey 必须是 face-consent-*'),
  body('subjectType').isIn(['student', 'authorized_pickup', 'staff']).withMessage('subjectType 非法'),
  body('subject').isMongoId().withMessage('subject 必填 (协议约束的对象)'),
  body('version').optional({ values: 'falsy' }).isString().isLength({ max: 20 }),
  body('agreed').isBoolean().custom((v) => v === true).withMessage('agreed 必须为 true')
]

exports.withdrawConsent = [
  body('reason').optional({ values: 'falsy' }).isString().isLength({ max: 200 })
]

/* ─── Client 端 ────────────────────────────────────── */
// enroll-my-child: 由 activeStudent + guardians 校验替代 body 字段
exports.clientEnrollMyChild = [
  body('consentRecordId').isMongoId().withMessage('consentRecordId 必填 (需先签电子同意书)'),
  body('enrollmentQuality').optional().isFloat({ min: 0, max: 1 })
]

exports.clientEnrollSelf = [
  body('consentRecordId').isMongoId().withMessage('consentRecordId 必填 (需先签电子同意书)'),
  body('enrollmentQuality').optional().isFloat({ min: 0, max: 1 })
]

exports.clientCreatePickup = [
  body('pickupPersonType').isIn(PICKUP_PERSON_TYPES).withMessage('pickupPersonType 非法'),
  body('pickupUser').optional({ values: 'falsy' }).isMongoId(),
  body('pickupName').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('pickupPhone').optional({ values: 'falsy' }).matches(/^1[3-9]\d{9}$/),
  body('pickupIdCardLast4').optional({ values: 'falsy' }).matches(/^\d{4}$/),
  body('relationship').optional({ values: 'falsy' }).isString().isLength({ max: 20 }),
  body('faceProfile').optional({ values: 'falsy' }).isMongoId(),
  body('validFrom').isISO8601(),
  body('validUntil').isISO8601()
]
