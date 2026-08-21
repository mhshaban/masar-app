import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear } from "../src/services/cloud-runtime.js";
import { getFollowUpReport, getStatsSummary, listUnlinkedActions } from "../src/modules/followup/followup-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);

  await bulkPut("departmentPlanProjects", [
    {
      id: "proj1",
      pillar: "الانجاز الأكاديمي",
      project_title: "مشروع",
      program_name: "برنامج",
      actions: [
        { no: 1, action: "a1", period: "" },
        { no: 2, action: "a2", period: "" },
        { no: 3, action: "a3", period: "" },
        { no: 4, action: "a4", period: "" },
        { no: 5, action: "a5", period: "" },
      ],
    },
  ]);

  await bulkPut("followUpItems", [
    { id: "item1", no: 1, title: "بند مرتبط بالكامل", section: "S1", order: 1 },
    { id: "item2", no: 2, title: "بند بلا إجراءات مرتبطة", section: "S1", order: 2, importedStatus: "done", summary: "قديم مستورد" },
    { id: "item3", no: 3, title: "بند مرتبط جزئيًا", section: "S2", order: 3 },
  ]);

  await bulkPut("actionProgress", [
    { id: "proj1-a1", status: "done", participantsCount: 10, followUpItemId: "item1", proofNote: "p1" },
    { id: "proj1-a2", status: "done", participantsCount: 5, followUpItemId: "item1", proofNote: "p2" },
    { id: "proj1-a3", status: "done", participantsCount: 3, followUpItemId: "item3", proofNote: "p3" },
    { id: "proj1-a4", status: "not_started", participantsCount: null, followUpItemId: "item3", proofNote: null },
  ]);
  // proj1-a5 is left with no actionProgress record at all — an unlinked action.
});

test("a follow-up item's status is computed as done only when every linked action is done", async () => {
  const bySection = await getFollowUpReport();
  const item1 = bySection.get("S1").find((r) => r.id === "item1");
  assert.equal(item1.status, "done");
  assert.equal(item1.totalParticipants, 15);
  assert.equal(item1.summary, "p1 · p2");
});

test("a follow-up item with no linked actions in خطة القسم shows not_started — no manual override, no fallback to the old imported status", async () => {
  const bySection = await getFollowUpReport();
  const item2 = bySection.get("S1").find((r) => r.id === "item2");
  assert.equal(item2.status, "not_started");
  assert.equal(item2.totalParticipants, 0);
  assert.equal(item2.summary, null);
  // importedStatus data survives untouched on the raw record — just unused for the computed row
  assert.equal(item2.importedStatus, "done");
});

test("a partially-done set of linked actions computes to ongoing, not done", async () => {
  const bySection = await getFollowUpReport();
  const item3 = bySection.get("S2").find((r) => r.id === "item3");
  assert.equal(item3.status, "ongoing");
  assert.equal(item3.totalParticipants, 3);
  assert.equal(item3.summary, "p3 · a4");
});

test("getStatsSummary rolls up per-section and overall completion correctly", async () => {
  const stats = await getStatsSummary();
  assert.equal(stats.totalItems, 3);
  assert.equal(stats.doneItems, 1);
  assert.equal(stats.totalParticipants, 18);
  assert.equal(stats.actionsExecuted, 3);
  assert.equal(stats.completionPct, 33);

  const s1 = stats.sections.find((s) => s.section === "S1");
  assert.equal(s1.total, 2);
  assert.equal(s1.done, 1);
  assert.equal(s1.completionPct, 50);

  const s2 = stats.sections.find((s) => s.section === "S2");
  assert.equal(s2.total, 1);
  assert.equal(s2.done, 0);
  assert.equal(s2.completionPct, 0);
});

test("listUnlinkedActions surfaces actions with no follow-up item assigned", async () => {
  const unlinked = await listUnlinkedActions();
  assert.equal(unlinked.length, 1);
  assert.equal(unlinked[0].id, "proj1-a5");
});
