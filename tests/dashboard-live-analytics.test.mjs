import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { loadDashboardSnapshot } from "../src/modules/dashboard/dashboard-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("loadDashboardSnapshot computes academicWeak, promotedTop and planSummary from live collections (no local OneDrive folder needed)", async () => {
  await bulkPut("students", [
    { id: "1", academicId: "1", name: "طالب ضعيف", level: "الأول" },
    { id: "2", academicId: "2", name: "طالب مرفّع", level: "الثاني" },
  ]);
  await bulkPut("academicFlags", [
    { id: "f1", studentId: "1", overallPct: 30, barredCount: 2, subjects: [{ pct: 20 }] },
  ]);
  await bulkPut("promotedSubjects", [
    { id: "p1", studentId: "2", subjectCode: "ريض", cleared: false },
    { id: "p2", studentId: "2", subjectCode: "ريض", cleared: false },
    { id: "p3", studentId: "2", subjectCode: "انج", cleared: false },
  ]);
  await bulkPut("departmentPlanProjects", [
    { id: "proj1", pillar: "القيادة", project_title: "م", actions: [{ no: 1, action: "إجراء" }, { no: 2, action: "إجراء ثاني" }] },
  ]);

  const snapshot = await loadDashboardSnapshot();

  assert.equal(snapshot.totalStudents, 2);
  assert.equal(snapshot.academicWeak.length, 1);
  assert.equal(snapshot.academicWeak[0].studentId, "1");
  assert.equal(snapshot.academicWeak[0].overallPct, 30);
  assert.equal(snapshot.promotedTop.length, 1);
  assert.equal(snapshot.promotedTop[0].studentId, "2");
  assert.deepEqual(snapshot.promotedTop[0].subjects.sort(), ["انج", "ريض"], "duplicate subject rows must be deduped");
  assert.deepEqual(snapshot.planSummary, { projectCount: 1, pillarCounts: { "القيادة": 2 } });
  assert.equal(snapshot.attentionBreakdown.case, 1, "the weak student with no open case counts toward case needs");
});
