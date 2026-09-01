import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalDashboardSnapshot, priorityScore, priorityLevel } from "../src/modules/dashboard/dashboard-local-folder.js";

test("local OneDrive backup becomes a small dashboard snapshot and removes promoted-subject duplicates", () => {
  const backup = { app: "masar", exportedAt: "2026-08-31T08:00:00Z", collections: {
    students: [{ id: "1", name: "طالب", level: "الثالث" }],
    academicFlags: [{ studentId: "1", overallPct: 45, barredCount: 0, subjects: [{ pct: 40 }] }],
    guidanceCases: [], supportPlans: [], careerSessions: [], caseSessions: [], supportPlanActions: [],
    promotedSubjects: [
      { studentId: "1", subjectCode: "ريض", cleared: false },
      { studentId: "1", subjectCode: "ريض", cleared: false },
    ],
    departmentPlanProjects: [{ id: "p1", project_title: "مشروع", actions: [{ no: 1, action: "متأخر", periodStart: "2026-08-01", periodEnd: "2026-08-30" }] }],
    actionProgress: [], reminders: [],
  } };
  const snapshot = buildLocalDashboardSnapshot(backup, new Date("2026-09-01T10:00:00+03:00"));
  assert.equal(snapshot.source, "onedrive-local");
  assert.equal(snapshot.planPriorities.overdueCount, 1);
  assert.equal(snapshot.attentionCount, 1);
  const promotedReason = snapshot.attentionRows[0].needs.find((n) => n.type === "promoted").reasons[0];
  assert.equal(promotedReason, "مقررات لم تُجتز بعد: ريض");
  assert.equal(priorityScore(snapshot.attentionRows[0].needs), 115);
  assert.equal(priorityLevel(115), "high");
});
