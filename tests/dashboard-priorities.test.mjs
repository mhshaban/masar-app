import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/fake-cloud-backend.mjs";
import { classifyPlanPriorities } from "../src/modules/dashboard/dashboard-service.js";

const entry = (id, periodStart, periodEnd, status = "not_started") => ({
  id, action: id, periodStart, periodEnd, progress: { status },
});

test("daily priorities classify overdue, next-14-days, and undated plan actions", () => {
  const now = new Date("2026-09-01T10:00:00+03:00");
  const result = classifyPlanPriorities([
    entry("overdue", "2026-08-20", "2026-08-31"),
    entry("upcoming", "2026-09-10", "2026-09-11"),
    entry("later", "2026-10-01", "2026-10-02"),
    entry("undated", null, null),
    entry("done-old", "2026-08-01", "2026-08-02", "done"),
  ], now);
  assert.deepEqual(result.overdue.map((item) => item.id), ["overdue"]);
  assert.deepEqual(result.upcoming.map((item) => item.id), ["upcoming"]);
  assert.deepEqual(result.undated.map((item) => item.id), ["undated"]);
});
