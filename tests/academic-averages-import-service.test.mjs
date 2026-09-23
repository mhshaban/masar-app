import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bulkPut, clear, list } from '../src/services/cloud-runtime.js';
import { commitAcademicAverages } from '../src/services/academic-averages-import-service.js';

beforeEach(async () => {
  await clear('academicFlags');
  await clear('termAverages');
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
