require('module-alias/register');
const mongoose = require('mongoose');
const CourseEnrollment = require('@models/CourseEnrollment.model');
const LessonSchedule = require('@models/LessonSchedule.model');
const { CourseEnrollmentStatus } = require('@shared/enums');

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/edustation_dev');
  const orgId = '6a2fb342aa8152333e4de50c';
  const studentId = '6a3b9fc9867def445c44ba65';

  const enrollments = await CourseEnrollment.find({
    org: orgId, student: studentId, status: CourseEnrollmentStatus.ENROLLED
  }).select('courseInstance').lean();
  console.log('1) enrollments:', enrollments.length);
  console.log('   IDs:', enrollments.map(e => String(e.courseInstance)));

  const ciIds = enrollments.map(e => e.courseInstance);
  const filter = {
    org: orgId,
    courseInstance: { $in: ciIds },
    isTrialLesson: { $ne: true },
    plannedStartTime: {
      $gte: new Date('2026-06-28T16:00:00Z'),
      $lte: new Date('2026-07-12T16:00:00Z')
    }
  };

  const items = await LessonSchedule.find(filter).limit(20).lean();
  console.log('3) results:', items.length);
  items.forEach(i => console.log('  -', new Date(i.plannedStartTime).toISOString(), 'lessonNo=' + i.lessonNo, 'status=' + i.status));
})().catch(e => { console.error(e); process.exit(1); });
