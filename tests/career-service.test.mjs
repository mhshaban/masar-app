import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clear, bulkPut } from '../src/services/cloud-runtime.js';
import { listAllSessions, listStudentsWithSessions, getStudentSessions, addSession, removeSession, listCandidates } from '../src/modules/career/career-service.js';

beforeEach(async () => {
  await clear('careerSessions');
  await clear('students');
});

test('addSession requires a student and a non-empty topic', async () => {
  await assert.rejects(() => addSession({ studentId: '', topic: 'x' }), /اختيار الطالب/);
  await assert.rejects(() => addSession({ studentId: 's1', topic: '  ' }), /موضوع الجلسة/);
});

test('addSession trims the topic, defaults the date to today, and treats a blank recommendation as null', async () => {
  const session = await addSession({ studentId: 's1', studentName: 'أحمد', topic: '  اختيار التخصص  ', recommendation: '   ' });
  assert.equal(session.topic, 'اختيار التخصص');
  assert.equal(session.date, new Date().toISOString().slice(0, 10));
  assert.equal(session.recommendation, null);
  assert.equal(session.notes, '');
});

test('listStudentsWithSessions groups sessions per student, using the latest for name/recommendation', async () => {
  await addSession({ studentId: 's1', studentName: 'أحمد', date: '2026-01-01', topic: 'أ', recommendation: 'توصية قديمة' });
  await addSession({ studentId: 's1', studentName: 'أحمد', date: '2026-03-01', topic: 'ب' });
  await addSession({ studentId: 's2', studentName: 'سلمى', date: '2026-02-01', topic: 'ج', recommendation: 'توصية سلمى' });

  const rows = await listStudentsWithSessions();
  assert.equal(rows.length, 2);
  const s1 = rows.find((r) => r.studentId === 's1');
  assert.equal(s1.sessionCount, 2);
  assert.equal(s1.lastDate, '2026-03-01');
  // أحدث جلسة بلا توصية — يبحث عن أقرب جلسة فيها توصية بدل تجاهلها.
  assert.equal(s1.lastRecommendation, 'توصية قديمة');
  // مرتَّبة تنازليًا حسب آخر تاريخ جلسة.
  assert.deepEqual(rows.map((r) => r.studentId), ['s1', 's2']);
});

test('getStudentSessions returns only that student\'s sessions, newest first', async () => {
  await addSession({ studentId: 's1', date: '2026-01-01', topic: 'أ' });
  await addSession({ studentId: 's1', date: '2026-03-01', topic: 'ب' });
  await addSession({ studentId: 's2', date: '2026-02-01', topic: 'ج' });

  const sessions = await getStudentSessions('s1');
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((s) => s.date), ['2026-03-01', '2026-01-01']);
});

test('removeSession deletes the session', async () => {
  const session = await addSession({ studentId: 's1', topic: 'أ' });
  await removeSession(session.id);
  assert.deepEqual(await listAllSessions(), []);
});

test('listCandidates lists only final-year students with no career session yet, sorted by name', async () => {
  await bulkPut('students', [
    { id: 's1', name: 'ياسر', level: 'الثالث' },
    { id: 's2', name: 'أحمد', level: 'الثالث' },
    { id: 's3', name: 'سلمى', level: 'الأول' },
  ]);
  await addSession({ studentId: 's1', topic: 'أ' });

  const candidates = await listCandidates();
  assert.deepEqual(candidates.map((s) => s.id), ['s2']);
});
