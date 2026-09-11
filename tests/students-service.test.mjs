import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clear, bulkPut } from '../src/services/cloud-runtime.js';
import { resetStudentsSeedCache } from '../src/services/students-source.js';
import {
  invalidateStudentsCache, listStudents, getStudent, updateStudent,
  studentTrackGroup, buildLevelTrackBreakdown, getLevelTrackBreakdown,
  normalizeSectionFilter, getFilterOptions, searchStudents, searchStudentsPage,
  listStudentsForSection, getRosterStats, getRosterMeta, STUDENT_TRACK_ORDER,
} from '../src/modules/students/students-service.js';

beforeEach(async () => {
  await clear('students');
  resetStudentsSeedCache();
  invalidateStudentsCache();
});

const ROSTER = [
  { id: '1001', academicId: '1001', name: 'أحمد سالم', nameEn: 'Ahmed Salem', level: 'الأول', section: 'أ١', department: 'الحاسب', track: 'الصناعي', supportNeeded: 'نعم' },
  { id: '1002', academicId: '1002', name: 'سلمى خالد', nameEn: 'Salma Khalid', level: 'الأول', section: 'ب١', department: 'المحاسبة', track: null },
  { id: '1003', academicId: '1003', name: 'يوسف علي', nameEn: null, level: 'الثاني', section: 'أ٢', department: 'الحاسب', track: 'الصناعي' },
  { id: '1004', academicId: null, name: 'بلا رقم أكاديمي', level: null, section: 'ب١', department: 'المحاسبة', track: 'التجاري' },
];

test('studentTrackGroup uses the explicit track field, falling back to section text', () => {
  assert.equal(studentTrackGroup({ track: 'التجاري' }), 'التجاري');
  assert.equal(studentTrackGroup({ track: null, section: 'تجر1' }), 'التجاري');
  assert.equal(studentTrackGroup({ track: null, section: 'أ١' }), 'الصناعي');
});

test('buildLevelTrackBreakdown counts students per level x track (fallback to الصناعي when track is unset and section has no "تجر")', () => {
  const breakdown = buildLevelTrackBreakdown(ROSTER);
  // ١٠٠١ (تخصص صريح: الصناعي) + ١٠٠٢ (بلا تخصص، شعبة "ب١" بلا "تجر" ⇒ الصناعي افتراضيًا).
  assert.deepEqual(breakdown['الأول'], { الصناعي: 2, التجاري: 0 });
  assert.deepEqual(breakdown['الثاني'], { الصناعي: 1, التجاري: 0 });
  // ١٠٠٤ (تخصص صريح: التجاري) بلا مستوى (level: null) ⇒ خارج كل الفئات.
  assert.deepEqual(breakdown['الثالث'], { الصناعي: 0, التجاري: 0 });
});

test('normalizeSectionFilter converts ASCII digits to Arabic-Indic digits', () => {
  assert.equal(normalizeSectionFilter('a1'), 'a١');
  assert.equal(normalizeSectionFilter(''), '');
  assert.equal(normalizeSectionFilter(null), '');
});

test('listStudents/getStudent round-trip through the seeded roster', async () => {
  await bulkPut('students', ROSTER);
  const all = await listStudents();
  assert.equal(all.length, 4);
  const one = await getStudent('1002');
  assert.equal(one.name, 'سلمى خالد');
  assert.equal(await getStudent('missing'), null);
});

test('getLevelTrackBreakdown (JS fallback used in tests) matches buildLevelTrackBreakdown on the live roster', async () => {
  await bulkPut('students', ROSTER);
  assert.deepEqual(await getLevelTrackBreakdown(), buildLevelTrackBreakdown(ROSTER));
});

test('getFilterOptions returns unique, Arabic-sorted values, and a fixed track list', async () => {
  await bulkPut('students', ROSTER);
  const options = await getFilterOptions();
  assert.deepEqual(options.levels.sort(), ['الأول', 'الثاني'].sort());
  assert.ok(options.departments.includes('الحاسب') && options.departments.includes('المحاسبة'));
  assert.deepEqual(options.tracks, STUDENT_TRACK_ORDER);
  assert.equal(new Set(options.departments).size, options.departments.length);
});

test('searchStudents filters by level/department/track/section and a free-text query across name/id fields', async () => {
  await bulkPut('students', ROSTER);
  assert.deepEqual((await searchStudents({ level: 'الأول' })).map((s) => s.id).sort(), ['1001', '1002']);
  assert.deepEqual((await searchStudents({ department: 'الحاسب' })).map((s) => s.id).sort(), ['1001', '1003']);
  assert.deepEqual((await searchStudents({ track: 'التجاري' })).map((s) => s.id), ['1004']);
  assert.deepEqual((await searchStudents({ query: 'Salma' })).map((s) => s.id), ['1002']);
  assert.deepEqual((await searchStudents({ query: '1003' })).map((s) => s.id), ['1003']);
});

test('searchStudentsPage paginates and reports the correct total', async () => {
  await bulkPut('students', ROSTER);
  const page = await searchStudentsPage({ level: 'الأول', offset: 0, limit: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.rows.length, 1);
});

test('searchStudentsPage with an exact section goes through the section-indexed path and still applies other filters', async () => {
  await bulkPut('students', ROSTER);
  const page = await searchStudentsPage({ section: 'ب١', department: 'المحاسبة' });
  assert.deepEqual(page.rows.map((s) => s.id).sort(), ['1002', '1004']);
  assert.equal(page.total, 2);
});

test('listStudentsForSection returns only that exact section, sorted by name', async () => {
  await bulkPut('students', ROSTER);
  const rows = await listStudentsForSection('ب1');
  assert.deepEqual(rows.map((s) => s.id), ['1004', '1002']); // بلا رقم أكاديمي < سلمى خالد أبجديًا
});

test('getRosterStats counts by level, flagged (support/social guidance), and unmatched (missing id/level)', async () => {
  await bulkPut('students', ROSTER);
  const stats = await getRosterStats();
  assert.equal(stats.total, 4);
  assert.equal(stats.byLevel['الأول'], 2);
  assert.equal(stats.byLevel['غير محدد'], 1);
  assert.equal(stats.flagged, 1);
  assert.equal(stats.unmatched, 1);
});

test('getRosterMeta (JS fallback used in tests) combines stats and filter options', async () => {
  await bulkPut('students', ROSTER);
  const meta = await getRosterMeta();
  assert.equal(meta.stats.total, 4);
  assert.ok(meta.options.levels.length > 0);
});

test('updateStudent requires a name, merges fields onto the current record, and stamps updatedAt', async () => {
  await bulkPut('students', ROSTER);
  await assert.rejects(() => updateStudent('1001', { name: '   ' }), /اسم الطالب/);

  const updated = await updateStudent('1001', { name: '  أحمد محمد سالم  ', phones: ['12345678'] });
  assert.equal(updated.name, 'أحمد محمد سالم');
  assert.equal(updated.id, '1001');
  assert.deepEqual(updated.phones, ['12345678']);
  assert.equal(updated.level, 'الأول'); // حقول لم تُرسَل تبقى كما هي
  assert.ok(updated.updatedAt);
});

test('updateStudent on an unknown id fails clearly', async () => {
  await assert.rejects(() => updateStudent('no-such-id', { name: 'اسم' }), /تعذّر إيجاد بيانات الطالب/);
});
