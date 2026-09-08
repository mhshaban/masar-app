import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear } from "../src/services/cloud-runtime.js";
import { termSortKey, getStudentTermTimeline, getStudentSubjectSummary } from "../src/modules/grades/term-progress-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("subject summary includes every subject, preserves zero and uses only the selected student's identifiers", async () => {
  const subjects = [{ subject: "رياضيات", pct: 0 }, { subject: "عربي", pct: 91 }];
  await bulkPut("academicFlags", [
    { id: "f1", studentId: "20230001", subjects },
    { id: "f2", studentId: "other", subjects: [{ subject: "بيانات أخرى", pct: 100 }] },
  ]);
  assert.deepEqual(await getStudentSubjectSummary({ id: "uuid", academicId: "20230001" }), subjects);
  assert.deepEqual(await getStudentSubjectSummary({ id: "unknown" }), []);
});

test("termSortKey orders the first term before the second, including this school's alef-maksura spelling of الثاني", () => {
  const term1 = "المستوي الأول الفصل الدراسى الأول 2025/2026";
  const term2 = "المستوي الأول الفصل الدراسى الثانى 2025/2026";
  assert.ok(termSortKey(term1) < termSortKey(term2));
});

test("termSortKey orders across school years", () => {
  const y1 = termSortKey("الفصل الدراسي الثاني 2024/2025");
  const y2 = termSortKey("الفصل الدراسي الأول 2025/2026");
  assert.ok(y1 < y2);
});

test("getStudentTermTimeline returns the official certificate average", async () => {
  const term = "الفصل الدراسي الأول 2025/2026";
  await bulkPut("termAverages", [{ id: "t1", studentId: "s1", term, averagePct: 72, rating: "جيد" }]);

  const timeline = await getStudentTermTimeline("s1");
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].averagePct, 72);
  assert.equal(timeline[0].rating, "جيد");
});

test("data from other students never leaks into a student's term timeline", async () => {
  const term = "الفصل الأول 2025/2026";
  await bulkPut("termAverages", [
    { id: "t1", studentId: "s1", term, averagePct: 90, rating: "ممتاز" },
    { id: "t2", studentId: "s2", term, averagePct: 10, rating: "راسب" },
  ]);

  const timeline = await getStudentTermTimeline("s1");
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].averagePct, 90);
});

test("getStudentTermTimeline sorts multiple terms chronologically", async () => {
  await bulkPut("termAverages", [
    { id: "t1", studentId: "s1", term: "الفصل الدراسي الثاني 2025/2026", averagePct: 88, rating: "جيد جدًا" },
    { id: "t2", studentId: "s1", term: "الفصل الدراسي الأول 2025/2026", averagePct: 80, rating: "جيد جدًا" },
  ]);

  const timeline = await getStudentTermTimeline("s1");
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].term, "الفصل الدراسي الأول 2025/2026");
  assert.equal(timeline[1].term, "الفصل الدراسي الثاني 2025/2026");
});

test('term ordering ignores the level ordinal and normalizes Arabic digits', () => {
  assert.ok(termSortKey('المستوى الثالث الفصل الأول ٢٠٢٥/٢٠٢٦') < termSortKey('المستوى الثالث الفصل الثاني 2025/2026'));
});
test('expected term slots preserve real scores and leave missing averages null', async () => {
  const {termSlots, officialAverage, getStudentAcademicSummary} = await import('../src/modules/grades/term-progress-service.js');
  assert.equal(termSlots({level:'الأول'}, []).length, 0);
  assert.deepEqual(termSlots({level:'الثاني'}, []).map(x=>x.averagePct), [null,null]);
  assert.deepEqual(termSlots({level:'الثالث'}, [{term:'الفصل الأول', averagePct:0}]).map(x=>x.averagePct), [0,null,null]);
  assert.equal(officialAverage(null), null);
  assert.equal(officialAverage(''), null);
  assert.equal(officialAverage(0), 0);
  await bulkPut('academicFlags', [{id:'c1', studentId:'a1', finalCumulativeAverage:82.5}, {id:'c2', studentId:'other', finalCumulativeAverage:99}]);
  assert.equal((await getStudentAcademicSummary({id:'u1',academicId:'a1'})).finalCumulativeAverage,82.5);
  assert.equal((await getStudentAcademicSummary({id:'unknown'})).finalCumulativeAverage,null);
});
