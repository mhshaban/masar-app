import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFromClassScheduleRecords, renderScheduleTable } from '../src/modules/students/student-schedule-parser.js';

function record({ section = '1تجر1', day = 'الأحد', period = '1', subjectCode = 'قصد801', room = '311-20', teacher = 'معلم', session = 'صباحي' } = {}) {
  return { section, day, period, subjectCode, room, teacher, session };
}

test('scheduleFromClassScheduleRecords groups by section, orders days chronologically and periods numerically', () => {
  const records = [
    record({ day: 'الاثنين', period: '2', subjectCode: 'ب' }),
    record({ day: 'الأحد', period: '10', subjectCode: 'ج' }),
    record({ day: 'الأحد', period: '2', subjectCode: 'أ' }),
    record({ section: 'غير هذه', day: 'الأحد', period: '1', subjectCode: 'خ' }),
  ];
  const schedule = scheduleFromClassScheduleRecords(records, '1تجر1');
  assert.deepEqual(schedule.days, ['الأحد', 'الاثنين']);
  assert.deepEqual(schedule.lessons.map((l) => l.label), ['الحصة 2', 'الحصة 10']);
  assert.equal(schedule.lessons[0].cells[0].course, 'أ');
  assert.equal(schedule.lessons[0].cells[1].course, 'ب');
  assert.equal(schedule.lessons[1].cells[1].course, '');
});

test('scheduleFromClassScheduleRecords returns null when the section has no rows', () => {
  assert.equal(scheduleFromClassScheduleRecords([record()], 'شعبة غير موجودة'), null);
});

test('renderScheduleTable preserves a missing cell and escapes file text', () => {
  const schedule = scheduleFromClassScheduleRecords([
    record({ day: 'الأحد', period: '1', room: '<script>bad()</script>' }),
    record({ day: 'الاثنين', period: '2', subjectCode: 'ب' }),
  ], '1تجر1');
  const html = renderScheduleTable(schedule);
  assert.ok(html.includes('<td></td>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>bad()'));
});
