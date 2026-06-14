'use strict'

/**
 * 教学体系：解析"本节课的内容"helper
 *
 * 教学大纲 + 课件的"继承链"是：
 *
 *   Subject (源)
 *     │ 创建开班时快照
 *     ▼
 *   CourseInstance.syllabusSnapshot / lessonMaterialsSnapshot
 *     │ 教务可加特例
 *     ▼
 *   CourseInstance.syllabusOverride / lessonMaterialsOverride
 *     │ 老师可加单节特例
 *     ▼
 *   LessonSchedule.descriptionOverride / objectivesOverride / materials
 *
 * 解析规则（读）：从下往上 fallback（最具体的覆盖最一般的）
 *   topic        = LS.title   ?? CI.syllabusOverride[N].topic   ?? CI.syllabusSnapshot[N].topic    ?? Subject.syllabus.lessons[N].topic    ?? null
 *   description  = LS.descriptionOverride ?? CI.syllabusOverride[N].description ?? CI.syllabusSnapshot[N].description ?? Subject.syllabus.lessons[N].description ?? ''
 *   objectives   = LS.objectivesOverride ?? CI.syllabusOverride[N].objectives ?? CI.syllabusSnapshot[N].objectives ?? Subject.syllabus.lessons[N].objectives ?? []
 *   materialFileIds = 去重合并（保留顺序）：
 *       LS.materials
 *     ∪ CI.lessonMaterialsOverride[N].fileIds
 *     ∪ CI.lessonMaterialsSnapshot[N].fileIds
 *     ∪ (fallback 当 N > snapshot 覆盖范围) Subject.lessonMaterials.items[N].fileIds
 *
 * 该模块是**纯函数**, 不依赖 DB / Mongoose; 输入都是已经从 Mongo 拉出来的 lean 文档子集;
 * 前后端共用, 前端用同一份逻辑避免双实现。
 */

/**
 * 在 lessons 数组里按 lessonNo 找一条；找不到返回 null
 */
function findLessonByNo(lessons, lessonNo) {
  if (!Array.isArray(lessons)) return null
  for (const l of lessons) {
    if (l && Number(l.lessonNo) === Number(lessonNo)) return l
  }
  return null
}

/**
 * 在 lessonMaterials.items 数组里按 lessonNo 找一条；找不到返回 null
 */
function findItemByNo(items, lessonNo) {
  if (!Array.isArray(items)) return null
  for (const it of items) {
    if (it && Number(it.lessonNo) === Number(lessonNo)) return it
  }
  return null
}

/**
 * 把"可能存在多处的 fileId[]"去重合并, 保留首次出现顺序
 *   @param {Array<Array<string>>} lists
 *   @returns {string[]}
 */
function dedupMergeFileIds(lists) {
  const seen = new Set()
  const out = []
  for (const arr of lists) {
    if (!Array.isArray(arr)) continue
    for (const id of arr) {
      const sid = id != null ? String(id) : null
      if (!sid || seen.has(sid)) continue
      seen.add(sid)
      out.push(sid)
    }
  }
  return out
}

/**
 * 解析"本节课内容"。返回:
 *   {
 *     topic,         // 节主题
 *     description,   // 节内容描述
 *     objectives,    // 本节目标 (string[])
 *     materialFileIds, // 课件 fileId (string[]), 去重合并
 *     sources: {     // 各字段来源于哪一层, 便于 UI 标注"已被开班/老师覆盖"
 *       topic: 'schedule' | 'instanceOverride' | 'instanceSnapshot' | 'subject' | null,
 *       description: 'schedule' | 'instanceOverride' | 'instanceSnapshot' | 'subject' | null,
 *       objectives:  'schedule' | 'instanceOverride' | 'instanceSnapshot' | 'subject' | null,
 *       materials:   ('schedule' | 'instanceOverride' | 'instanceSnapshot' | 'subject')[]  // 按合并顺序
 *     }
 *   }
 *
 * @param {Object} args
 * @param {number} args.lessonNo               必填
 * @param {Object|null} [args.subject]         Subject lean 文档(可选; 提供时作为最底层的"实时源")
 * @param {Object|null} [args.courseInstance]   CourseInstance lean 文档(可选; 含 snapshot/override)
 * @param {Object|null} [args.lessonSchedule]   LessonSchedule lean 文档(可选; 顶层)
 */
function resolveLessonContent({ lessonNo, subject, courseInstance, lessonSchedule }) {
  const n = Number(lessonNo)
  if (!Number.isInteger(n) || n < 1) {
    return {
      topic: null,
      description: '',
      objectives: [],
      materialFileIds: [],
      sources: { topic: null, description: null, objectives: null, materials: [] }
    }
  }

  // ── topic: 顶层就是 LessonSchedule.title
  //   (设计上 Schedule.title 就等同于"本节课主题", 它覆盖下面三层)
  let topic = null
  let topicSrc = null
  if (lessonSchedule && (lessonSchedule.title != null && lessonSchedule.title !== '')) {
    topic = String(lessonSchedule.title)
    topicSrc = 'schedule'
  } else {
    const ov = courseInstance && courseInstance.syllabusOverride && findLessonByNo(courseInstance.syllabusOverride.lessons, n)
    if (ov && ov.topic) {
      topic = String(ov.topic)
      topicSrc = 'instanceOverride'
    } else {
      const snap = courseInstance && courseInstance.syllabusSnapshot && findLessonByNo(courseInstance.syllabusSnapshot.lessons, n)
      if (snap && snap.topic) {
        topic = String(snap.topic)
        topicSrc = 'instanceSnapshot'
      } else if (subject && subject.syllabus && subject.syllabus.lessons) {
        const sl = findLessonByNo(subject.syllabus.lessons, n)
        if (sl && sl.topic) {
          topic = String(sl.topic)
          topicSrc = 'subject'
        }
      }
    }
  }

  // ── description
  let description = ''
  let descriptionSrc = null
  if (lessonSchedule && lessonSchedule.descriptionOverride != null && lessonSchedule.descriptionOverride !== '') {
    description = String(lessonSchedule.descriptionOverride)
    descriptionSrc = 'schedule'
  } else {
    const ov = courseInstance && courseInstance.syllabusOverride && findLessonByNo(courseInstance.syllabusOverride.lessons, n)
    if (ov && ov.description) {
      description = String(ov.description)
      descriptionSrc = 'instanceOverride'
    } else {
      const snap = courseInstance && courseInstance.syllabusSnapshot && findLessonByNo(courseInstance.syllabusSnapshot.lessons, n)
      if (snap && snap.description) {
        description = String(snap.description)
        descriptionSrc = 'instanceSnapshot'
      } else if (subject && subject.syllabus && subject.syllabus.lessons) {
        const sl = findLessonByNo(subject.syllabus.lessons, n)
        if (sl && sl.description) {
          description = String(sl.description)
          descriptionSrc = 'subject'
        }
      }
    }
  }

  // ── objectives
  let objectives = []
  let objectivesSrc = null
  if (Array.isArray(lessonSchedule && lessonSchedule.objectivesOverride) && lessonSchedule.objectivesOverride.length) {
    objectives = [...lessonSchedule.objectivesOverride]
    objectivesSrc = 'schedule'
  } else {
    const ov = courseInstance && courseInstance.syllabusOverride && findLessonByNo(courseInstance.syllabusOverride.lessons, n)
    if (ov && Array.isArray(ov.objectives) && ov.objectives.length) {
      objectives = [...ov.objectives]
      objectivesSrc = 'instanceOverride'
    } else {
      const snap = courseInstance && courseInstance.syllabusSnapshot && findLessonByNo(courseInstance.syllabusSnapshot.lessons, n)
      if (snap && Array.isArray(snap.objectives) && snap.objectives.length) {
        objectives = [...snap.objectives]
        objectivesSrc = 'instanceSnapshot'
      } else if (subject && subject.syllabus && subject.syllabus.lessons) {
        const sl = findLessonByNo(subject.syllabus.lessons, n)
        if (sl && Array.isArray(sl.objectives) && sl.objectives.length) {
          objectives = [...sl.objectives]
          objectivesSrc = 'subject'
        }
      }
    }
  }

  // ── materialFileIds: 合并(顺序: 本节特例 → CI override → CI snapshot → Subject current fallback)
  const lsFiles = (lessonSchedule && Array.isArray(lessonSchedule.materials)) ? lessonSchedule.materials : []
  const ovItem = courseInstance && courseInstance.lessonMaterialsOverride && findItemByNo(courseInstance.lessonMaterialsOverride.items, n)
  const snapItem = courseInstance && courseInstance.lessonMaterialsSnapshot && findItemByNo(courseInstance.lessonMaterialsSnapshot.items, n)
  const subjItem = subject && subject.lessonMaterials && subject.lessonMaterials.items
    ? findItemByNo(subject.lessonMaterials.items, n)
    : null
  // subject fallback: 只在 snapshot 没覆盖到这节时才取 Subject current(N 超出 snapshot 范围)
  const lists = [
    lsFiles,
    (ovItem && ovItem.fileIds) || [],
    (snapItem && snapItem.fileIds) || []
  ]
  const sourcesList = [
    'schedule',
    'instanceOverride',
    'instanceSnapshot'
  ]
  if (!snapItem) {
    // snapshot 没覆盖到 N(开班扩课时),用 Subject 实时内容兜底
    lists.push((subjItem && subjItem.fileIds) || [])
    sourcesList.push('subject')
  }
  const materialFileIds = dedupMergeFileIds(lists)
  // 为合并后的 fileIds 标出各自的来源
  const materialSources = []
  const seen = new Set()
  for (let i = 0; i < lists.length; i++) {
    const arr = lists[i]
    const src = sourcesList[i]
    if (!Array.isArray(arr)) continue
    for (const id of arr) {
      const sid = id != null ? String(id) : null
      if (!sid || seen.has(sid)) continue
      seen.add(sid)
      materialSources.push(src)
    }
  }

  return {
    topic,
    description,
    objectives,
    materialFileIds,
    sources: {
      topic: topicSrc,
      description: descriptionSrc,
      objectives: objectivesSrc,
      materials: materialSources
    }
  }
}

module.exports = {
  resolveLessonContent,
  findLessonByNo,
  findItemByNo,
  dedupMergeFileIds
}
