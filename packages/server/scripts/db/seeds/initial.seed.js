'use strict'

/**
 * 一站式初始化种子（initial.seed.js）
 *
 * 由 `pnpm db:seeds` 触发（见 scripts/db/init-seeds.js）。本文件自包含
 * 机构 / 用户 / 岗位 / 用户-机构关系 / 学员 / 类别 / 地区 / 学科 / 教室 /
 * 课程产品 的全部初始化数据，按依赖顺序写入并确保唯一性。
 *
 * 执行策略：清空受影响集合后整体灌入。重复执行结果一致。
 *
 * 依赖业务对象与本次初始化重点机构（unicode 91510725MAEKMMYW9W）：
 *  - 梓潼县人工智网科技培训学校有限公司（简称：梓潼人工智网，类别：科技）
 *  - 负责本次种子的多数业务数据（学科 / 学员 / 教室 / 课包 / 员工与家长关系）。
 *  另外两家机构仅作占位：
 *  - 91510725MAEKMMYW3A 绵阳人工智网（科技）
 *  - 91510725MAEKMMY56U 梓潼县童画大王（艺术）
 *
 * 注意：手机号密码按用户原始要求分别为 Admin@123 / User@123 / Client@123。
 */

const argon2 = require('argon2')
const { CLIENT_LEVEL } = require('@shared/enums')

const Org = require('@models/Org.model')
const User = require('@models/User.model')
const Position = require('@models/Position.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Student = require('@models/Student.model')
const Category = require('@models/Category.model')
const Region = require('@models/Region.model')
const Subject = require('@models/Subject.model')
const Room = require('@models/Room.model')
const CourseProduct = require('@models/CourseProduct.model')
const Order = require('@models/Order.model')
const StudentProduct = require('@models/StudentProduct.model')
const CourseInstance = require('@models/CourseInstance.model')

// ─────────────────────────────────────────────────────────────
// 静态数据
// ─────────────────────────────────────────────────────────────

// 1. 机构
const ORGS = [
  {
    unicode: '91510725MAEKMMYW9W',
    name: '梓潼县人工智网科技培训学校有限公司',
    nameAbbreviation: '梓潼人工智网',
    typeName: '科技',
    contactPerson: '张宇佳',
    contactPhone: '13800000001',
    address: '四川省绵阳市梓潼县',
    establishedDate: '2023-09-01'
  },
  {
    unicode: '91510725MAEKMMYW3A',
    name: '绵阳市人工智网科技培训学校有限公司',
    nameAbbreviation: '绵阳人工智网',
    typeName: '科技',
    contactPerson: '高艺齐',
    contactPhone: '15200000000',
    address: '四川省绵阳市',
    establishedDate: '2024-03-15'
  },
  {
    unicode: '91510725MAEKMMY56U',
    name: '梓潼县童画大王艺术培训学校有限公司',
    nameAbbreviation: '童画大王',
    typeName: '艺术',
    contactPerson: '李科霖',
    contactPhone: '15800000000',
    address: '四川省绵阳市梓潼县',
    establishedDate: '2024-06-01'
  }
]

// 2. 用户
const PLATFORM_ADMINS = [
  { mobile: '15800000000', password: 'Admin@123', realName: '李科霖' },
  { mobile: '15200000000', password: 'Admin@123', realName: '高艺齐' }
]

const STAFF_USERS = [
  { mobile: '13800000000', password: 'User@123', realName: '梓潼校长', isSystAll: true }, // 校长：拥有所有岗位
  { mobile: '13800000001', password: 'User@123', realName: '张宇佳' },
  { mobile: '13800000002', password: 'User@123', realName: '杨小红' },
  { mobile: '13800000003', password: 'User@123', realName: '于邵阳' },
  { mobile: '13800000004', password: 'User@123', realName: '倪典' }
]

// 家长：手机号从 18600000001 开始递增；Student 生日按"今天 2026/06/10"反推，
// 使其在 2026-06-10 当天正好 N 岁（取每年 1 月 15 日的生日，安全落入对应年龄段）。
function birthdayForAge(age) {
  // 当前年份 - age 即出生年份；1/15 让"6/10 当天已过生日"成立
  const year = 2026 - age
  return new Date(Date.UTC(year, 0, 15, 0, 0, 0))
}

// 36 位家长，索引顺序与"18600000001~18600000036"一一对应
const PARENT_USERS = [
  { parentName: '家长-王兴宇',   studentName: '王子轩', studentGender: 'male',   studentAge: 11 },
  { parentName: '家长-裴仕豪',   studentName: '裴浩宇', studentGender: 'male',   studentAge: 12 },
  { parentName: '家长-陈艺帆',   studentName: '陈艺涵', studentGender: 'female', studentAge: 10 },
  { parentName: '家长-雷向宇',   studentName: '雷向阳', studentGender: 'male',   studentAge: 12 },
  { parentName: '家长-黄艺晨',   studentName: '黄子晨', studentGender: 'male',   studentAge: 10 },
  { parentName: '家长-曹袁毛轩', studentName: '袁梓轩', studentGender: 'male',   studentAge: 9 },
  { parentName: '家长-郭浩楠',   studentName: '郭浩轩', studentGender: 'male',   studentAge: 9 },
  { parentName: '家长-贾宜航',   studentName: '贾宇航', studentGender: 'male',   studentAge: 8 },
  { parentName: '家长-李子灵',   studentName: '李子萱', studentGender: 'female', studentAge: 8 },
  { parentName: '家长-曹加乐',   studentName: '曹乐妍', studentGender: 'female', studentAge: 10 },
  { parentName: '家长-赵梓睿',   studentName: '赵睿辰', studentGender: 'male',   studentAge: 10 },
  { parentName: '家长-闫宇扬',   studentName: '闫宇桐', studentGender: 'male',   studentAge: 10 },
  { parentName: '家长-董语轩',   studentName: '董语桐', studentGender: 'female', studentAge: 9 },
  { parentName: '家长-贾敬尧',   studentName: '贾敬之', studentGender: 'male',   studentAge: 10 },
  { parentName: '家长-史彬宇',   studentName: '史彬泽', studentGender: 'male',   studentAge: 10 },
  { parentName: '家长-陈霖',     studentName: '陈霖泽', studentGender: 'male',   studentAge: 9 },
  { parentName: '家长-吕欣妍',   studentName: '吕欣怡', studentGender: 'female', studentAge: 10 },
  { parentName: '家长-刘名阳',   studentName: '刘名泽', studentGender: 'male',   studentAge: 11 },
  { parentName: '家长-鲁奕辰',   studentName: '鲁奕铭', studentGender: 'male',   studentAge: 6 },
  { parentName: '家长-罗怡涵',   studentName: '罗怡然', studentGender: 'female', studentAge: 6 },
  { parentName: '家长-罗恽程',   studentName: '罗恽宁', studentGender: 'male',   studentAge: 6 },
  { parentName: '家长-姜穆凡',   studentName: '姜穆宁', studentGender: 'male',   studentAge: 8 },
  { parentName: '家长-郭洪杨',   studentName: '郭洪宇', studentGender: 'male',   studentAge: 6 },
  { parentName: '家长-董佳怡',   studentName: '董佳琪', studentGender: 'female', studentAge: 5 },
  { parentName: '家长-贾云轩',   studentName: '贾云泽', studentGender: 'male',   studentAge: 6 },
  { parentName: '家长-安籽燊',   studentName: '安籽辰', studentGender: 'male',   studentAge: 6 },
  { parentName: '家长-曹靖承',   studentName: '曹靖泽', studentGender: 'male',   studentAge: 6 },
  { parentName: '家长-董泊成',   studentName: '董泊远', studentGender: 'male',   studentAge: 6 },
  { parentName: '家长-王琴剑',   studentName: '王琴音', studentGender: 'female', studentAge: 6 },
  { parentName: '家长-李卓玲',   studentName: '李卓妍', studentGender: 'female', studentAge: 6 },
  { parentName: '家长-胡维予',   studentName: '胡维宁', studentGender: 'male',   studentAge: 5 },
  { parentName: '家长-刁羽臣',   studentName: '刁羽辰', studentGender: 'male',   studentAge: 5 },
  { parentName: '家长-陈锦源',   studentName: '陈锦泽', studentGender: 'male',   studentAge: 5 },
  { parentName: '家长-徐子言',   studentName: '徐子墨', studentGender: 'male',   studentAge: 5 },
  { parentName: '家长-杨俊骁',   studentName: '杨俊泽', studentGender: 'male',   studentAge: 4 }
]
// 自动按顺序分配手机号 18600000001~18600000036（11 位）
PARENT_USERS.forEach((p, i) => {
  p.mobile = '186' + String(10000000 + (i + 1)) // 10000001..10000036 (8 位)
  p.password = 'Client@123'
})

// 3. 类别字典
const ORG_CATEGORIES = ['科技', '艺术'] // Org 类型
const SUBJECT_CATEGORIES = ['C++', 'python', 'Scratch', 'Spike', '大颗粒'] // Subject 顶级分类

// 4. 地区
const REGION_TREE = [
  {
    name: '四川', children: [
      {
        name: '绵阳', children: [
          { name: '梓潼', children: [] },
          { name: '江油', children: [] }
        ]
      },
      { name: '成都', children: [] }
    ]
  },
  {
    name: '北京', children: [
      { name: '朝阳区', children: [] }
    ]
  },
  {
    name: '山东', children: [
      { name: '济宁', children: [{ name: '嘉祥', children: [] }] }
    ]
  }
]

// 5. 教室（全部位于"梓潼人工智网"机构下）
const ROOMS = [
  { name: '101 听课教室', capacity: 8,  description: '旁听 / 试听 / 家长观摩使用' },
  { name: '201 有效衔接教室', capacity: 30, description: '大班授课 / 公开课 / 集合活动' },
  { name: '202 硬件教室', capacity: 8,  description: 'Spike / 大颗粒 / 硬件编程' },
  { name: '204 编程教室', capacity: 8,  description: 'Scratch / Python / C++ 上机' },
  { name: '206 绘画教室', capacity: 16, description: '美术 / 艺术创作' }
]

// 6. 学科：每个 (学科大类 + 级别) 拆成独立 Subject 文档，便于按级别直接挂课 / 排课。
// categoryName 对应 SUBJECT_CATEGORIES 中的项；levels 用于渲染 UI 阶段列表。
const SUBJECTS = [
  { name: 'C++初级',   categoryName: 'C++',     levels: ['初级'] },
  { name: 'C++中级',   categoryName: 'C++',     levels: ['中级'] },
  { name: 'C++高级',   categoryName: 'C++',     levels: ['高级'] },
  { name: 'C++考级',   categoryName: 'C++',     levels: ['考级'] },
  { name: 'C++竞赛',   categoryName: 'C++',     levels: ['竞赛'] },
  { name: 'python初级', categoryName: 'python',  levels: ['初级'] },
  { name: 'python中级', categoryName: 'python',  levels: ['中级'] },
  { name: 'python高级', categoryName: 'python',  levels: ['高级'] },
  { name: 'python考级', categoryName: 'python',  levels: ['考级'] },
  { name: 'Scratch初级', categoryName: 'Scratch', levels: ['初级'] },
  { name: 'Scratch高级', categoryName: 'Scratch', levels: ['高级'] },
  { name: 'Scratch考级', categoryName: 'Scratch', levels: ['考级'] },
  { name: 'Spike初级',  categoryName: 'Spike',   levels: ['初级'] },
  { name: 'Spike中级',  categoryName: 'Spike',   levels: ['中级'] },
  { name: 'Spike高级',  categoryName: 'Spike',   levels: ['高级'] },
  { name: '大颗粒初级', categoryName: '大颗粒',  levels: ['初级'] },
  { name: '大颗粒高级', categoryName: '大颗粒',  levels: ['高级'] }
]

// 7. 课程产品（课包）—— 全部总课时 16 / 90 分钟一节 / 360 天有效
// subjectName 引用 SUBJECTS 中拆分后的级别学科；"0基础课包" 价格未指定，默认采用 1800/1500/1200。
const COURSE_PRODUCTS = [
  {
    name: '大颗粒课包',
    subjectName: '大颗粒初级',
    totalLessons: 16,
    minutesPerLesson: 90,
    originalPrice: 2200,
    discountPrice: 1600,
    promotionPrice: 1480,
    promotionActive: true,
    validDays: 360
  },
  {
    name: '基础课包',
    subjectName: 'C++初级', // 基础课包默认关联 C++ 入门级
    totalLessons: 16,
    minutesPerLesson: 90,
    originalPrice: 2400,
    discountPrice: 2200,
    promotionPrice: 1600,
    promotionActive: true,
    validDays: 360
  },
  {
    name: 'C++私教课包',
    subjectName: 'C++高级',
    totalLessons: 16,
    minutesPerLesson: 90,
    originalPrice: 4800,
    discountPrice: 3200,
    promotionPrice: 3180,
    promotionActive: false, // "无活动"
    validDays: 360
  },
  {
    name: '工程师课包',
    subjectName: 'C++中级',
    totalLessons: 16,
    minutesPerLesson: 90,
    originalPrice: 3200,
    discountPrice: 2600,
    promotionPrice: 2200,
    promotionActive: true,
    validDays: 360
  },
  {
    name: '0基础课包',
    subjectName: '大颗粒初级', // 0 基础对应大颗粒（最入门）
    totalLessons: 16,
    minutesPerLesson: 90,
    originalPrice: 1800,
    discountPrice: 1500,
    promotionPrice: 1200,
    promotionActive: true,
    validDays: 360
  }
]

// 8. 岗位定义（与 CLAUDE.md 中"家长"岗对齐 + 财务）
const POSITION_DEFINITIONS = [
  {
    name: '管理员',
    isSystem: true,
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'user.read', 'user.write', 'user.resetPassword',
      'position.read', 'position.write',
      'student.read', 'student.write',
      'subject.read', 'subject.write',
      'courseProduct.read', 'courseProduct.write',
      'courseInstance.read', 'courseInstance.write',
      'courseEnrollment.read', 'courseEnrollment.write',
      'room.read', 'room.write',
      'lessonSchedule.read', 'lessonSchedule.write',
      'order.read', 'order.write', 'order.pay',
      'studentProduct.read', 'studentProduct.gift',
      'lessonAttendance.read', 'lessonAttendance.write',
      'studentWork.read', 'studentWork.write',
      'points.read', 'pet.read',
      'report.read'
    ]
  },
  {
    name: '教务',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'student.read', 'student.write',
      'subject.read', 'subject.write',
      'courseProduct.read', 'courseProduct.write',
      'courseInstance.read', 'courseInstance.write',
      'courseEnrollment.read', 'courseEnrollment.write',
      'room.read', 'room.write',
      'lessonSchedule.read', 'lessonSchedule.write',
      'order.read', 'order.write', 'order.pay',
      'studentProduct.read',
      'lessonAttendance.read',
      'studentWork.read',
      'points.read', 'pet.read',
      'report.read'
    ]
  },
  {
    name: '老师',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'student.read',
      'courseInstance.read',
      'room.read',
      'lessonSchedule.read',
      'lessonAttendance.read', 'lessonAttendance.write',
      'studentWork.read', 'studentWork.write',
      'points.read', 'pet.read',
      'report.read'
    ]
  },
  {
    name: '家长',
    clientLevel: CLIENT_LEVEL.BASIC,
    permissions: [
      'student.read',
      'lessonSchedule.read',
      'lessonAttendance.read',
      'studentWork.read', 'studentWork.write',
      'points.read', 'pet.read',
      'report.read'
    ]
  },
  {
    name: '财务',
    clientLevel: CLIENT_LEVEL.NONE,
    permissions: [
      'order.read', 'order.write', 'order.pay',
      'student.read', 'studentProduct.read',
      'report.read'
    ]
  }
]

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────

async function hashPassword(plain) {
  return argon2.hash(plain, { type: argon2.argon2id })
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

async function run() {
  // 1. 清空整个数据库（dropDatabase 会干掉当前库下所有 collection，包括历史
  //    测试残留的 lesson_attendances / course_instances / pet / points_* 等；
  //    mongoose 连接保持不变，后续 insert 会在空库中重建）
  // eslint-disable-next-line no-console
  console.log('[seed.initial] dropping database...')
  await require('mongoose').connection.dropDatabase()

  // 2. 地区（递归写入）
  async function insertRegion(node, parentId, level) {
    const r = await Region.create({
      name: node.name,
      level,
      parent: parentId,
      isActive: true
    })
    for (const child of node.children) {
      // eslint-disable-next-line no-await-in-loop
      await insertRegion(child, r._id, level + 1)
    }
    return r
  }
  for (const top of REGION_TREE) {
    // eslint-disable-next-line no-await-in-loop
    await insertRegion(top, null, 0)
  }
  // eslint-disable-next-line no-console
  console.log('[seed.initial] regions inserted')

  // 3. 类别（Org + Subject 顶级）
  const orgTypeDocs = await Category.insertMany(
    ORG_CATEGORIES.map((name, i) => ({ model: 'Org', name, level: 0, sort: i, isActive: true }))
  )
  const orgTypeMap = new Map(orgTypeDocs.map((c) => [c.name, c]))
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] org categories: ${orgTypeDocs.map((c) => c.name).join(', ')}`)

  const subjectTypeDocs = await Category.insertMany(
    SUBJECT_CATEGORIES.map((name, i) => ({ model: 'Subject', name, level: 0, sort: i, isActive: true }))
  )
  const subjectTypeMap = new Map(subjectTypeDocs.map((c) => [c.name, c]))
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] subject categories: ${subjectTypeDocs.map((c) => c.name).join(', ')}`)

  // Student / 其他顶级（保留默认字典）
  await Category.insertMany([
    { model: 'Student', name: '常规', level: 0, sort: 0 },
    { model: 'Student', name: '试学', level: 0, sort: 1 }
  ])

  // 4. 机构（principal 占位为 null，下面用张宇佳补上）
  const principalUser = await User.findOne({ mobile: '13800000001' }).select('_id').lean()
  const orgDocs = await Org.insertMany(
    ORGS.map((o) => ({
      unicode: o.unicode,
      name: o.name,
      nameAbbreviation: o.nameAbbreviation,
      type: orgTypeMap.get(o.typeName)._id,
      contactPerson: o.contactPerson,
      contactPhone: o.contactPhone,
      address: o.address,
      establishedDate: new Date(o.establishedDate),
      principal: principalUser ? principalUser._id : null,
      isActive: true
    }))
  )
  const orgByAbbrev = new Map(orgDocs.map((o) => [o.nameAbbreviation, o]))
  const zitongOrg = orgByAbbrev.get('梓潼人工智网')
  if (!zitongOrg) throw new Error('缺少"梓潼人工智网"机构')
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] orgs inserted: ${orgDocs.map((o) => o.nameAbbreviation).join(', ')}`)

  // 5. 用户（先建账号，最后写 UserOrgRel；为简化分两批创建）
  // 5.1 平台超管
  for (const a of PLATFORM_ADMINS) {
    // eslint-disable-next-line no-await-in-loop
    await User.create({
      mobile: a.mobile,
      passwordHash: await hashPassword(a.password),
      realName: a.realName,
      isPlatformAdmin: true,
      isActive: true
    })
  }
  // 5.2 员工
  for (const s of STAFF_USERS) {
    // eslint-disable-next-line no-await-in-loop
    await User.create({
      mobile: s.mobile,
      passwordHash: await hashPassword(s.password),
      realName: s.realName,
      isPlatformAdmin: false,
      isActive: true
    })
  }
  // 5.3 家长
  for (const p of PARENT_USERS) {
    // eslint-disable-next-line no-await-in-loop
    await User.create({
      mobile: p.mobile,
      passwordHash: await hashPassword(p.password),
      realName: p.parentName,
      isPlatformAdmin: false,
      isActive: true
    })
  }
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] users: ${PLATFORM_ADMINS.length} admin + ${STAFF_USERS.length} staff + ${PARENT_USERS.length} parent`)

  // 6. 岗位（仅在"梓潼人工智网"下创建）
  const posDocs = await Position.insertMany(
    POSITION_DEFINITIONS.map((p) => ({ ...p, org: zitongOrg._id }))
  )
  const posByName = new Map(posDocs.map((p) => [p.name, p]))
  const allPosIds = posDocs.map((p) => p._id)
  const teacherPosId = posByName.get('老师')._id
  const parentPosId = posByName.get('家长')._id
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] positions: ${posDocs.map((p) => p.name).join(', ')}`)

  // 7. 用户-机构关系
  // 7.1 员工：4 个都关联"梓潼人工智网"；张宇佳持所有岗位(isSyst)，其他人仅"老师"
  const staffRelDocs = []
  for (const s of STAFF_USERS) {
    // eslint-disable-next-line no-await-in-loop
    const u = await User.findOne({ mobile: s.mobile }).select('_id').lean()
    staffRelDocs.push({
      user: u._id,
      org: zitongOrg._id,
      positions: s.isSystAll ? allPosIds : [teacherPosId],
      isMain: true
    })
  }
  // 7.2 家长：全部关联"梓潼人工智网"，挂"家长"岗
  const parentRelDocs = []
  for (const p of PARENT_USERS) {
    // eslint-disable-next-line no-await-in-loop
    const u = await User.findOne({ mobile: p.mobile }).select('_id').lean()
    parentRelDocs.push({
      user: u._id,
      org: zitongOrg._id,
      positions: [parentPosId],
      isMain: true
    })
  }
  await UserOrgRel.insertMany([...staffRelDocs, ...parentRelDocs])
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] user-org-rels: ${staffRelDocs.length} staff + ${parentRelDocs.length} parent`)

  // 8. 学员（每个家长 1 个；guardianUser + guardians 都指向家长）
  const studentDocs = []
  for (const p of PARENT_USERS) {
    // eslint-disable-next-line no-await-in-loop
    const u = await User.findOne({ mobile: p.mobile }).select('_id').lean()
    studentDocs.push({
      org: zitongOrg._id,
      name: p.studentName,
      gender: p.studentGender,
      birthday: birthdayForAge(p.studentAge),
      guardianUser: u._id,
      guardians: [u._id],
      notes: `${p.parentName} 的孩子`,
      isActive: true
    })
  }
  await Student.insertMany(studentDocs)
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] students: ${studentDocs.length}`)

  // 9. 教室
  const roomDocs = await Room.insertMany(
    ROOMS.map((r) => ({ ...r, org: zitongOrg._id, isActive: true }))
  )
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] rooms: ${roomDocs.length}`)

  // 10. 学科
  const subjectDocs = await Subject.insertMany(
    SUBJECTS.map((s) => ({
      org: zitongOrg._id,
      name: s.name,
      category: subjectTypeMap.get(s.categoryName)._id,
      objectives: s.levels
    }))
  )
  const subjectByName = new Map(subjectDocs.map((s) => [s.name, s]))
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] subjects: ${subjectDocs.length} (${subjectDocs.map((s) => s.name).join(', ')})`)

  // 11. 课程产品（subjects 数组存关联学科 _id）
  const cpDocs = await CourseProduct.insertMany(
    COURSE_PRODUCTS.map((c) => ({
      org: zitongOrg._id,
      subjects: [subjectByName.get(c.subjectName)._id],
      name: c.name,
      totalLessons: c.totalLessons,
      minutesPerLesson: c.minutesPerLesson,
      originalPrice: c.originalPrice,
      discountPrice: c.discountPrice,
      promotionPrice: c.promotionPrice,
      promotionActive: c.promotionActive,
      validDays: c.validDays,
      isActive: true
    }))
  )
  const cpByName = new Map(cpDocs.map((c) => [c.name, c]))
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] course products: ${cpDocs.map((c) => c.name).join(', ')}`)

  // 12. 完善 Org.principal（梓潼校长）
  const principal = await User.findOne({ mobile: '13800000000' }).select('_id').lean()
  await Org.updateMany({ _id: zitongOrg._id }, { $set: { principal: principal._id } })

  // 13. 订单 + 学员课包
  //   - 3 个特殊订单：王兴宇 / 裴仕豪 / 陈艺帆（按用户指定的产品 + 数量）
  //   - 其他 32 名学员按"5 岁及以下 → 0基础课包；其他 → 基础课包"规则，
  //     数量按"1 或 3"在 0 基础 1 / 3、基础 1 / 3 间交替
  //   - 全部订单 status=paid，paidAmount=actualPrice，并配套生成 StudentProduct
  const specialOrders = [
    { parentMobile: '18610000001', productName: 'C++私教课包', quantity: 3, remark: '王兴宇 特批 C++ 私教*3' },
    { parentMobile: '18610000002', productName: '工程师课包', quantity: 3, remark: '裴仕豪 工程师课包*3' },
    { parentMobile: '18610000003', productName: '工程师课包', quantity: 3, remark: '陈艺帆 工程师课包*3' }
  ]
  const specialByMobile = new Map(specialOrders.map((o) => [o.parentMobile, o]))

  // 取出已写入的 Student，按 parentMobile 索引便于回查
  const studentCursor = await Student.find({ org: zitongOrg._id })
    .select('_id name guardians')
    .lean()
  // 用 guardianUser (= guardians[0]) 找到对应 parentUser.mobile
  const guardianIds = studentCursor.map((s) => s.guardians[0])
  const parentUsers = await User.find({ _id: { $in: guardianIds } }).select('_id mobile').lean()
  const parentById = new Map(parentUsers.map((u) => [String(u._id), u]))
  const studentsByParentMobile = new Map()
  for (const s of studentCursor) {
    const parent = parentById.get(String(s.guardians[0]))
    if (parent) studentsByParentMobile.set(parent.mobile, s)
  }

  function currentUnitPrice(cp) {
    // 与 OrderService.create 中的拷贝规则一致：promotionActive → promotionPrice；否则 discountPrice
    return cp.promotionActive ? cp.promotionPrice : cp.discountPrice
  }

  const orderDocs = []
  const studentProductDocs = []
  const now = new Date()
  for (let i = 0; i < PARENT_USERS.length; i += 1) {
    const p = PARENT_USERS[i]
    const student = studentsByParentMobile.get(p.mobile)
    if (!student) continue

    let productName
    let quantity
    const special = specialByMobile.get(p.mobile)
    if (special) {
      productName = special.productName
      quantity = special.quantity
    } else {
      // 默认规则：5 岁及以下 → 0基础课包；其他 → 基础课包；数量 1 / 3 交替
      productName = p.studentAge <= 5 ? '0基础课包' : '基础课包'
      quantity = i % 2 === 0 ? 1 : 3
    }
    const cp = cpByName.get(productName)
    if (!cp) throw new Error(`未找到课程产品: ${productName}`)

    const unitPrice = currentUnitPrice(cp)
    const originalPrice = unitPrice * quantity
    const orderId = new (require('mongoose').Types.ObjectId)()

    orderDocs.push({
      _id: orderId,
      org: zitongOrg._id,
      student: student._id,
      items: [
        { courseProduct: cp._id, quantity, unitPrice, name: cp.name }
      ],
      originalPrice,
      actualPrice: originalPrice,
      paidAmount: originalPrice,
      paidAt: now,
      status: 'paid',
      paymentMethod: 'wechat',
      remark: special ? special.remark : `${p.parentName} ${cp.name}*${quantity}`
    })

    // 每个 unit 创建一个 StudentProduct（quantity=3 → 3 张课包；FIFO 时按 expireDate 选）
    const baseExpire = now.getTime() + cp.validDays * 24 * 60 * 60 * 1000
    for (let q = 0; q < quantity; q += 1) {
      // 错开 expireDate 让同一订单的多张课包能按 FIFO 顺序消课
      const expireDate = new Date(baseExpire + q * 1000)
      studentProductDocs.push({
        org: zitongOrg._id,
        student: student._id,
        source: 'order',
        order: orderId,
        courseProduct: cp._id,
        totalLessons: cp.totalLessons,
        remainingLessons: cp.totalLessons,
        expireDate,
        isActive: true
      })
    }
  }

  if (orderDocs.length) await Order.insertMany(orderDocs)
  if (studentProductDocs.length) await StudentProduct.insertMany(studentProductDocs)
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] orders: ${orderDocs.length}, student products: ${studentProductDocs.length}`)

  // 14. 开班（CourseInstance）
  //   - 名称：python 2026test
  //   - 模式：cycle 上五休一（连续 5 天上课 + 1 天休；不绑日历周）
  //   - 课程产品：基础课包；教学科目 advisory 指向 python初级（与班级名匹配）
  //   - 老师：于邵阳（13800000003）；教室：101 听课教室
  //   - 计划开课日期：今天 + 1（即 2026-06-11）
  //   - totalPlannedLessons 取 CourseProduct.totalLessons（16）；minutesPerLesson 同（90）
  const ciTeacher = await User.findOne({ mobile: '13800000003' }).select('_id realName').lean()
  if (!ciTeacher) throw new Error('开班初始化失败：未找到老师 于邵阳（13800000003）')
  const ciRoom = await Room.findOne({ org: zitongOrg._id, name: '101 听课教室' }).select('_id name capacity').lean()
  if (!ciRoom) throw new Error('开班初始化失败：未找到教室 101 听课教室')
  const ciCp = cpByName.get('基础课包')
  if (!ciCp) throw new Error('开班初始化失败：未找到课程产品 基础课包')
  const ciSubject = await Subject.findOne({ org: zitongOrg._id, name: 'python初级' }).select('_id name').lean()
  if (!ciSubject) throw new Error('开班初始化失败：未找到学科 python初级')

  // 明天 00:00（UTC）作为开课日期；与日期型字段语义一致
  const tomorrow = new Date(Date.UTC(2026, 5, 11, 0, 0, 0)) // 2026-06-11

  const ciDocs = [
    {
      org: zitongOrg._id,
      courseProduct: ciCp._id,
      subject: ciSubject._id,
      name: 'python 2026test',
      description: '种子开班：python 入门班，cycle 上五休一，老师 于邵阳，教室 101',
      teacher: ciTeacher._id,
      room: ciRoom._id,
      schedulePlan: {
        mode: 'cycle',
        cycleOnDays: 5,
        cycleOffDays: 1,
        totalPlannedLessons: ciCp.totalLessons,
        minutesPerLesson: ciCp.minutesPerLesson
      },
      acceptedCourseProducts: [ciCp._id],
      startDate: tomorrow,
      maxStudents: ciRoom.capacity, // 按教室容量给名额上限
      status: 'planning'
    }
  ]
  const ciCreated = await CourseInstance.insertMany(ciDocs)
  // eslint-disable-next-line no-console
  console.log(`[seed.initial] course instances: ${ciCreated.map((c) => c.name).join(', ')}`)

  return {
    orgs: orgDocs,
    zitongOrg,
    platformAdmins: PLATFORM_ADMINS.length,
    staff: STAFF_USERS.length,
    parents: PARENT_USERS.length,
    students: studentDocs.length,
    positions: posDocs.length,
    subjects: subjectDocs.length,
    rooms: roomDocs.length,
    courseProducts: cpDocs.length,
    courseInstances: ciCreated.length
  }
}

module.exports = { run }
