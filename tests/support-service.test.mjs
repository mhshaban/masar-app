import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { listOverdueActions } from "../src/modules/support/support-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

test("listOverdueActions flags a not-done action whose dueDate has passed, on an active plan", async () => {
  await bulkPut("supportPlans", [{ id: "p1", studentId: "s1", status: "active" }]);
  await bulkPut("supportPlanActions", [
    { id: "a1", planId: "p1", action: "متأخر", status: "not_started", dueDate: daysAgo(3) },
  ]);

  const overdue = await listOverdueActions();
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].id, "a1");
  assert.equal(overdue[0].plan.id, "p1");
});

test("listOverdueActions excludes a done action even if its dueDate has passed", async () => {
  await bulkPut("supportPlans", [{ id: "p1", studentId: "s1", status: "active" }]);
  await bulkPut("supportPlanActions", [{ id: "a1", planId: "p1", action: "منجز", status: "done", dueDate: daysAgo(3) }]);
  assert.equal((await listOverdueActions()).length, 0);
});

test("listOverdueActions excludes an action with no dueDate, or a future dueDate", async () => {
  await bulkPut("supportPlans", [{ id: "p1", studentId: "s1", status: "active" }]);
  await bulkPut("supportPlanActions", [
    { id: "a1", planId: "p1", action: "بلا تاريخ", status: "not_started", dueDate: null },
    { id: "a2", planId: "p1", action: "مستقبلي", status: "not_started", dueDate: daysFromNow(3) },
  ]);
  assert.equal((await listOverdueActions()).length, 0);
});

test("listOverdueActions excludes overdue actions belonging to a completed or cancelled plan", async () => {
  await bulkPut("supportPlans", [
    { id: "p1", studentId: "s1", status: "completed" },
    { id: "p2", studentId: "s2", status: "cancelled" },
  ]);
  await bulkPut("supportPlanActions", [
    { id: "a1", planId: "p1", action: "خطة منتهية", status: "not_started", dueDate: daysAgo(3) },
    { id: "a2", planId: "p2", action: "خطة ملغاة", status: "not_started", dueDate: daysAgo(3) },
  ]);
  assert.equal((await listOverdueActions()).length, 0);
});
