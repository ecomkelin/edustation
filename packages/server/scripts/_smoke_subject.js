'use strict'

// 临时冒烟脚本 —— 直接测 subject.service.create / update / remove
// 验证 syllabus / posterFileId / videoFileId / fileBind 全链路
require('dotenv').config()
require('module-alias/register')

const mongoose = require('mongoose')
const { Subject, File, FILE_SCOPE, REF_ENTITY } = require('@models/File.model').File
  ? require('@models/File.model')
  : require('@models/Subject.model')
const subjectService = require('@modules/subject/subject.service')
const { File: FileModel } = require('@models/File.model')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  const orgsColl = db.collection('orgs')
  const org = await orgsColl.findOne({})
  if (!org) {
    console.error('no org in db, abort')
    process.exit(1)
  }
  const orgId = org._id

  // ── 1) 直接造两个 File 当 poster / video ───────────────────────
  const f1 = await FileModel.create({
    org: orgId, scope: 'subjectSyllabus', uploader: orgId, driver: 'local',
    key: 'test/poster.png', url: '/uploads/test/poster.png', mime: 'image/png', size: 100,
    refs: [], refCount: 0, isOrphan: true
  })
  const f2 = await FileModel.create({
    org: orgId, scope: 'subjectSyllabus', uploader: orgId, driver: 'local',
    key: 'test/video.mp4', url: '/uploads/test/video.mp4', mime: 'video/mp4', size: 100,
    refs: [], refCount: 0, isOrphan: true
  })
  const f3 = await FileModel.create({
    org: orgId, scope: 'subjectLessonMaterial', uploader: orgId, driver: 'local',
    key: 'test/material.pdf', url: '/uploads/test/material.pdf', mime: 'application/pdf', size: 100,
    refs: [], refCount: 0, isOrphan: true
  })
  console.log('[1] seeded 3 orphan files:', f1._id, f2._id, f3._id)

  // ── 2) create with syllabus + poster + video + material ────────
  const created = await subjectService.create({
    orgId,
    name: '__smoke_subject_' + Date.now(),
    category: null,
    objectives: ['目标1', '目标2'],
    description: 'smoke test',
    posterFileId: String(f1._id),
    videoFileId: String(f2._id),
    syllabus: { totalLessons: 2, lessons: [
      { lessonNo: 1, topic: '第一节', description: 'desc1', objectives: ['a'], durationMinutes: 60 },
      { lessonNo: 2, topic: '第二节', description: 'desc2', objectives: ['b'], durationMinutes: 60 }
    ] },
    lessonMaterials: { items: [ { lessonNo: 1, fileIds: [String(f3._id)] } ] }
  })
  console.log('[2] created subject id:', created._id, 'syllabus lessons:', created.syllabus.lessons.length, 'materials items:', created.lessonMaterials.items.length)

  // 验证 fileBind: f1/f2/f3 都应不再 orphan, refCount=1
  const f1After = await FileModel.findById(f1._id).lean()
  const f2After = await FileModel.findById(f2._id).lean()
  const f3After = await FileModel.findById(f3._id).lean()
  console.log('[3] file refs after create:')
  console.log('  f1 (poster):', { refCount: f1After.refCount, isOrphan: f1After.isOrphan, refs: f1After.refs })
  console.log('  f2 (video):', { refCount: f2After.refCount, isOrphan: f2After.isOrphan, refs: f2After.refs })
  console.log('  f3 (material):', { refCount: f3After.refCount, isOrphan: f3After.isOrphan, refs: f3After.refs })

  if (f1After.refCount !== 1 || f2After.refCount !== 1 || f3After.refCount !== 1) {
    throw new Error('FAIL: expected refCount=1 for all 3 files after create')
  }
  if (f1After.refs[0].field !== 'posterFileId' || f2After.refs[0].field !== 'videoFileId' || f3After.refs[0].field !== 'lessonMaterials') {
    throw new Error('FAIL: wrong ref field')
  }

  // ── 3) detail 应该 populate 出 url ─────────────────────────────
  const detail = await subjectService.detail(created._id, orgId)
  console.log('[4] detail.posterFileId:', detail.posterFileId)
  console.log('    detail.videoFileId:', detail.videoFileId)
  if (!detail.posterFileId?.url || !detail.videoFileId?.url) throw new Error('FAIL: detail populate missing url')

  // ── 4) update: 换 poster ───────────────────────────────────────
  const f1b = await FileModel.create({
    org: orgId, scope: 'subjectSyllabus', uploader: orgId, driver: 'local',
    key: 'test/poster2.png', url: '/uploads/test/poster2.png', mime: 'image/png', size: 100,
    refs: [], refCount: 0, isOrphan: true
  })
  await subjectService.update(created._id, orgId, {
    posterFileId: String(f1b._id)
  })
  const f1After2 = await FileModel.findById(f1._id).lean()
  const f1bAfter = await FileModel.findById(f1b._id).lean()
  console.log('[5] after update poster: f1 refCount=', f1After2.refCount, '(expect 0, orphan), f1b refCount=', f1bAfter.refCount, '(expect 1)')
  if (f1After2.refCount !== 0 || f1bAfter.refCount !== 1) throw new Error('FAIL: poster swap refs wrong')
  if (f1After2.refs.length !== 0) throw new Error('FAIL: old poster should have no refs')

  // ── 5) update: 清空 poster ─────────────────────────────────────
  await subjectService.update(created._id, orgId, { posterFileId: null })
  const f1bAfter2 = await FileModel.findById(f1b._id).lean()
  console.log('[6] after clear poster: f1b refCount=', f1bAfter2.refCount, '(expect 0)')
  if (f1bAfter2.refCount !== 0) throw new Error('FAIL: clear poster did not unbind')

  // ── 6) update: 改 syllabus ────────────────────────────────────
  await subjectService.update(created._id, orgId, {
    syllabus: { totalLessons: 3, lessons: [
      { lessonNo: 1, topic: '新1', description: '', objectives: [], durationMinutes: 45 },
      { lessonNo: 2, topic: '新2', description: '', objectives: [], durationMinutes: 45 },
      { lessonNo: 3, topic: '新3', description: '', objectives: [], durationMinutes: 45 }
    ] }
  })
  const detail2 = await subjectService.detail(created._id, orgId)
  console.log('[7] after syllabus update: lessons=', detail2.syllabus.lessons.length, 'topic0=', detail2.syllabus.lessons[0].topic, 'topic2=', detail2.syllabus.lessons[2].topic)
  if (detail2.syllabus.lessons.length !== 3 || detail2.syllabus.lessons[2].topic !== '新3') {
    throw new Error('FAIL: syllabus update did not persist')
  }

  // ── 7) remove: 应清掉所有 file refs ────────────────────────────
  await subjectService.remove({ id: created._id, orgId })
  const f2After2 = await FileModel.findById(f2._id).lean()
  const f3After2 = await FileModel.findById(f3._id).lean()
  console.log('[8] after remove: f2 refCount=', f2After2.refCount, '(expect 0), f3 refCount=', f3After2.refCount, '(expect 0)')
  if (f2After2.refCount !== 0 || f3After2.refCount !== 0) throw new Error('FAIL: remove did not unbind all')

  // 清理 fixtures
  await FileModel.deleteMany({ _id: { $in: [f1._id, f1b._id, f2._id, f3._id] } })

  console.log('\n✅ ALL SMOKE TESTS PASSED')
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ smoke test failed:', e)
  process.exit(1)
})
