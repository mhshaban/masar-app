import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear } from "../src/services/cloud-runtime.js";
import { termSortKey, getStudentTermTimeline, getStudentSubjectTimeline, getStudentTermColumns } from "../src/modules/grades/term-progress-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
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

test("getStudentTermTimeline returns the official certificate average, ignoring any grade rows for the same term", async () => {
  const term = "الفصل الدراسي الأول 2025/2026";
  await bulkPut("termAverages", [{ id: "t1", studentId: "s1", term, averagePct: 72, rating: "جيد" }]);
  await bulkPut("grades", [
    { id: "g1", studentId: "s1", subjectName: "الرياضيات", term, score: 40, maxScore: 100 },
  ]);

  const timeline = await getStudentTermTimeline("s1");
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].averagePct, 72);
  assert.equal(timeline[0].rating, "جيد");
});

test("getStudentTermTimeline never computes a term average from checkpoint (الوقفة التقويمية) grades — only official certificate averages count", async () => {
  const term = "الوقفة التقويمية الأولى — الفصل الأول 2025/2026";
  await bulkPut("grades", [
    { id: "g1", studentId: "s1", subjectName: "الرياضيات", term, score: 80, maxScore: 100 },
    { id: "g2", studentId: "s1", subjectName: "العلوم", term, score: 60, maxScore: 100 },
  ]);

  const timeline = await getStudentTermTimeline("s1");
  assert.deepEqual(timeline, []);
});

test("getStudentSubjectTimeline groups by subject name across a code change between terms", async () => {
  await bulkPut("grades", [
    { id: "g1", studentId: "s1", subjectCode: "عرب801", subjectName: "اللغة العربية", term: "الفصل الأول 2025/2026", score: 65, maxScore: 100 },
    { id: "g2", studentId: "s1", subjectCode: "عرب802", subjectName: "اللغة العربية", term: "الفصل الثاني 2025/2026", score: null, scoreStatus: "absent" },
  ]);

  const subjects = await getStudentSubjectTimeline("s1");
  assert.equal(subjects.length, 1);
  assert.equal(subjects[0].subject, "اللغة العربية");
  assert.equal(subjects[0].points.length, 2);
  assert.equal(subjects[0].points[0].pct, 65);
  assert.equal(subjects[0].points[1].scoreStatus, "absent");
});

test("getStudentTermColumns returns terms in chronological order", async () => {
  await bulkPut("grades", [
    { id: "g1", studentId: "s1", subjectName: "أ", term: "الفصل الدراسي الثاني 2025/2026", score: 90, maxScore: 100 },
    { id: "g2", studentId: "s1", subjectName: "أ", term: "الفصل الدراسي الأول 2025/2026", score: 80, maxScore: 100 },
  ]);

  const columns = await getStudentTermColumns("s1");
  assert.deepEqual(columns, ["الفصل الدراسي الأول 2025/2026", "الفصل الدراسي الثاني 2025/2026"]);
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
