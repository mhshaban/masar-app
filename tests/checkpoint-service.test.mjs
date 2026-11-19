import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clear, list } from '../src/services/cloud-runtime.js';
import { parseCheckpointRows, buildCheckpointRecords, commitCheckpointRecords, compareCheckpoints, COLLECTION } from '../src/modules/grades/checkpoint-service.js';
import { buildAchievementReportHtml, adviceLines, parentMessage } from '../src/modules/grades/checkpoint-report.js';

beforeEach(async () => { await clear(COLLECTION); });

const students = [
  { id: 's1', academicId: '2025001', name: 'أحمد علي', level: 'الأول', section: '١صناعي١', email: 'a@x' },
  { id: 's2', academicId: '2025002', name: 'سالم حسن', level: 'الأول', section: '١صناعي١', email: 'b@x' },
];

test('long format: one row per student × subject; 0.5 is a real half mark, غ is absent', () => {
  const rows = [
    ['كشف درجات الوقفة التقويمية الأولى'],
    ['رقم الطالب', 'اسم الطالب', 'رمز المقرر', 'اسم المقرر', 'الدرجة', 'الدرجة النهائية'],
    ['2025001', 'أحمد علي', 'عرب101', 'اللغة العربية', 15, 20],
    ['2025001', 'أحمد علي', 'ريض101', 'الرياضيات', 'غ', 20],
    ['2025002', 'سالم حسن', 'ريض101', 'الرياضيات', 0.5, 20],
    ['2025002', 'سالم حسن', 'عرب101', 'اللغة العربية', 8, 20],
    ['9999999', 'غير مسجل', 'عرب101', 'اللغة العربية', 10, 20],
  ];
  const parsed = parseCheckpointRows(rows);
  assert.equal(parsed.size, 3);
  const ahmed = parsed.get('2025001');
  assert.equal(ahmed.subjects[0].pct, 75);
  assert.equal(ahmed.subjects[1].status, 'absent');
  assert.equal(parsed.get('2025002').subjects.find((s) => s.code === 'ريض101').pct, 2.5);
  const { records, unmatched } = buildCheckpointRecords(parsed, students, { checkpoint: 1, term: 'ف1' });
  assert.equal(records.length, 2);
  assert.equal(unmatched.length, 1);
  assert.equal(records.find((r) => r.studentId === '2025001').averagePct, 75);
});

test('wide format: one row per student with subject columns', () => {
  const rows = [
    ['م', 'الرقم الأكاديمي', 'اسم الطالب', 'الشعبة', 'اللغة العربية', 'الرياضيات'],
    [1, '2025001', 'أحمد علي', '١صناعي١', 80, 'غائب'],
  ];
  const parsed = parseCheckpointRows(rows);
  const subjects = parsed.get('2025001').subjects;
  assert.deepEqual(subjects.map((s) => s.name), ['اللغة العربية', 'الرياضيات']);
  assert.equal(subjects[0].pct, 80);
  assert.equal(subjects[1].status, 'absent');
});

test('compare two checkpoints per subject and overall', () => {
  const first = { id: 'a', checkpoint: 1, term: 'ف1', averagePct: 60, subjects: [{ code: 'A', name: 'عربي', pct: 70 }, { code: 'B', name: 'رياضيات', pct: 40 }] };
  const second = { id: 'b', checkpoint: 2, term: 'ف1', averagePct: 70, subjects: [{ code: 'A', name: 'عربي', pct: 69 }, { code: 'B', name: 'رياضيات', pct: 55 }] };
  const c = compareCheckpoints([second, first], 'ف1');
  assert.equal(c.delta, 10);
  assert.equal(c.trend, 'up');
  assert.equal(c.subjects.find((s) => s.code === 'A').trend, 'steady');
  assert.equal(c.subjects.find((s) => s.code === 'B').delta, 15);
  assert.equal(c.weakFirst, 1);
  assert.equal(c.weakSecond, 0);
  const html = buildAchievementReportHtml(students[0], c, { cumulative: 81.2, issuedAt: new Date('2026-11-18') });
  assert.match(html, /تقرير التحصيل الأكاديمي/);
  assert.match(html, /أحمد علي/);
  assert.doesNotMatch(html, /a@x/);
});

test('advice flags weak subjects in the latest checkpoint only', () => {
  const first = { id: 'a', checkpoint: 1, term: 'ف1', averagePct: 45, subjects: [{ code: 'B', name: 'رياضيات', pct: 40 }] };
  assert.match(adviceLines(compareCheckpoints([first], 'ف1'))[0], /رياضيات/);
});

test('re-importing a checkpoint replaces it and drops students no longer in the file', async () => {
  const mk = (ids) => ids.map((id) => ({ id: `cp-ف1-1-${id}`, studentId: id, checkpoint: 1, term: 'ف1', subjects: [] }));
  await commitCheckpointRecords(mk(['2025001', '2025002']), { checkpoint: 1, term: 'ف1' });
  const result = await commitCheckpointRecords(mk(['2025001']), { checkpoint: 1, term: 'ف1' });
  assert.equal(result.removed, 1);
  assert.equal((await list(COLLECTION)).length, 1);
});

test('parentMessage picks the tier from the latest checkpoint', () => {
  const mk = (pcts, avg) => ({ firstAvg: avg, subjects: pcts.map((p, i) => ({ name: `م${i}`, first: { pct: p } })) });
  assert.equal(parentMessage(mk([0, 0, 0], 0)).level, 'absentAll');
  assert.equal(parentMessage(mk([40, 45, 80], 55)).level, 'low');
  assert.equal(parentMessage(mk([40, 80, 90], 70)).level, 'oneWeak');
  assert.equal(parentMessage(mk([70, 80, 75], 75)).level, 'good');
  assert.equal(parentMessage(mk([95, 92, 98], 95)).level, 'top');
  assert.match(parentMessage(mk([40, 45, 80], 55)).lines.join(' '), /م0، م1/);
});

test('missingSectionCourses lists section courses the student has no grade in', async () => {
  const { missingSectionCourses } = await import('../src/modules/grades/checkpoint-service.js');
  const rec = (id, names) => ({ id, section: 'س1', term: 'ت', checkpoint: 1, subjects: names.map((name) => ({ name, code: '', pct: 50 })) });
  const me = rec('me', ['الرسم الفني', 'اللغة العربية']);
  const all = [me, rec('a', ['الرسم الفني', 'اللغة العربية', 'العلوم', 'الرياضيات']), rec('b', ['الرسم الفني', 'اللغة العربية', 'العلوم', 'الرياضيات']), rec('c', ['الرسم الفني', 'العلوم', 'نادر'])];
  assert.deepEqual(missingSectionCourses(all, me).map((m) => m.name).sort(), ['الرياضيات', 'العلوم']);
});

test('parentMessage mentions courses the student was absent from', () => {
  const c = { firstAvg: 18, subjects: [{ name: 'الرسم الفني', first: { pct: 0 } }, { name: 'اللغة العربية', first: { pct: 36 } }, { name: 'العلوم', first: { status: 'absent', missing: true, pct: null } }] };
  const m = parentMessage(c);
  assert.equal(m.level, 'low');
  assert.match(m.lines[0], /تغيّب عن الوقفة التقويمية في: العلوم/);
});

test('missingSectionCourses ignores the same course under another code', async () => {
  const { missingSectionCourses } = await import('../src/modules/grades/checkpoint-service.js');
  const rec = (id, subs) => ({ id, section: 'س1', term: 'ت', checkpoint: 1, subjects: subs.map(([name, code]) => ({ name, code, pct: 50 })) });
  const me = rec('me', [['اللغة الإنجليزية', 'انج 811'], ['المواد التجارية (محا 803)', '']]);
  const all = [me, rec('a', [['اللغة الإنجليزية', 'انج 801'], ['المواد التجارية (قصد 805)', '']]), rec('b', [['اللغة الإنجليزية', 'انج 801'], ['المواد التجارية (قصد 805)', '']])];
  assert.deepEqual(missingSectionCourses(all, me), []);
});
