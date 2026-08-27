import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear } from "../src/services/cloud-runtime.js";
import { ratingForPct, computeStudentAchievement, computeSubjectAchievement } from "../src/modules/grades/achievement-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("ratingForPct matches the Ministry of Education's own scale from the certificate legend", () => {
  assert.equal(ratingForPct(95).label, "ممتاز");
  assert.equal(ratingForPct(85).label, "جيد جدًا");
  assert.equal(ratingForPct(75).label, "جيد");
  assert.equal(ratingForPct(65).label, "متوسط");
  assert.equal(ratingForPct(55).label, "مقبول");
  assert.equal(ratingForPct(49).label, "راسب");
  assert.equal(ratingForPct(0).tier, "low");
  assert.equal(ratingForPct(100).tier, "high");
});

test("computeStudentAchievement classifies a student by overall average and flags weak subjects by name", async () => {
  await bulkPut("students", [{ id: "s1", name: "طالب أول", level: "الثالث", section: "١" }]);
  await bulkPut("academicFlags", [
    {
      id: "s1",
      studentId: "s1",
      overallPct: 60,
      subjects: [{ subject: "الرياضيات", pct: 90 }, { subject: "اللغة العربية", pct: 30 }],
      absentCount: 0,
      barredCount: 0,
    },
  ]);

  const rows = await computeStudentAchievement();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentName, "طالب أول");
  assert.equal(rows[0].avgPct, 60);
  assert.equal(rows[0].tier, "medium");
  assert.equal(rows[0].weakSubjects.length, 1);
  assert.equal(rows[0].weakSubjects[0].subject, "اللغة العربية");
});

test("computeStudentAchievement skips a student with no academicFlags row (no overall average)", async () => {
  await bulkPut("students", [{ id: "s1", name: "طالب" }]);

  const rows = await computeStudentAchievement();
  assert.equal(rows.length, 0);
});

test("computeSubjectAchievement classifies students per subject independently of their overall average", async () => {
  await bulkPut("students", [
    { id: "s1", name: "طالب أول", level: "الثالث", section: "١" },
    { id: "s2", name: "طالب ثاني", level: "الثالث", section: "١" },
  ]);
  await bulkPut("academicFlags", [
    {
      id: "s1",
      studentId: "s1",
      overallPct: 58,
      subjects: [{ subject: "الرياضيات", pct: 95 }, { subject: "اللغة العربية", pct: 20 }],
      absentCount: 0,
      barredCount: 0,
    },
    {
      id: "s2",
      studentId: "s2",
      overallPct: 63,
      subjects: [{ subject: "الرياضيات", pct: 40 }, { subject: "اللغة العربية", pct: 85 }],
      absentCount: 0,
      barredCount: 0,
    },
  ]);

  const subjects = await computeSubjectAchievement();
  assert.equal(subjects.length, 2);

  const math = subjects.find((s) => s.subject === "الرياضيات");
  assert.equal(math.counts.high, 1);
  assert.equal(math.counts.low, 1);
  assert.equal(math.students[0].studentName, "طالب ثاني");
  assert.equal(math.students[0].tier, "low");
  assert.equal(math.students[1].studentName, "طالب أول");
  assert.equal(math.students[1].tier, "high");

  const arabic = subjects.find((s) => s.subject === "اللغة العربية");
  assert.equal(arabic.counts.medium, 1); // 85% is "جيد جدًا" — medium tier under the 90/60 thresholds
  assert.equal(arabic.counts.low, 1);
});

test("computeSubjectAchievement skips a subject entry with no numeric pct", async () => {
  await bulkPut("students", [{ id: "s1", name: "طالب" }]);
  await bulkPut("academicFlags", [
    { id: "s1", studentId: "s1", overallPct: null, subjects: [{ subject: "الرياضيات", pct: null }], absentCount: 1, barredCount: 0 },
  ]);

  const subjects = await computeSubjectAchievement();
  assert.equal(subjects.length, 0);
});
