import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, list, clear } from "../src/services/cloud-runtime.js";
import { buildBackup, parseBackupFile, summarizeBackup, restoreBackup } from "../src/services/backup-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("buildBackup captures every collection with a timestamp and db version", async () => {
  await bulkPut("students", [{ id: "s1", name: "طالب" }]);
  await bulkPut("academicFlags", [{ id: "s1", studentId: "s1", overallPct: 90 }]);

  const backup = await buildBackup();
  assert.equal(backup.app, "masar");
  assert.ok(backup.exportedAt);
  assert.ok(backup.dbVersion);
  assert.equal(backup.collections.students.length, 1);
  assert.equal(backup.collections.academicFlags.length, 1);
  assert.equal(backup.collections.reminders.length, 0);
});

test("summarizeBackup counts records per collection", async () => {
  await bulkPut("students", [{ id: "s1" }, { id: "s2" }]);
  const backup = await buildBackup();
  const counts = summarizeBackup(backup);
  assert.equal(counts.students, 2);
  assert.equal(counts.academicFlags, 0);
});

test("parseBackupFile rejects invalid JSON and mis-shaped files", () => {
  assert.throws(() => parseBackupFile("not json"), /JSON صالحًا/);
  assert.throws(() => parseBackupFile(JSON.stringify({ app: "masar" })), /بنية نسخة احتياطية/);
});

test("parseBackupFile accepts a well-formed backup", () => {
  const raw = JSON.stringify({ app: "masar", exportedAt: "2026-01-01", collections: { students: [] } });
  const data = parseBackupFile(raw);
  assert.equal(data.app, "masar");
});

test("restoreBackup round-trips data through export and re-import", async () => {
  await bulkPut("students", [{ id: "s1", name: "أحمد" }, { id: "s2", name: "سارة" }]);
  const backup = await buildBackup();

  for (const name of COLLECTIONS) await clear(name);
  assert.equal((await list("students")).length, 0);

  await restoreBackup(backup);
  const restored = await list("students");
  assert.equal(restored.length, 2);
  assert.deepEqual(restored.map((s) => s.name).sort(), ["أحمد", "سارة"]);
});

test("restoreBackup replaces rather than merges — existing data not in the backup is wiped", async () => {
  await bulkPut("students", [{ id: "keep", name: "من النسخة" }]);
  const backup = await buildBackup();

  await bulkPut("students", [{ id: "extra", name: "بيانات لاحقة على هذا الجهاز" }]);
  assert.equal((await list("students")).length, 2);

  await restoreBackup(backup);
  const after = await list("students");
  assert.equal(after.length, 1);
  assert.equal(after[0].id, "keep");
});
