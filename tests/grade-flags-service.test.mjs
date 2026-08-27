import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { computeStudentGradeSummaries } from "../src/modules/grades/grade-flags-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("computeStudentGradeSummaries flags a student below the failing threshold with a human-readable reason", async () => {
  await bulkPut("academicFlags", [
    { id: "s1", studentId: "s1", overallPct: 40, subjects: [], absentCount: 0, barredCount: 0 },
  ]);
  const summaries = await computeStudentGradeSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].studentId, "s1");
  assert.ok(summaries[0].reasons.some((r) => r.includes("40%")));
});

test("computeStudentGradeSummaries flags a student failing in one subject even with a passing overall average", async () => {
  await bulkPut("academicFlags", [
    {
      id: "s2",
      studentId: "s2",
      overallPct: 72,
      subjects: [{ subject: "الرياضيات", pct: 41 }, { subject: "العلوم", pct: 88 }],
      absentCount: 0,
      barredCount: 0,
    },
  ]);
  const summaries = await computeStudentGradeSummaries();
  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0].failingSubjects, ["الرياضيات"]);
  assert.ok(summaries[0].reasons.some((r) => r.includes("رسوب في 1 مادة")));
});

test("computeStudentGradeSummaries surfaces a barred count as its own reason", async () => {
  await bulkPut("academicFlags", [
    { id: "s3", studentId: "s3", overallPct: 65, subjects: [], absentCount: 0, barredCount: 2 },
  ]);
  const summaries = await computeStudentGradeSummaries();
  assert.equal(summaries.length, 1);
  assert.ok(summaries[0].reasons.some((r) => r.includes("محروم في 2 مواد")));
});

test("computeStudentGradeSummaries omits a student with nothing below threshold", async () => {
  await bulkPut("academicFlags", [
    { id: "s4", studentId: "s4", overallPct: 91, subjects: [{ subject: "العلوم", pct: 95 }], absentCount: 0, barredCount: 0 },
  ]);
  const summaries = await computeStudentGradeSummaries();
  assert.equal(summaries.length, 0);
});
