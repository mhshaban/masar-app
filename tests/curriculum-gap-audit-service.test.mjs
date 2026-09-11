import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCurriculumGaps } from '../src/services/curriculum-gap-audit-service.js';

const templates = {
  'الصناعي': [{ department: 'الحاسب الآلي', type: 'تخصصية', codes: ['حاس801', 'حاس802', '', '', '', ''] }],
  'التجاري': [{ department: 'المحاسبة', type: 'تخصصية', codes: ['محك801', 'محك801/محك811', '', '', '', ''] }],
};

const students = [
  { id: '1001', academicId: '1001', name: 'أحمد', department: 'الحاسب الآلي', track: 'الصناعي' },
  { id: '1002', academicId: '1002', name: 'سلمى', department: 'المحاسبة', track: 'التجاري' },
];

function cert(academicId, studentName, terms) {
  return { kind: 'certificate', cert: { academicId, studentName, terms, finalCumulativeAverage: null } };
}
function term(label, subjects) {
  return { label, subjects };
}
function subject(code, name, score, scoreStatus = null) {
  return { code, name, score, scoreStatus };
}

test('ignores absent, barred, and failing (<50) subjects — only passing subjects count', () => {
  const results = [
    cert('1001', 'أحمد', [term('الفصل الدراسي الأول', [
      subject('جدد901', 'مقرر جديد', null, 'absent'),
      subject('جدد902', 'مقرر جديد٢', null, 'barred'),
      subject('جدد903', 'مقرر جديد٣', 40, null), // راسب
      subject('جدد904', 'مقرر جديد٤', 60, null), // ناجح
    ])]),
  ];
  const { rows } = analyzeCurriculumGaps(results, students, templates);
  assert.deepEqual(rows.map((r) => r.code), ['جدد904']);
});

test('a code already in either track template (including combined "/" cells) is not reported as missing', () => {
  const results = [
    cert('1001', 'أحمد', [term('ت', [subject('حاس801', 'مقرر معروف', 90)])]),
    cert('1002', 'سلمى', [term('ت', [subject('محك811', 'مقرر بديل ضمن خلية مدمجة', 90)])]),
  ];
  const { rows } = analyzeCurriculumGaps(results, students, templates);
  assert.deepEqual(rows, []);
});

test('a genuinely unlisted code is reported with department/track/student observations', () => {
  const results = [cert('1001', 'أحمد', [term('الفصل الدراسي الأول', [subject('جدد905', 'مقرر غير مدرج', 75)])])];
  const { rows, certificatesRead } = analyzeCurriculumGaps(results, students, templates);
  assert.equal(certificatesRead, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, 'جدد905');
  assert.equal(rows[0].observations.length, 1);
  assert.equal(rows[0].observations[0].department, 'الحاسب الآلي');
  assert.equal(rows[0].observations[0].track, 'الصناعي');
  assert.equal(rows[0].observations[0].studentId, '1001');
});

test('term number is assigned by chronological order within the same student\'s own certificate terms', () => {
  const results = [cert('1001', 'أحمد', [
    term('الفصل الدراسي الثاني 2025', [subject('جدد906', 'م', 80)]),
    term('الفصل الدراسي الأول 2024', [subject('جدد907', 'م', 80)]),
  ])];
  const { rows } = analyzeCurriculumGaps(results, students, templates);
  const first = rows.find((r) => r.code === 'جدد907');
  const second = rows.find((r) => r.code === 'جدد906');
  assert.equal(first.observations[0].termNumber, 1);
  assert.equal(second.observations[0].termNumber, 2);
});

test('the same missing code from multiple students is merged into one row with multiple observations', () => {
  const results = [
    cert('1001', 'أحمد', [term('ت', [subject('جدد908', 'م', 70)])]),
    cert('1002', 'سلمى', [term('ت', [subject('جدد908', 'م', 65)])]),
  ];
  const { rows } = analyzeCurriculumGaps(results, students, templates);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].observations.length, 2);
  assert.deepEqual(rows[0].observations.map((o) => o.studentId).sort(), ['1001', '1002']);
});

test('a certificate with no matching student record still reports the gap, with department/track left null', () => {
  const results = [cert('9999', 'مجهول', [term('ت', [subject('جدد909', 'م', 70)])])];
  const { rows } = analyzeCurriculumGaps(results, students, templates);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].observations[0].department, null);
  assert.equal(rows[0].observations[0].studentName, 'مجهول');
});

test('non-certificate results (schedule/error/suspicious) are skipped without throwing', () => {
  const results = [{ kind: 'schedule' }, { kind: 'error', reason: 'x' }, { kind: 'suspicious' }];
  const { rows, certificatesRead } = analyzeCurriculumGaps(results, students, templates);
  assert.deepEqual(rows, []);
  assert.equal(certificatesRead, 0);
});
