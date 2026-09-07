import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleRows, renderScheduleTable } from '../src/modules/students/student-schedule-parser.js';
const row = cells => ({items:cells.map(([text,x])=>({text,x,width:0}))});
const rows=[
  row([['جدول حصص الفصل الدراسي',600]]),row([['الشعبة',600],['1تلم1',500]]),
  row([['اليوم',600],['الاحد',500],['الاثنين',400],['الثلاثاء',300],['الاربعاء',200],['الخميس',100]]),
  row([['مقرر',600],['عرب801',500],['تقن804',400],['لحم801',300],['رشد801',200],['انج801',100]]),
  row([['مدرس',600],['معلم تجريبي',400]]),
  row([['غرفة',600],['101',500],['لحام',300],['ديزل',200],['006',100]]),
  row([['الحصة الأولى',680],['فترة',600],['صباحي',500],['مسائي',200]]),
  row([['مقرر',600]]),row([['الحصة الثانية',680]])
];
test('schedule uses coordinates to preserve a missing middle cell and combines period labels',()=>{
  const s=parseScheduleRows(rows,'١تلم١');assert.equal(s.lessons.length,2);assert.equal(s.days.length,5);
  assert.deepEqual(s.lessons[0].cells.map(c=>c.room),['101','','لحام','ديزل','006']);
  assert.equal(s.lessons[0].cells[3].period,'مسائي');assert.equal(s.lessons[0].label,'الحصة الأولى');
  assert.ok(s.lessons[1].cells.every(c=>!c.course));
  const html=renderScheduleTable(s);assert.ok(html.includes('<td></td>'));assert.ok(!html.includes('<canvas'));assert.ok(!html.includes('<iframe'));
});
test('rejects another section and non-schedule documents',()=>{
  assert.throws(()=>parseScheduleRows(rows,'١تجر١'),/لا تطابق/);
  assert.throws(()=>parseScheduleRows(rows.slice(1),'١تلم١'),/ليس جدول/);
});
