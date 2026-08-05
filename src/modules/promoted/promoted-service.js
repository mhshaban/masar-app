import { list as listAll, get, save, bulkPut, remove } from "../../services/cloud-runtime.js";
import { readWorkbook } from "../../services/xlsx-parser.js";
import { ensureStudentsSeeded } from "../../services/students-source.js";

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

export async function parsePromotedFile(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const sheetName = sheetNames.find((n) => n.includes(SHEET_NAME_HINT));
  if (!sheetName) {
    throw new Error(`تعذّر إيجاد شيت "المرفعين" داخل الملف — تأكد من رفع ملف كشف الطلاب الكامل.`);
  }
  const rows = sheets[sheetName] || [];
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) throw new Error("شيت المرفعين فارغ.");

  const cols = detectColumns(headerRow);
  if (cols.academicId === undefined || cols.subjectCode === undefined) {
    throw new Error("تعذّر التعرّف على أعمدة شيت المرفعين — تأكد من وجود عمودي 'الرقم الاكاديمي' و'المقرر'.");
  }

  await ensureStudentsSeeded();
  const students = await listAll("students");
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

  return { sheetName, rows: parsed };
}

export async function commitPromotedBatch(rows, meta) {
  const matched = rows.filter((r) => r.matchStatus === "matched");
  const batchId = `promotedbatch-${Date.now().toString(36)}`;

  const records = matched.map((r, i) => ({
    id: `${batchId}-p${i}`,
    studentId: r.studentId,
    subjectCode: r.subjectCode,
    stage: r.stage ?? null,
    prepSchool: r.prepSchool ?? null,
    cleared: r.cleared,
    sourceBatchId: batchId,
  }));
  await bulkPut("promotedSubjects", records);

  const batch = {
    id: batchId,
    fileName: meta.fileName,
    importedAt: new Date().toISOString(),
    totalRows: rows.length,
    matchedCount: matched.length,
    unmatchedCount: rows.length - matched.length,
    status: "Committed",
  };
  await save("promotedImportBatches", batch);
  return batch;
}

export async function listPromotedBatches() {
  const batches = await listAll("promotedImportBatches");
  return batches.sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
}

export async function rollbackPromotedBatch(batchId) {
  const records = await listAll("promotedSubjects");
  for (const r of records.filter((r) => r.sourceBatchId === batchId)) {
    await remove("promotedSubjects", r.id);
  }
  const batch = await get("promotedImportBatches", batchId);
  if (batch) await save("promotedImportBatches", { ...batch, status: "RolledBack" });
}

// One row per student who still has at least one uncleared prep-school
// subject — the whole point of tracking "المرفعين" is knowing who still
// needs to clear something, not the full roster of everyone ever promoted.
export async function listStudentsWithPendingSubjects() {
  const [records, students] = await Promise.all([listAll("promotedSubjects"), listAll("students")]);
  const studentById = new Map(students.map((s) => [String(s.id), s]));

  const byStudent = new Map();
  for (const r of records) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
    byStudent.get(r.studentId).push(r);
  }

  const rows = [];
  for (const [studentId, subjectRows] of byStudent) {
    const pending = subjectRows.filter((r) => !r.cleared);
    if (!pending.length) continue;
    const student = studentById.get(String(studentId));
    rows.push({
      studentId,
      studentName: student ? student.name : null,
      level: student ? student.level : null,
      section: student ? student.section : null,
      pendingSubjects: pending.map((r) => r.subjectCode),
      totalSubjects: subjectRows.length,
    });
  }

  return rows.sort((a, b) => b.pendingSubjects.length - a.pendingSubjects.length);
}

export async function getPendingSubjectsForStudent(studentId) {
  const records = await listAll("promotedSubjects");
  return records.filter((r) => r.studentId === String(studentId));
}
