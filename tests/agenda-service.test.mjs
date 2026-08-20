import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { getAgendaProgressSummary } from "../src/modules/agenda/agenda-service.js";

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
  assert.equal(summary.total, 3);
  assert.equal(summary.notStarted, 1);
});

test("getAgendaProgressSummary returns zeros when there are no actions yet", async () => {
  const summary = await getAgendaProgressSummary();
  assert.deepEqual(summary, { total: 0, notStarted: 0 });
});
