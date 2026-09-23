import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCourseGradeRows,
  parseTermAverageRows,
  parseAnnualAverageRows,
  buildAcademicAverages,
} from '../src/services/academic-averages-workbook-import-service.js';

const students = [
  { id: 'u1', academicId: '20241111', name: 'طالب واحد' },
  { id: 'u2', academicId: '20242222', name: 'طالب اثنين' },
];

const COURSE_HEADER = ['رقم الطالب', 'اسم الطالب', 'الشعبة (اسم الملف)', 'السنة الدراسية', 'الفصل الدراسي', 'المستوى', 'رمز المقرر', 'اسم المقرر', 'الساعات', 'الدرجة', 'ملاحظات المقرر', 'الملف المصدر', 'الصفحة'];
const TERM_HEADER = ['رقم الطالب', 'اسم الطالب', 'الشعبة (اسم الملف)', 'السنة الدراسية', 'الفصل الدراسي', 'المستوى', 'المعدل الفصلي', 'التقدير', 'الملف المصدر', 'صفحة بداية الفصل', 'ملاحظات'];
const ANNUAL_HEADER = ['رقم الطالب', 'اسم الطالب', 'الشعبة (اسم الملف)', 'السنة الدراسية', 'المعدل التراكمي السنوي', 'التقدير', 'الملف المصدر', 'الصفحة'];

function courseRow({ id = '20241111', year = '2025/2026', term = 'الأول', level = 'المستوي الأول', code = 'انج801', name = 'اللغة الإنجليزية العامة', score = 84.5, source = 'ملف.pdf' }) {
  return [id, 'طالب', '2تجر1', year, term, level, code, name, 4, score, null, source, 1];
}

function termRow({ id = '20241111', year = '2025/2026', term = 'الأول', level = 'المستوي الأول', avg = 0.911, rating = 'ممتاز' }) {
  return [id, 'طالب', '2تجر1', year, term, level, avg, rating, 'ملف.pdf', 1, null];
}

function annualRow({ id = '20241111', year = '2025/2026', avg = 0.929, rating = 'ممتاز' }) {
  return [id, 'طالب', '2تجر1', year, avg, rating, 'ملف.pdf', 1];
}

test('parseCourseGradeRows reads numeric scores and maps text absence/barred markers', () => {
  const rows = parseCourseGradeRows([COURSE_HEADER,
    courseRow({ code: 'ريض101', name: 'رياضيات', score: 80 }),
    courseRow({ code: 'علم101', name: 'علوم', score: 'غائب' }),
    courseRow({ code: 'انج101', name: 'انجليزي', score: 'محروم' }),
    courseRow({ code: 'كيم101', name: 'كيمياء', score: 0.5 }),
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => [r.score, r.scoreStatus]), [
    [80, null],
    [null, 'absent'],
    [null, 'barred'],
    [null, 'absent'],
  ]);
  assert.match(rows[0].term, /الفصل الدراسي الأول/);
  assert.match(rows[0].term, /2025\/2026/);
});

test('parseCourseGradeRows keeps rows from different years distinct via the term label', () => {
  const rows = parseCourseGradeRows([COURSE_HEADER,
    courseRow({ year: '2024/2025', term: 'الأول' }),
    courseRow({ year: '2025/2026', term: 'الأول' }),
  ]);
  assert.notEqual(rows[0].term, rows[1].term);
});

test('parseTermAverageRows converts the fraction to a percentage', () => {
  const rows = parseTermAverageRows([TERM_HEADER, termRow({ avg: 0.911 })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].averagePct, 91.1);
  assert.equal(rows[0].rating, 'ممتاز');
});

test('parseAnnualAverageRows keeps only each student\'s latest school year', () => {
  const rows = parseAnnualAverageRows([ANNUAL_HEADER,
    annualRow({ id: '20241111', year: '2023/2024', avg: 0.8 }),
    annualRow({ id: '20241111', year: '2025/2026', avg: 0.929 }),
    annualRow({ id: '20241111', year: '2024/2025', avg: 0.85 }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].year, '2025/2026');
  assert.equal(rows[0].finalCumulativeAverage, 92.9);
});

test('buildAcademicAverages aggregates matched students only and computes overall/subject percentages', () => {
  const rows = parseCourseGradeRows([COURSE_HEADER,
    courseRow({ id: '20241111', code: 'ريض101', name: 'رياضيات', score: 80 }),
    courseRow({ id: '20241111', code: 'علم101', name: 'علوم', score: 60 }),
    courseRow({ id: '99999999', code: 'ريض101', name: 'رياضيات', score: 50 }),
  ]);
  const termSummaries = parseTermAverageRows([TERM_HEADER, termRow({ id: '20241111', avg: 0.9 })]);
  const finalCumulativeSummaries = parseAnnualAverageRows([ANNUAL_HEADER, annualRow({ id: '20241111', avg: 0.75 })]);

  const { academicFlagsRecords, termAveragesRecords, summary } = buildAcademicAverages({ rows, termSummaries, finalCumulativeSummaries }, students);
  assert.equal(academicFlagsRecords.length, 1);
  assert.equal(academicFlagsRecords[0].studentId, '20241111');
  assert.equal(academicFlagsRecords[0].overallPct, 70);
  assert.equal(academicFlagsRecords[0].finalCumulativeAverage, 75);
  assert.equal(termAveragesRecords.length, 1);
  assert.equal(termAveragesRecords[0].averagePct, 90);
  assert.equal(summary.unmatchedCount, 1);
});

test('buildAcademicAverages counts absent/barred rows without letting them affect the overall average', () => {
  const rows = parseCourseGradeRows([COURSE_HEADER,
    courseRow({ id: '20241111', code: 'ريض101', name: 'رياضيات', score: 80 }),
    courseRow({ id: '20241111', code: 'علم101', name: 'علوم', score: 'غائب' }),
  ]);
  const { academicFlagsRecords } = buildAcademicAverages({ rows, termSummaries: [], finalCumulativeSummaries: [] }, students);
  assert.equal(academicFlagsRecords[0].overallPct, 80);
  assert.equal(academicFlagsRecords[0].absentCount, 1);
});

test('buildAcademicAverages flags conflicting term averages for the same student/term but keeps the last one read', () => {
  const termSummaries = [
    { studentId: '20241111', term: 'الفصل الدراسي الأول', averagePct: 90, rating: 'ممتاز' },
    { studentId: '20241111', term: 'الفصل الدراسي الأول', averagePct: 92, rating: 'ممتاز' },
  ];
  const { termAveragesRecords, summary } = buildAcademicAverages({ rows: [], termSummaries, finalCumulativeSummaries: [] }, students);
  assert.equal(termAveragesRecords.length, 1);
  assert.equal(termAveragesRecords[0].averagePct, 92);
  assert.equal(summary.termConflictsCount, 1);
});
