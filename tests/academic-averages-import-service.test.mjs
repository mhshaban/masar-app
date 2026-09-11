import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bulkPut, clear, list } from '../src/services/cloud-runtime.js';
import { buildAcademicAverages, analyzeCertificateFiles, commitAcademicAverages } from '../src/services/academic-averages-import-service.js';

beforeEach(async () => {
  await clear('academicFlags');
  await clear('termAverages');
});

const students = [
  { id: 'u1', academicId: '20241111', name: 'طالب واحد' },
  { id: 'u2', academicId: '20242222', name: 'طالب اثنين' },
];

function cert({ academicId, terms, finalCumulativeAverage = null }) {
  return { kind: 'certificate', cert: { studentName: null, academicId, civilId: null, track: null, terms, finalCumulativeAverage }, sourceFile: `${academicId}.pdf` };
}

const term1 = (subjects, average = 90, rating = 'ممتاز') => ({ label: 'الفصل الدراسي الأول', subjects, average, rating });

test('buildAcademicAverages aggregates overall/subject averages only from matched students', () => {
  const results = [
    cert({ academicId: '20241111', terms: [term1([
      { code: 'ريض101', name: 'رياضيات', score: 80, scoreStatus: null },
      { code: 'علم101', name: 'علوم', score: 60, scoreStatus: null },
    ])], finalCumulativeAverage: 75 }),
    cert({ academicId: '99999999', terms: [term1([{ code: 'ريض101', name: 'رياضيات', score: 50, scoreStatus: null }])] }),
  ];
  const { academicFlagsRecords, termAveragesRecords, summary } = buildAcademicAverages(results, students);
  assert.equal(academicFlagsRecords.length, 1);
  assert.equal(academicFlagsRecords[0].studentId, '20241111');
  assert.equal(academicFlagsRecords[0].overallPct, 70);
  assert.equal(academicFlagsRecords[0].finalCumulativeAverage, 75);
  assert.equal(termAveragesRecords.length, 1);
  assert.equal(termAveragesRecords[0].averagePct, 90);
  assert.equal(summary.certificatesRead, 2);
  assert.equal(summary.unmatchedCount, 1);
});

test('buildAcademicAverages counts schedule/error/suspicious results without throwing', () => {
  const results = [
    { kind: 'schedule' },
    { kind: 'error', reason: 'تعذّر إيجاد رقم الطالب داخل الملف.' },
    { kind: 'suspicious', academicId: '20241111', subjectCount: 30 },
  ];
  const { academicFlagsRecords, summary } = buildAcademicAverages(results, students);
  assert.equal(academicFlagsRecords.length, 0);
  assert.equal(summary.scheduleSkipped, 1);
  assert.equal(summary.errorsCount, 1);
  assert.equal(summary.suspiciousCount, 1);
  assert.equal(summary.certificatesRead, 0);
});

test('buildAcademicAverages flags conflicting term averages for the same student/term but keeps the last one read', () => {
  const results = [
    cert({ academicId: '20241111', terms: [term1([{ code: 'ريض101', name: 'رياضيات', score: 80, scoreStatus: null }], 90)] }),
    cert({ academicId: '20241111', terms: [term1([{ code: 'ريض101', name: 'رياضيات', score: 80, scoreStatus: null }], 92)] }),
  ];
  const { termAveragesRecords, summary } = buildAcademicAverages(results, students);
  assert.equal(termAveragesRecords.length, 1);
  assert.equal(termAveragesRecords[0].averagePct, 92);
  assert.equal(summary.termConflictsCount, 1);
});

test('an encoded-absence score (0.5) does not count toward the overall average, and absentCount reflects it', () => {
  const results = [
    cert({ academicId: '20241111', terms: [term1([
      { code: 'ريض101', name: 'رياضيات', score: 80, scoreStatus: null },
      { code: 'علم101', name: 'علوم', score: null, scoreStatus: 'absent' },
    ])] }),
  ];
  const { academicFlagsRecords } = buildAcademicAverages(results, students);
  assert.equal(academicFlagsRecords[0].overallPct, 80);
  assert.equal(academicFlagsRecords[0].absentCount, 1);
});

test('analyzeCertificateFiles reads each file via its handle, reports progress, and matches the same shape as buildAcademicAverages', async () => {
  const originalDocument = globalThis.document;
  const originalLibrary = globalThis.pdfjsLib;
  globalThis.document = { baseURI: 'https://example.test/masar-app/' };
  const rowsFor = (academicId) => [
    ['اسم الطالب', ':', 'طالب', 'رقم الطالب', ':', '(', academicId.slice(0, 4), academicId.slice(4), ')'],
    ['الفصل الدراسي الأول'],
    ['ريض101', 'رياضيات', '4', '85'],
  ];
  let currentRows = rowsFor('20241111');
  globalThis.pdfjsLib = { GlobalWorkerOptions: {}, getDocument() {
    return { promise: Promise.resolve({ numPages: 1, async getPage() { return {
      async getTextContent() { return { items: currentRows.flatMap((row, y) => row.map((str, x) => ({ str, transform: [1, 0, 0, 1, 600 - x * 50, 700 - y * 20] }))) }; }, cleanup() {},
    }; } }), async destroy() {} };
  } };
  try {
    const files = [{ name: '20241111.pdf', handle: { getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) } }];
    const progressCalls = [];
    const { academicFlagsRecords } = await analyzeCertificateFiles(files, students, (done, total) => progressCalls.push([done, total]));
    assert.deepEqual(progressCalls, [[1, 1]]);
    assert.equal(academicFlagsRecords.length, 1);
    assert.equal(academicFlagsRecords[0].studentId, '20241111');
  } finally {
    globalThis.document = originalDocument;
    globalThis.pdfjsLib = originalLibrary;
  }
});

test('commitAcademicAverages replaces stale rows that no longer have a source', async () => {
  await bulkPut('academicFlags', [{ id: 'stale-student', studentId: 'stale-student', overallPct: 50, subjects: [] }]);
  await bulkPut('termAverages', [{ id: 'stale-student--الفصل الأول', studentId: 'stale-student', term: 'الفصل الأول', averagePct: 50 }]);

  const academicFlagsRecords = [{ id: '20241111', studentId: '20241111', overallPct: 90, subjects: [] }];
  const termAveragesRecords = [{ id: '20241111--الفصل الدراسي الأول', studentId: '20241111', term: 'الفصل الدراسي الأول', averagePct: 90, rating: 'ممتاز' }];

  const result = await commitAcademicAverages({ academicFlagsRecords, termAveragesRecords });
  assert.equal(result.academicFlagsCount, 1);
  assert.equal(result.removedFlagsCount, 1);
  assert.equal(result.removedTermsCount, 1);

  const flags = await list('academicFlags');
  assert.deepEqual(flags.map((r) => r.id), ['20241111']);
  const terms = await list('termAverages');
  assert.deepEqual(terms.map((r) => r.id), ['20241111--الفصل الدراسي الأول']);
});
