import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear, list } from "../src/services/cloud-runtime.js";
import { previewStaleAcademicRecords, pruneStaleAcademicRecords } from "../src/services/school-data-import-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("academic prune previews and removes only records outside the incoming roster", async () => {
  await bulkPut("academicFlags", [
    { id: "current", studentId: "current", overallPct: 70 },
    { id: "old", studentId: "old", overallPct: 40 },
  ]);
  await bulkPut("termAverages", [
    { id: "current-t1", studentId: "current", averagePct: 70 },
    { id: "old-t1", studentId: "old", averagePct: 40 },
  ]);
  const students = [{ id: "current", name: "طالب حالي" }];
  const preview = await previewStaleAcademicRecords(students);
  assert.equal(preview.total, 2);
  const result = await pruneStaleAcademicRecords(students);
  assert.deepEqual(result, { flagsRemoved: 1, averagesRemoved: 1, totalRemoved: 2 });
  assert.deepEqual((await list("academicFlags")).map((row) => row.id), ["current"]);
  assert.deepEqual((await list("termAverages")).map((row) => row.id), ["current-t1"]);
});

test("academic prune never removes a record without a studentId", async () => {
  await bulkPut("academicFlags", [{ id: "unknown-shape", overallPct: 10 }]);
  const result = await pruneStaleAcademicRecords([]);
  assert.equal(result.totalRemoved, 0);
  assert.equal((await list("academicFlags")).length, 1);
});
