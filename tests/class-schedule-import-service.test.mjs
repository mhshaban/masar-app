import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bulkPut, clear, list } from '../src/services/cloud-runtime.js';
import { parseClassScheduleRows, buildClassScheduleRecords, commitClassSchedules } from '../src/services/class-schedule-import-service.js';

beforeEach(async () => {
  await clear('classSchedules');
});

const HEADER = ['الشعبة', 'اليوم', 'الحصة', 'المقرر', 'الغرفة', 'المعلم', 'القسم', 'الفترة(ص-م)'];
function row({ section = '1تجر1', day = 'الأحد', period = 1, code = 'قصد801', room = '311-20', teacher = 'معلم', department = 'قسم', session = 'صباحي' } = {}) {
  return [section, day, period, code, room, teacher, department, session];
}

test('parseClassScheduleRows reads every field and skips rows missing section/day/period', () => {
  const rows = parseClassScheduleRows([HEADER, row(), [null, 'الأحد', 1, 'x']]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { section: '1تجر1', day: 'الأحد', period: '1', subjectCode: 'قصد801', room: '311-20', teacher: 'معلم', department: 'قسم', session: 'صباحي' });
});

test('buildClassScheduleRecords keys each record by section/day/period, last row wins on a clash', () => {
  const rows = parseClassScheduleRows([HEADER, row({ code: 'اول' }), row({ code: 'ثاني' })]);
  const records = buildClassScheduleRecords(rows);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, '1تجر1--الأحد--1');
  assert.equal(records[0].subjectCode, 'ثاني');
});

test('buildClassScheduleRecords keeps different sections/days/periods as distinct records', () => {
  const rows = parseClassScheduleRows([HEADER,
    row({ section: '1تجر1', day: 'الأحد', period: 1 }),
    row({ section: '1تجر1', day: 'الأحد', period: 2 }),
    row({ section: '1تجر2', day: 'الأحد', period: 1 }),
  ]);
  const records = buildClassScheduleRecords(rows);
  assert.equal(records.length, 3);
});

test('commitClassSchedules replaces the collection fully and prunes stale rows', async () => {
  await bulkPut('classSchedules', [{ id: 'stale--الأحد--1', section: 'stale', day: 'الأحد', period: '1' }]);
  const records = buildClassScheduleRecords(parseClassScheduleRows([HEADER, row()]));
  const result = await commitClassSchedules(records);
  assert.equal(result.classSchedulesCount, 1);
  assert.equal(result.removedClassSchedulesCount, 1);
  const stored = await list('classSchedules');
  assert.deepEqual(stored.map((r) => r.id), ['1تجر1--الأحد--1']);
});
