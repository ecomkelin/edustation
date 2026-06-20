'use strict'

/**
 * 把家长/孩子潜客数据 (2026-06-20 录入表) 写入 edustation_dev 的
 *   - parents
 *   - child_leads
 *
 * 同时也覆盖 initial.data.json 的 parents/child_leads 字段 (供 pnpm db:seeds 复用)
 *
 * 数据来自用户手录的 58 行表格:
 *   - 同 phone = 同家长, 1 家长可带多孩
 *   - 同 name + 同 phone = 同孩, 多个学科折叠到 trialSubjects
 *   - 没有试听记录: 不建 TrialBooking, 也不建 LeadActivity
 *   - 创建人 createdBy 暂取梓潼校长 (13800000000, 6a2fb342aa8152333e4de51d)
 *   - 渠道 source 默认 '地推' (梓潼 Channel 字典: 6a3541ed73f52171cf8cf... 暂时取出来)
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const config = require('@config/index')
const mongoose = require('mongoose')
const Parent = require('@models/Parent.model')
const ChildLead = require('@models/ChildLead.model')
const Org = require('@models/Org.model')
const User = require('@models/User.model')
const Category = require('@models/Category.model')
const School = require('@models/School.model')

const DUMP_JSON_PATH = path.join(__dirname, 'seeds/initial.data.json')

function dbNameFromUri(uri) {
  const m = String(uri).match(/\/([^/?]+)(?:\?|$)/)
  return m ? m[1] : 'edustation_dev'
}

// ─────────────────────────────────────────────────────────────
// 58 行原始数据 (从用户手录复制)
// name | age | grade | className | schoolRaw | phone | subject
// ─────────────────────────────────────────────────────────────
const RAW_ROWS = [
  ['席皓然', 10,  '四年级',   '3班',     '三小',  '15181458812', 'Scratch'],
  ['冉欣月', 11,  '五年级',   '',        '三小',  '',            'Scratch'],
  ['李子睿', 10,  '三年级',   '6班',     '',      '19581717230', 'Scratch'],
  ['李博文', 11,  '五年级',   '',        '',      '15181614895', 'Scratch'],
  ['王长睿', 12,  '六年级',   '',        '',      '18701978633', 'Scratch'],
  ['杨浩庭', 9,   '二年级',   '',        '',      '18383906343', 'Scratch'],
  ['杨际翰', 10,  '',         '',        '',      '15808168649', 'Scratch'],
  ['陈靖阳', 11,  '',         '',        '',      '18781135735', 'Scratch'],
  ['白芯玥', 11,  '五年级',   '',        '',      '15892645930', 'Scratch'],
  ['傅雨萱', 8,   '',         '',        '',      '19113672136', 'Scratch'],
  ['骆佳欣', 9,   '三年级',   '',        '',      '18009094482', 'Scratch'],
  ['周睿',   7,   '一年级',   '',        '',      '19383693856', 'Spike'],
  ['康陈玺', 6.5, '大班',     '',        '',      '13026497778', 'Spike'],
  ['黄梓萌', 7,   '',         '',        '',      '18781162961', 'Spike'],
  ['赵逸轩', 7,   '一年级',   '',        '',      '15280984057', 'Spike'],
  ['冉欣卉', 8,   '一年级',   '',        '三小',  '',            'Spike'],
  ['史语杉', 6.5, '一年级',   '',        '',      '',            'Spike'],
  ['蒙雅楠', 6.5, '',         '',        '',      '18308455808', 'Spike'],
  ['王鈊垚', 6,   '',         '',        '',      '18280757519', 'Spike'],
  ['邱添',   6.5, '',         '',        '',      '',            'Spike'],
  ['白锦乾', 7,   '',         '',        '',      '15892645930', 'Spike'],
  ['王金硚', 7,   '',         '',        '',      '18280757519', 'Spike'],
  ['姚瑄艺', 7,   '',         '',        '',      '15808168649', 'Spike'],
  ['许伟凤', 8,   '一年级',   '',        '三小',  '18048601548', 'Spike'],
  ['杨浩庭', 9,   '二年级',   '',        '',      '18383906343', 'Spike'],
  ['宋迪烨', 7,   '一年级',   '',        '',      '',            'Spike'],
  ['贾杰宇', 8,   '一年级',   '',        '三小',  '',            'Spike'],
  ['琪琪',   6,   '中班',     '',        '东辰',  '',            '大颗粒'],
  ['何含章', 4,   '',         '',        '',      '15281179414', '大颗粒'],
  ['张妤禾', 4,   '中班',     '',        '',      '13778090236', '大颗粒'],
  ['贾泽熹', 6,   '',         '',        '',      '15882805354', '大颗粒'],
  ['裴诗羽', 6,   '幼儿园',   '',        '',      '18780226768', '大颗粒'],
  ['汤安迪', 6,   '幼儿园',   '',        '',      '18227070076', '大颗粒'],
  ['白锦乾', 7,   '',         '',        '',      '15892645930', '大颗粒'],
  ['李松尹', 5,   '',         '',        '',      '15280984057', '大颗粒'],
  ['杨浩成', 6,   '',         '',        '',      '18144260928', '大颗粒'],
  ['赵逸轩', 7,   '',         '',        '',      '15280984057', '大颗粒'],
  ['罗佑诚', 7,   '',         '',        '',      '',            '大颗粒'],
  ['李沐阳', 2.9, '',         '',        '',      '13778151186', '大颗粒'],
  ['张科睿', 3.3, '',         '',        '',      '19113820092', '大颗粒'],
  ['杨梓瑞', 3.9, '',         '',        '',      '15078847353', '大颗粒'],
  ['鲜瑞阳', 4.5, '',         '',        '',      '15982962386', '大颗粒'],
  ['吴羽林', 4,   '',         '',        '',      '18681666910', '大颗粒'],
  ['刘子言', 6,   '大班',     '',        '',      '18681666910', '大颗粒'],
  ['何林溪', 3.3, '',         '',        '',      '15397787159', '大颗粒'],
  ['杨铭灏', 4,   '中班',     '',        '',      '18781650397', '大颗粒'],
  ['张奕恒', 4,   '中班',     '',        '',      '19960523826', '大颗粒'],
  ['李予初', 4,   '',         '',        '',      '13458435999', '大颗粒'],
  ['罗屿森', 4,   '',         '',        '',      '18981191628', '大颗粒'],
  ['岳奕谷', 5,   '',         '',        '',      '13881134459', '大颗粒'],
  ['徐继森', 5,   '',         '',        '',      '18009070243', '大颗粒'],
  ['仇锡浩', 5,   '中班',     '',        '',      '17738423569', '大颗粒'],
  ['仇锡洋', 5,   '中班',     '',        '',      '17738423569', '大颗粒'],
  ['谢东桓', 6,   '大班',     '',        '',      '13989277580', '大颗粒'],
  ['向来',   6,   '大班',     '',        '',      '13699613732', '大颗粒'],
  ['黄文轩', 3.7, '',         '',        '',      '17608162917', '大颗粒'],
  ['王佳莹', 4,   '',         '',        '',      '13925751611', '大颗粒'],
  ['陈紫宸', 4,   '',         '',        '',      '15281640379', '大颗粒']
]

// ─────────────────────────────────────────────────────────────
// 1. 解析 + 折叠
//   - 同 phone → 1 Parent (无 phone 当独立匿名家长, 用占位 phone 区分, 不入库)
//   - 同 name + 同 phone → 1 ChildLead, 多个 subject 折叠到 trialSubjects
//   - className 解析: "3班" / "6班" 这种; 空字符串保留
//   - schoolRaw "三小" / "东辰" → 映射梓潼 School._id
// ─────────────────────────────────────────────────────────────

// 给无 phone 的孩子生成一个稳定占位 phone (按行号), 让"匿名家长"也能入库
function phoneOrPlaceholder(phone, idx) {
  if (phone && /^\d+$/.test(phone)) return phone
  return `00000000000${String(idx).padStart(2, '0')}` // 0000000000001..0000000000058
}

// className 拆分: "三年级6班" -> { grade: '三年级', className: '6班' }
// 数字 + 班 的尾巴
function splitClassName(grade, className) {
  if (className) return { grade, className }
  if (grade && /班$/.test(grade)) {
    // 末尾是"X班"且前面是数字 → className
    const m = grade.match(/^(\D*?)(\d+班)$/)
    if (m) return { grade: m[1] || grade, className: m[2] }
  }
  // 末尾"X班"作为 grade 整体保留 (例如"三年级6班" -> grade=三年级6班, className='')
  return { grade, className: '' }
}

async function run() {
  await mongoose.connect(config.db.uri)
  const org = await Org.findOne({ name: /梓潼/ })
  if (!org) throw new Error('找不到梓潼机构')
  const zitongId = org._id

  // 字典查询
  const subjCategoryByName = {}
  for (const n of ['Scratch', 'Spike', '大颗粒']) {
    const c = await Category.findOne({ org: zitongId, model: 'Subject', name: n, level: 1 })
    if (!c) throw new Error(`梓潼 Subject 字典缺: ${n}`)
    subjCategoryByName[n] = c._id
  }
  const schoolByName = {}
  for (const n of ['一小', '二小', '三小', '东辰小学', '东辰幼儿园', '东风幼儿园', '北门二幼', '南门一幼', '幸福幼儿园']) {
    const s = await School.findOne({ org: zitongId, name: n })
    if (s) schoolByName[n] = s._id
  }
  // "东辰" 模糊匹配 → 中班/大班 → 幼儿园
  function resolveSchool(raw) {
    if (!raw) return null
    if (schoolByName[raw]) return schoolByName[raw]
    if (raw === '东辰') return schoolByName['东辰幼儿园']
    return null
  }

  const createdBy = await User.findOne({ mobile: '13800000000' }) // 梓潼校长
  if (!createdBy) throw new Error('找不到梓潼校长 (createdBy)')

  // 折叠: childKey = `${phone}__${name}`
  const childMap = new Map()
  // parentKey = phone
  const parentMap = new Map()

  RAW_ROWS.forEach((row, idx) => {
    const [name, age, gradeRaw, className, schoolRaw, phone, subject] = row
    const p = phoneOrPlaceholder(phone, idx)
    const { grade, className: cn } = splitClassName(gradeRaw || '', className || '')
    const schoolId = resolveSchool(schoolRaw)

    // 1. 收集家长
    if (!parentMap.has(p)) {
      parentMap.set(p, {
        org: zitongId,
        phone: p,
        sourceDetail: '',
        promoteBy: null,
        consultant: null,
        referrer: null,
        user: null,
        lifecycle: 'new',
        tags: [],
        firstContactedAt: null,
        lastContactedAt: null,
        lastContactedBy: null,
        lastTrialAt: null,
        lastTrialYear: null,
        remark: '',
        createdBy: createdBy._id,
        meta: {}
      })
    }

    // 2. 折叠孩子
    const childKey = `${p}__${name}`
    if (!childMap.has(childKey)) {
      childMap.set(childKey, {
        org: zitongId,
        parentPhone: p,
        name,
        gender: null,
        age: typeof age === 'number' ? age : null,
        school: schoolId,
        grade,
        className: cn,
        trialSubject: null, // 折叠完再回填
        trialSubjects: [],
        trialFee: 0,
        source: null,
        inviteTeacher: null,
        expectedTime: '',
        specificDate: null,
        remark: '',
        lastContactedAt: null,
        lastContactedBy: null,
        status: 'pending',
        lostReason: '',
        expiredAt: null,
        sameAs: [],
        convertedStudent: null,
        convertedAt: null,
        convertedRemark: '',
        createdBy: createdBy._id,
        meta: {}
      })
    }
    const child = childMap.get(childKey)
    // 累加 subject (避免重复)
    const subjId = subjCategoryByName[subject]
    if (subjId && !child.trialSubjects.find((x) => x.equals(subjId))) {
      child.trialSubjects.push(subjId)
    }
  })

  // 3. 写入 Parent (先写, 拿到 _id)
  // eslint-disable-next-line no-console
  console.log(`[seed-recruit] 准备写入 parent=${parentMap.size} 个, childLead=${childMap.size} 个`)

  // 清理旧数据 (幂等): 删掉梓潼下所有 parent (级联 child_leads)
  await ChildLead.deleteMany({ org: zitongId })
  await Parent.deleteMany({ org: zitongId })
  // eslint-disable-next-line no-console
  console.log('[seed-recruit] 已清空梓潼 旧 parents/child_leads')

  const parentDocs = Array.from(parentMap.values()).map((p) => {
    delete p.parentPhone
    p._id = new mongoose.Types.ObjectId()
    return p
  })
  // raw collection: 拿到真实 writeErrors, 看到底谁被吞
  const ParentRaw = mongoose.connection.collection('parents')
  const parentInsertResult = await ParentRaw.insertMany(parentDocs, { ordered: false })
  const insertedParents = parentDocs
  // eslint-disable-next-line no-console
  console.log(`[seed-recruit] parent 写入: ${parentInsertResult.insertedCount}/${parentDocs.length} 条`)
  if (parentInsertResult.insertedCount < parentDocs.length) {
    // eslint-disable-next-line no-console
    console.log('[seed-recruit] parent 失败 details:', JSON.stringify(parentInsertResult.writeErrors || [], null, 2).slice(0, 500))
  }

  // 4. 写 ChildLead
  const phoneToParentId = new Map()
  insertedParents.forEach((p) => phoneToParentId.set(p.phone, p._id))

  const childDocs = []
  for (const c of childMap.values()) {
    const parentId = phoneToParentId.get(c.parentPhone)
    if (!parentId) continue
    c.parent = parentId
    // trialSubject = trialSubjects[0] 快照
    c.trialSubject = c.trialSubjects[0] || null
    delete c.parentPhone
    // 预分配 _id (Mongoose 8 insertMany 必须在 doc 已有 _id 时才不会丢字段;
    // mongo 5/6 驱动的 insertMany 不返回 ops, 用 insertedIds)
    c._id = new mongoose.Types.ObjectId()
    childDocs.push(c)
  }
  // 直接走 raw collection, 避免 Mongoose schema cast 把 trialSubjects 数组 strip
  const ChildLeadRaw = mongoose.connection.collection('child_leads')
  await ChildLeadRaw.insertMany(childDocs, { ordered: false })
  const insertedChildren = childDocs
  // eslint-disable-next-line no-console
  console.log(`[seed-recruit] child_lead 写入: ${insertedChildren.length} 条`)

  // 5. 同步写回 initial.data.json
  const dump = JSON.parse(fs.readFileSync(DUMP_JSON_PATH, 'utf8'))
  // 写前先清空, 然后用 toJSON 序列化 (ObjectId → string, Date → ISO)
  dump.parents = insertedParents.map((d) => serializeDoc(d))
  dump.child_leads = insertedChildren.map((d) => serializeDoc(d))
  fs.writeFileSync(DUMP_JSON_PATH, JSON.stringify(dump, null, 2))
  // eslint-disable-next-line no-console
  console.log(`[seed-recruit] 写回 initial.data.json (parents=${dump.parents.length}, child_leads=${dump.child_leads.length})`)

  await mongoose.disconnect()
  // eslint-disable-next-line no-console
  console.log('[seed-recruit] done.')
  return { parents: insertedParents.length, childLeads: insertedChildren.length }
}

function serializeDoc(doc) {
  const o = doc.toObject ? doc.toObject() : doc
  Object.keys(o).forEach((k) => {
    if (o[k] && o[k]._bsontype === 'ObjectID') o[k] = o[k].toString()
    if (o[k] instanceof Date) o[k] = o[k].toISOString()
    if (Array.isArray(o[k])) {
      o[k] = o[k].map((x) => {
        if (x && x._bsontype === 'ObjectID') return x.toString()
        if (x instanceof Date) return x.toISOString()
        return x
      })
    }
  })
  return o
}

if (require.main === module) {
  run()
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(r)
      process.exit(0)
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[seed-recruit] error:', e)
      process.exit(1)
    })
}

module.exports = { run }