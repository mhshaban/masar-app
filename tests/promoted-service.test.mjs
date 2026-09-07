import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear, list, get } from "../src/services/cloud-runtime.js";
import { analyzeHistoricalPromotedDuplicates, commitPromotedBatch, rollbackPromotedBatch, listStudentsWithPendingSubjects, getPendingSubjectsForStudent } from "../src/modules/promoted/promoted-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("commitPromotedBatch only persists matched rows and records cleared/pending status", async () => {
  const rows = [
    { studentId: "111", matchStatus: "matched", subjectCode: "دين", cleared: false },
    { studentId: "111", matchStatus: "matched", subjectCode: "ريض", cleared: true },
    { studentId: "222", matchStatus: "unmatched", subjectCode: "عرب", cleared: false },
  ];
  const batch = await commitPromotedBatch(rows, { fileName: "كشف.xlsx" });

  assert.equal(batch.totalRows, 3);
  assert.equal(batch.matchedCount, 2);
  assert.equal(batch.unmatchedCount, 1);

  const records = await list("promotedSubjects");
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.studentId === "111"));
});

test("listStudentsWithPendingSubjects only surfaces students with at least one uncleared subject", async () => {
  await bulkPut("students", [
    { id: "111", name: "طالب معلّق", level: "الأول", section: "١" },
    { id: "222", name: "طالب اجتاز الكل" },
  ]);
  await bulkPut("promotedSubjects", [
    { id: "p1", studentId: "111", subjectCode: "دين", cleared: false },
    { id: "p2", studentId: "111", subjectCode: "ريض", cleared: true },
    { id: "p3", studentId: "222", subjectCode: "عرب", cleared: true },
  ]);

  const rows = await listStudentsWithPendingSubjects();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentId, "111");
  assert.deepEqual(rows[0].pendingSubjects, ["دين"]);
  assert.equal(rows[0].totalSubjects, 2);
});

test("rollbackPromotedBatch removes only that batch's records and marks it rolled back", async () => {
  const rows = [{ studentId: "111", matchStatus: "matched", subjectCode: "دين", cleared: false }];
  const batch = await commitPromotedBatch(rows, { fileName: "كشف.xlsx" });

  await rollbackPromotedBatch(batch.id);

  assert.equal((await getPendingSubjectsForStudent("111")).length, 0);
  const batchAfter = await get("promotedImportBatches", batch.id);
  assert.equal(batchAfter.status, "RolledBack");
});

test("getPendingSubjectsForStudent returns every subject row (cleared and pending) for that student only", async () => {
  await bulkPut("promotedSubjects", [
    { id: "p1", studentId: "111", subjectCode: "دين", cleared: false },
    { id: "p2", studentId: "222", subjectCode: "ريض", cleared: false },
  ]);
  const rows = await getPendingSubjectsForStudent("111");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subjectCode, "دين");
});

test("pending list joins academic numbers to UUID roster records and flags unmatched rows without deleting them", async () => {
  await bulkPut("students", [{ id: "roster-uuid", academicId: "20234450", name: "طالب حالي", section: "٥ديز١", level: "الثالث" }]);
  await bulkPut("promotedSubjects", [
    { id: "a", studentId: "٢٠٢٣٤٤٥٠", subjectCode: "ريض813", cleared: false },
    { id: "b", studentId: "roster-uuid", subjectCode: "ريض813", cleared: false },
    { id: "c", studentId: "20230000", subjectCode: "عرب801", cleared: false },
  ]);
  const rows = await listStudentsWithPendingSubjects();
  assert.equal(rows.length, 2);
  const current = rows.find((row) => row.matched);
  assert.equal(current.studentName, "طالب حالي");
  assert.equal(current.studentId, "20234450");
  assert.equal(current.section, "٥ديز١");
  assert.deepEqual(current.pendingSubjects, ["ريض813"]);
  assert.equal(rows.find((row) => !row.matched).studentId, "20230000");
  assert.equal((await list("promotedSubjects")).length, 3);
});

test("historical duplicate analysis removes safe copies but leaves an unresolved status conflict", () => {
  const existing = [
    { id: "p1", studentId: "111", subjectCode: "دين", cleared: false },
    { id: "p2", studentId: "111", subjectCode: "دين", cleared: false },
    { id: "p3", studentId: "222", subjectCode: "ريض", cleared: false },
    { id: "p4", studentId: "222", subjectCode: "ريض", cleared: true },
  ];
  const result = analyzeHistoricalPromotedDuplicates(existing, []);
  assert.equal(result.duplicateGroupCount, 2);
  assert.deepEqual(result.removableRecords.map((record) => record.id), ["p1"]);
  assert.equal(result.conflictGroupCount, 1);
});

test("commit removes old duplicates covered by the incoming file and rollback restores them", async () => {
  await bulkPut("promotedSubjects", [
    { id: "p1", studentId: "111", subjectCode: "دين", cleared: false },
    { id: "p2", studentId: "111", subjectCode: "دين", cleared: true },
  ]);
  const batch = await commitPromotedBatch([
    { studentId: "111", matchStatus: "matched", subjectCode: "دين", cleared: false },
  ], { fileName: "كشف.xlsx" });
  assert.equal(batch.historicalDuplicatesRemoved, 1);
  assert.equal((await list("promotedSubjects")).length, 1);
  assert.equal((await list("promotedSubjects"))[0].cleared, false);
  await rollbackPromotedBatch(batch.id);
  assert.equal((await list("promotedSubjects")).length, 2);
});
