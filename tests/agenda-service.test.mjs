import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { getAgendaProgressSummary, listAgendaEntries, groupByPeriod } from "../src/modules/agenda/agenda-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("getAgendaProgressSummary counts total actions and how many have not been started, from actionProgress status", async () => {
  await bulkPut("departmentPlanProjects", [
    { id: "p1", pillar: "القيادة", project_title: "م", actions: [{ no: 1, action: "أ" }, { no: 2, action: "ب" }, { no: 3, action: "ج" }] },
  ]);
  await bulkPut("actionProgress", [
    { id: "p1-a1", status: "done" },
    { id: "p1-a2", status: "ongoing" },
    // p1-a3 has no progress record at all — DEFAULT_PROGRESS.status is "not_started"
  ]);

  const summary = await getAgendaProgressSummary();
  assert.deepEqual(summary, { total: 3, done: 1, ongoing: 1, notStarted: 1 });
});

test("getAgendaProgressSummary returns zeros when there are no actions yet", async () => {
  const summary = await getAgendaProgressSummary();
  assert.deepEqual(summary, { total: 0, done: 0, ongoing: 0, notStarted: 0 });
});

test("listAgendaEntries includes projectId/no explicitly on each entry, not just the combined id string (project ids can contain '-', making id-splitting unreliable)", async () => {
  await bulkPut("departmentPlanProjects", [
    { id: "abc-123-def", pillar: "القيادة", project_title: "م", actions: [{ no: 7, action: "أ" }] },
  ]);
  const entries = await listAgendaEntries();
  assert.equal(entries[0].projectId, "abc-123-def");
  assert.equal(entries[0].no, 7);
});

test("groupByPeriod orders groups chronologically by their earliest periodStart, not by the order actions appear in the file (real bug reported by the counselor)", async () => {
  await bulkPut("departmentPlanProjects", [
    {
      id: "p1",
      pillar: "القيادة",
      project_title: "م",
      actions: [
        // بالملف الأصلي "20 سبتمبر" يظهر قبل "الأسبوع الثاني من سبتمبر" رغم
        // إنه أبكر منه فعليًا — هذا بالضبط الخلل المُبلَّغ عنه.
        { no: 1, action: "متأخر بالنص لكنه أبكر فعليًا", period: "20 سبتمبر", periodStart: "2026-09-05" },
        { no: 2, action: "أول بالنص لكنه أبكر فعليًا", period: "الأسبوع الثاني من سبتمبر", periodStart: "2026-09-08" },
      ],
    },
  ]);

  const entries = await listAgendaEntries();
  const groups = await groupByPeriod(entries);
  assert.deepEqual([...groups.keys()], ["20 سبتمبر", "الأسبوع الثاني من سبتمبر"]);
});

test("groupByPeriod pushes every group with no dated action into a separate, always-last bucket, instead of mixing them with dated groups", async () => {
  await bulkPut("departmentPlanProjects", [
    {
      id: "p1",
      pillar: "القيادة",
      project_title: "م",
      actions: [
        { no: 1, action: "غير مؤرَّخ", period: "طوال العام الدراسي" },
        { no: 2, action: "مؤرَّخ متأخر", period: "لاحقًا", periodStart: "2026-12-01" },
      ],
    },
  ]);

  const entries = await listAgendaEntries();
  const groups = await groupByPeriod(entries);
  const keys = [...groups.keys()];
  assert.deepEqual(keys, ["لاحقًا", "طوال العام الدراسي"], "the dated group must sort before the undated one regardless of insertion order");
});

test("listAgendaEntries passes periodStart/periodEnd through from the action record", async () => {
  await bulkPut("departmentPlanProjects", [
    { id: "p1", pillar: "القيادة", project_title: "م", actions: [{ no: 1, action: "أ", periodStart: "2026-09-01", periodEnd: "2026-09-10" }] },
  ]);
  const entries = await listAgendaEntries();
  assert.equal(entries[0].periodStart, "2026-09-01");
  assert.equal(entries[0].periodEnd, "2026-09-10");
});
