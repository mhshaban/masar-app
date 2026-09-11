import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clear, bulkPut, save } from '../src/services/cloud-runtime.js';
import { listStudentsNeedingAttention } from '../src/modules/dashboard/followup-needs-service.js';

beforeEach(async () => {
  for (const collection of ['students', 'academicFlags', 'guidanceCases', 'supportPlans', 'careerSessions', 'promotedSubjects']) {
    await clear(collection);
  }
});

test('merges guidance/support/career/promoted candidates per student, most needs first', async () => {
  await bulkPut('students', [
    { id: '1001', academicId: '1001', name: 'طالب ضعيف', level: 'الثالث' },
    { id: '1002', academicId: '1002', name: 'طالب مرفَّع', level: 'الأول' },
    { id: '1003', academicId: '1003', name: 'طالب سليم', level: 'الثالث' },
  ]);
  // طالب ١٠٠١: معدل أقل من 50٪ (مرشَّح حالة/دعم)، وسنة نهائية بلا جلسة توجيه (مرشَّح توجيه) — 3 احتياجات.
  await save('academicFlags', { studentId: '1001', overallPct: 40, subjects: [] });
  // طالب ١٠٠٢: مقرر مرفّع لم يُجتَز بعد — احتياج واحد فقط.
  await save('promotedSubjects', { studentId: '1002', subjectCode: 'ريض101', cleared: false });
  // طالب ١٠٠٣: سنة نهائية لكن لديه جلسة توجيه مسجَّلة، ومعدله سليم — بلا احتياجات، يجب ألا يظهر إطلاقًا.
  await save('careerSessions', { studentId: '1003', studentName: 'طالب سليم', date: '2026-01-01', topic: 'أ' });

  const rows = await listStudentsNeedingAttention();

  assert.deepEqual(rows.map((r) => r.studentId), ['1001', '1002']);

  const weak = rows.find((r) => r.studentId === '1001');
  assert.deepEqual(new Set(weak.needs.map((n) => n.type)), new Set(['case', 'support', 'career']));
  assert.equal(weak.student.name, 'طالب ضعيف');

  const promoted = rows.find((r) => r.studentId === '1002');
  assert.equal(promoted.needs.length, 1);
  assert.equal(promoted.needs[0].type, 'promoted');
});

test('a student already covered (open case, active plan, or existing career session) is not re-flagged for that need', async () => {
  await bulkPut('students', [{ id: '2001', academicId: '2001', name: 'طالب له حالة مفتوحة', level: 'الأول' }]);
  await save('academicFlags', { studentId: '2001', overallPct: 30, subjects: [] });
  await save('guidanceCases', { studentId: '2001', status: 'open', category: 'academic' });

  const rows = await listStudentsNeedingAttention();
  const row = rows.find((r) => r.studentId === '2001');
  // مرشَّح دعم بس (الحالة الإرشادية موجودة أصلًا فاستُبعد من مرشحي الحالات).
  assert.deepEqual(row.needs.map((n) => n.type), ['support']);
});

test('returns an empty list when nothing needs attention', async () => {
  await bulkPut('students', [{ id: '3001', academicId: '3001', name: 'طالب', level: 'الأول' }]);
  assert.deepEqual(await listStudentsNeedingAttention(), []);
});
