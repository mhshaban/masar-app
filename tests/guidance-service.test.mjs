import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { listStaleOpenCases } from "../src/modules/cases/guidance-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

test("listStaleOpenCases flags an open case whose last session is older than the threshold", async () => {
  await bulkPut("guidanceCases", [
    { id: "c1", studentId: "s1", status: "open", openedDate: daysAgo(30) },
  ]);
  await bulkPut("caseSessions", [
    { id: "sess1", caseId: "c1", date: daysAgo(20) },
  ]);

  const stale = await listStaleOpenCases(14);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].id, "c1");
  assert.equal(stale[0].lastActivity, daysAgo(20));
});

test("listStaleOpenCases uses openedDate as the activity baseline when a case has no sessions yet", async () => {
  await bulkPut("guidanceCases", [{ id: "c1", studentId: "s1", status: "open", openedDate: daysAgo(30) }]);
  const stale = await listStaleOpenCases(14);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].lastActivity, daysAgo(30));
});

test("listStaleOpenCases excludes a case with a recent session, and never includes a closed case", async () => {
  await bulkPut("guidanceCases", [
    { id: "recent", studentId: "s1", status: "open", openedDate: daysAgo(30) },
    { id: "closed", studentId: "s2", status: "closed", openedDate: daysAgo(60) },
  ]);
  await bulkPut("caseSessions", [{ id: "sess1", caseId: "recent", date: daysAgo(2) }]);

  const stale = await listStaleOpenCases(14);
  assert.equal(stale.length, 0);
});

test("listStaleOpenCases sorts the most-neglected case first", async () => {
  await bulkPut("guidanceCases", [
    { id: "less-stale", studentId: "s1", status: "open", openedDate: daysAgo(15) },
    { id: "more-stale", studentId: "s2", status: "open", openedDate: daysAgo(40) },
  ]);

  const stale = await listStaleOpenCases(14);
  assert.deepEqual(stale.map((c) => c.id), ["more-stale", "less-stale"]);
});
