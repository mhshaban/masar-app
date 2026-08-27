import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear } from "../src/services/cloud-runtime.js";
import { termSortKey, getStudentTermTimeline } from "../src/modules/grades/term-progress-service.js";

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
