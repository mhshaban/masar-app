import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear, get, list } from "../src/services/cloud-runtime.js";
import { commitImportBatch, rollbackBatch, listGradesForStudent, getGradeStats, buildGradesExportRows } from "../src/modules/grades/grades-import-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("commitImportBatch only persists matched rows, and records the batch counts", async () => {
  const rows = [
    { studentId: "111", matchStatus: "matched", subjectCode: "MATH", score: 80, maxScore: 100, term: null },
    { studentId: "222", matchStatus: "unmatched", subjectCode: "SCI", score: 70, maxScore: 100, term: null },
  ];
  const batch = await commitImportBatch(rows, { fileName: "f.xlsx", term: "2025-1" });

  assert.equal(batch.totalRows, 2);
  assert.equal(batch.matchedCount, 1);
  assert.equal(batch.unmatchedCount, 1);
  assert.equal(batch.status, "Committed");

  const grades = await list("grades");
  assert.equal(grades.length, 1);
  assert.equal(grades[0].studentId, "111");
  assert.equal(grades[0].term, "2025-1");
  assert.equal(grades[0].sourceBatchId, batch.id);
});

test("rollbackBatch removes every grade from that batch and marks it rolled back", async () => {
  const rows = [
    { studentId: "111", matchStatus: "matched", subjectCode: "MATH", score: 80, maxScore: 100, term: "2025-1" },
    { studentId: "222", matchStatus: "matched", subjectCode: "SCI", score: 70, maxScore: 100, term: "2025-1" },
  ];
  const batch = await commitImportBatch(rows, { fileName: "f.xlsx", term: "2025-1" });
  assert.equal((await listGradesForStudent("111")).length, 1);

  await rollbackBatch(batch.id);

  assert.equal((await listGradesForStudent("111")).length, 0);
  assert.equal((await listGradesForStudent("222")).length, 0);
  const batchAfter = await get("importBatches", batch.id);
  assert.equal(batchAfter.status, "RolledBack");
});

test("getGradeStats excludes absent/barred rows (null score) from averages but keeps them in the count", async () => {
  await bulkPut("grades", [
    { id: "g1", subjectCode: "A", score: 80, maxScore: 100, percentage: null },
    { id: "g2", subjectCode: "A", score: null, scoreStatus: "absent", maxScore: 100, percentage: null },
    { id: "g3", subjectCode: "B", score: 45, maxScore: 50, percentage: null },
    { id: "g4", subjectCode: "B", score: 90, maxScore: 100, percentage: 0.95 },
  ]);

  const stats = await getGradeStats();
  assert.equal(stats.total, 4);

  const subjectA = stats.subjectStats.find((s) => s.code === "A");
  assert.equal(subjectA.count, 2);
  assert.equal(subjectA.avgPct, 80);

  const subjectB = stats.subjectStats.find((s) => s.code === "B");
  assert.equal(subjectB.count, 2);
  assert.equal(subjectB.avgPct, 93);

  assert.equal(stats.overallAvg, 88);
});

test("getGradeStats on an empty collection returns zeroed-out stats, not NaN", async () => {
  const stats = await getGradeStats();
  assert.equal(stats.total, 0);
  assert.equal(stats.overallAvg, 0);
  assert.deepEqual(stats.subjectStats, []);
});

test("buildGradesExportRows joins each grade with the student's name/level/section, and translates scoreStatus to Arabic", async () => {
  await bulkPut("students", [{ id: "20254220", academicId: "20254220", name: "سجاد جاسم", level: "الأول", section: "٢تلم١" }]);
  await bulkPut("grades", [
    { id: "g1", studentId: "20254220", subjectCode: "ريض801", subjectName: "الرياضيات", term: "الفصل الأول", score: 85, maxScore: 100 },
    { id: "g2", studentId: "20254220", subjectCode: "دين801", subjectName: "التربية الإسلامية", term: "الفصل الأول", score: null, scoreStatus: "absent" },
  ]);

  const rows = await buildGradesExportRows();
  assert.equal(rows.length, 2);

  const graded = rows.find((r) => r["رمز المقرر"] === "ريض801");
  assert.equal(graded["اسم الطالب"], "سجاد جاسم");
  assert.equal(graded["المستوى"], "الأول");
  assert.equal(graded["الشعبة"], "٢تلم١");
  assert.equal(graded["الدرجة"], 85);
  assert.equal(graded["النسبة"], 85);
  assert.equal(graded["الحالة"], "");

  const absent = rows.find((r) => r["رمز المقرر"] === "دين801");
  assert.equal(absent["الدرجة"], "");
  assert.equal(absent["الحالة"], "غائب");
});

test("buildGradesExportRows leaves student fields blank instead of throwing when a grade has no matching student record", async () => {
  await bulkPut("grades", [{ id: "g1", studentId: "99999999", subjectCode: "ريض801", score: 70 }]);
  const rows = await buildGradesExportRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["اسم الطالب"], "");
});
