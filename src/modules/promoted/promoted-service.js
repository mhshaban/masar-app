import { list as listAll, listWhere, get, save, bulkPut, remove } from "../../services/cloud-runtime.js";
import { readWorkbook } from "../../services/xlsx-parser.js";
import { ensureStudentsSeeded } from "../../services/students-source.js";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";
import { normalizeKey } from "../../services/text-normalize.js";

// "المرفعين" sheet inside the school's master roster workbook: students
// promoted from prep school with one or more subjects still not cleared.
// One row per pending/cleared subject, not per student.
const SHEET_NAME_HINT = "المرفع";

const HEADER_ALIASES = {
  academicId: ["الرقم الاكاديمي", "الرقم الأكاديمي"],
  studentName: ["اسم الطالب"],
  section: ["الشعبة"],
  subjectCode: ["المقرر"],
  stage: ["المرحلة"],
  prepSchool: ["المدرسة الاعدادية", "المدرسة الإعدادية"],
  status: ["حالة الطالب"],
  pendingCount: ["عدد المقررات"],
};

function cleanHeaderText(cell) {
  return String(cell ?? "").replace(/[‎‏‪-‮]/g, "").trim();
}

function detectColumns(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const text = cleanHeaderText(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(text) && map[field] === undefined) map[field] = idx;
    }
  });
  return map;
}

export function parsePromotedRows(rows, students) {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) throw new Error("شيت المرفعين فارغ.");

  const cols = detectColumns(headerRow);
  if (cols.academicId === undefined || cols.subjectCode === undefined) {
    throw new Error("تعذّر التعرّف على أعمدة شيت المرفعين — تأكد من وجود عمودي 'الرقم الاكاديمي' و'المقرر'.");
  }

  const byAcademicId = new Map(students.map((s) => [String(s.academicId), s]));

  const parsed = dataRows
    .filter((r) => r && r[cols.academicId] != null)
    .map((r) => {
      const academicId = String(r[cols.academicId]).trim();
      const student = byAcademicId.get(academicId);
      const statusRaw = cols.status !== undefined ? r[cols.status] : null;
      return {
        studentId: academicId,
        fileStudentName: cols.studentName !== undefined ? r[cols.studentName] : null,
        matchedStudentName: student ? student.name : null,
        matchStatus: student ? "matched" : "unmatched",
        section: cols.section !== undefined ? r[cols.section] : null,
        subjectCode: cols.subjectCode !== undefined ? r[cols.subjectCode] : null,
        stage: cols.stage !== undefined ? r[cols.stage] : null,
        prepSchool: cols.prepSchool !== undefined ? r[cols.prepSchool] : null,
        cleared: String(statusRaw ?? "").trim() === "اجتاز",
        pendingCount: cols.pendingCount !== undefined ? r[cols.pendingCount] : null,
      };
    });

  return parsed;
}

export async function parsePromotedFile(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const sheetName = sheetNames.find((n) => n.includes(SHEET_NAME_HINT));
  if (!sheetName) throw new Error(`تعذّر إيجاد شيت "المرفعين" داخل الملف — تأكد من رفع ملف كشف الطلاب الكامل.`);
  await ensureStudentsSeeded();
  const students = await listAll("students");
  return { sheetName, rows: parsePromotedRows(sheets[sheetName] || [], students) };
}

const promotedKey = (record) => {
  const studentId = String(record.studentId || "").trim();
  const subjectCode = String(record.subjectCode || "").trim();
  return studentId && subjectCode ? `${studentId}::${subjectCode}` : "";
};

export function analyzeHistoricalPromotedDuplicates(existing, incomingRows = []) {
  const incomingKeys = new Set(incomingRows.filter((row) => row.matchStatus === "matched").map(promotedKey));
  const groups = new Map();
  for (const record of existing) {
    const key = promotedKey(record);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const duplicateGroups = [];
  const removableRecords = [];
  const conflictGroups = [];
  for (const [key, records] of groups) {
    if (records.length < 2) continue;
    const keeper = records[records.length - 1];
    const statusValues = new Set(records.map((record) => Boolean(record.cleared)));
    const safeToMerge = incomingKeys.has(key) || statusValues.size === 1;
    const group = { key, records, keeper, duplicateCount: records.length - 1, safeToMerge };
    duplicateGroups.push(group);
    if (safeToMerge) removableRecords.push(...records.slice(0, -1));
    else conflictGroups.push(group);
  }
  return {
    duplicateGroups,
    removableRecords,
    conflictGroups,
    duplicateGroupCount: duplicateGroups.length,
    removableCount: removableRecords.length,
    conflictGroupCount: conflictGroups.length,
  };
}

export async function previewHistoricalPromotedDuplicates(incomingRows = []) {
  return analyzeHistoricalPromotedDuplicates(await listAll("promotedSubjects"), incomingRows);
}

export async function commitPromotedBatch(rows, meta) {
  const matched = rows.filter((r) => r.matchStatus === "matched");
  const batchId = `promotedbatch-${Date.now().toString(36)}`;
  const existing = await listAll("promotedSubjects");
  const duplicateAnalysis = analyzeHistoricalPromotedDuplicates(existing, rows);
  const existingByKey = new Map(existing.map((record) => [promotedKey(record), record]));
  const uniqueIncoming = new Map();
  for (const row of matched) uniqueIncoming.set(promotedKey(row), row);
  const previousRecords = [];
  const newRecordIds = [];
  const records = [...uniqueIncoming].map(([key, r], i) => {
    const previous = existingByKey.get(key);
    if (previous) previousRecords.push(previous);
    const id = previous?.id || `${batchId}-p${i}`;
    if (!previous) newRecordIds.push(id);
    return {
    id,
    studentId: r.studentId,
    subjectCode: r.subjectCode,
    stage: r.stage ?? null,
    prepSchool: r.prepSchool ?? null,
    cleared: r.cleared,
    sourceBatchId: batchId,
  }; });
  await bulkPut("promotedSubjects", records);
  for (const duplicate of duplicateAnalysis.removableRecords) await remove("promotedSubjects", duplicate.id);

  const batch = {
    id: batchId,
    fileName: meta.fileName,
    importedAt: new Date().toISOString(),
    totalRows: rows.length,
    matchedCount: matched.length,
    unmatchedCount: rows.length - matched.length,
    duplicateRowsRemoved: matched.length - uniqueIncoming.size,
    previousRecords,
    newRecordIds,
    historicalDuplicateRecords: duplicateAnalysis.removableRecords,
    historicalDuplicatesRemoved: duplicateAnalysis.removableCount,
    historicalConflictGroups: duplicateAnalysis.conflictGroupCount,
    status: "Committed",
  };
  await save("promotedImportBatches", batch);
  await logAuditEvent("import_promoted", { tableName: "promotedImportBatches", recordId: batch.id, count: records.length, historicalDuplicatesRemoved: duplicateAnalysis.removableCount });
  return batch;
}

export async function listPromotedBatches() {
  const batches = await listAll("promotedImportBatches");
  return batches.sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
}

export async function rollbackPromotedBatch(batchId) {
  const batch = await get("promotedImportBatches", batchId);
  if (batch?.newRecordIds || batch?.previousRecords) {
    for (const id of batch.newRecordIds || []) await remove("promotedSubjects", id);
    if (batch.previousRecords?.length) await bulkPut("promotedSubjects", batch.previousRecords);
    if (batch.historicalDuplicateRecords?.length) await bulkPut("promotedSubjects", batch.historicalDuplicateRecords);
  } else {
    const records = await listAll("promotedSubjects");
    for (const r of records.filter((r) => r.sourceBatchId === batchId)) await remove("promotedSubjects", r.id);
  }
  if (batch) await save("promotedImportBatches", { ...batch, status: "RolledBack" });
}

// One row per student who still has at least one uncleared prep-school
// subject — the whole point of tracking "المرفعين" is knowing who still
// needs to clear something, not the full roster of everyone ever promoted.
export async function listStudentsWithPendingSubjects() {
  const [records, students] = await Promise.all([listAll("promotedSubjects"), listAll("students")]);
  const studentById = new Map(students.map((s) => [normalizeKey(s.id), s]));
  // Imported subject rows use the academic number; roster IDs may be UUIDs.
  for (const student of students) {
    if (student.academicId) studentById.set(normalizeKey(student.academicId), student);
  }

  const byStudent = new Map();
  for (const r of records) {
    const student = studentById.get(normalizeKey(r.studentId));
    const key = student ? normalizeKey(student.academicId || student.id) : normalizeKey(r.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(r);
  }

  const rows = [];
  for (const [studentId, subjectRows] of byStudent) {
    const pending = [...new Set(subjectRows.filter((r) => !r.cleared).map((r) => String(r.subjectCode || "غير محدد")))];
    if (!pending.length) continue;
    const student = studentById.get(String(studentId));
    rows.push({
      studentId,
      studentName: student ? student.name : null,
      matched: !!student,
      level: student ? student.level : null,
      section: student ? student.section : null,
      pendingSubjects: pending,
      totalSubjects: new Set(subjectRows.map((r) => String(r.subjectCode || "غير محدد"))).size,
    });
  }

  return rows.sort((a, b) => b.pendingSubjects.length - a.pendingSubjects.length);
}

export async function getPendingSubjectsForStudent(studentId) {
  return listWhere("promotedSubjects", "studentId", String(studentId));
}
