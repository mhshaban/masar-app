import { list as listAll, get, save, bulkPut, remove } from "../../services/cloud-runtime.js";
import { readWorkbook } from "../../services/xlsx-parser.js";
import { extractPdfRows } from "../../services/pdf-parser.js";
import { parseCertificateRows } from "./certificate-parser.js";
import { isEncodedAbsenceScore, gradeRowPct } from "./score-conventions.js";
import { ensureStudentsSeeded } from "../../services/students-source.js";

const HEADER_ALIASES = {
  studentId: ["رقم الطالب", "الرقم الاكاديمي", "الرقم الأكاديمي"],
  studentName: ["اسم الطالب"],
  score: ["الدرجة"],
  subjectCode: ["رمز المقرر"],
  subjectName: ["اسم المقرر"],
  maxScore: ["الدرجة النهائية"],
  subjectType: ["نوع المقرر"],
  percentage: ["النسبة"],
};

function cleanHeaderText(cell) {
  return String(cell ?? "")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .trim();
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

export async function parseGradesFile(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const sheetName = sheetNames.find((n) => n.includes("درجات")) || sheetNames[0];
  const rows = sheets[sheetName] || [];
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) throw new Error("الملف فارغ.");

  const cols = detectColumns(headerRow);
  if (cols.studentId === undefined || cols.score === undefined) {
    throw new Error("تعذّر التعرّف على أعمدة الملف — تأكد من وجود عمودي 'رقم الطالب' و'الدرجة' في الصف الأول.");
  }

  await ensureStudentsSeeded();
  const students = await listAll("students");
  const byAcademicId = new Map(students.map((s) => [String(s.academicId), s]));

  const parsed = dataRows
    .filter((r) => r && r[cols.studentId] != null)
    .map((r) => {
      const studentId = String(r[cols.studentId]).trim();
      const student = byAcademicId.get(studentId);
      const rawScore = cols.score !== undefined ? r[cols.score] : null;
      const isEncodedAbsence = rawScore != null && isEncodedAbsenceScore(rawScore);
      return {
        studentId,
        fileStudentName: cols.studentName !== undefined ? r[cols.studentName] : null,
        matchedStudentName: student ? student.name : null,
        matchStatus: student ? "matched" : "unmatched",
        score: isEncodedAbsence ? null : rawScore,
        scoreStatus: isEncodedAbsence ? "absent" : null,
        maxScore: cols.maxScore !== undefined ? r[cols.maxScore] : null,
        subjectCode: cols.subjectCode !== undefined ? r[cols.subjectCode] : null,
        subjectName: cols.subjectName !== undefined ? r[cols.subjectName] : null,
        subjectType: cols.subjectType !== undefined ? r[cols.subjectType] : null,
        percentage: cols.percentage !== undefined ? r[cols.percentage] : null,
      };
    });

  return { sheetName, rows: parsed };
}

// Parses a batch of official student certificate PDFs (سجل الطالب الدراسي).
// Each certificate holds one student's full transcript across both terms, so
// a single file expands into many grade rows (one per subject per term).
export async function parseCertificateFiles(files) {
  await ensureStudentsSeeded();
  const students = await listAll("students");
  const byAcademicId = new Map(students.map((s) => [String(s.academicId), s]));

  const rows = [];
  const termSummaries = [];
  const fileSummaries = [];
  for (const file of files) {
    try {
      const rawRows = await extractPdfRows(file);
      const cert = parseCertificateRows(rawRows);
      if (!cert.academicId) {
        fileSummaries.push({ fileName: file.name, ok: false, error: "تعذّر إيجاد رقم الطالب داخل الملف." });
        continue;
      }
      const student = byAcademicId.get(cert.academicId);
      const matchStatus = student ? "matched" : "unmatched";
      let subjectCount = 0;
      for (const term of cert.terms) {
        for (const subject of term.subjects) {
          subjectCount += 1;
          rows.push({
            studentId: cert.academicId,
            fileStudentName: cert.studentName,
            matchedStudentName: student ? student.name : null,
            matchStatus,
            subjectCode: subject.code,
            subjectName: subject.name,
            hours: subject.hours,
            score: subject.score,
            scoreStatus: subject.scoreStatus,
            notes: subject.notes,
            term: term.label,
            fileName: file.name,
          });
        }
        // The certificate states its own official term average + rating —
        // captured separately from the per-subject rows so it isn't lost;
        // it's a more authoritative number than re-averaging subject scores
        // (the official figure is hours-weighted, ours would not be).
        if (term.average != null) {
          termSummaries.push({
            studentId: cert.academicId,
            matchStatus,
            term: term.label,
            averagePct: term.average,
            rating: term.rating || null,
          });
        }
      }
      fileSummaries.push({ fileName: file.name, ok: true, academicId: cert.academicId, studentName: cert.studentName, subjectCount });
    } catch (err) {
      fileSummaries.push({ fileName: file.name, ok: false, error: err.message });
    }
  }

  return { rows, termSummaries, fileSummaries };
}

export async function commitImportBatch(rows, meta, termSummaries = []) {
  const matched = rows.filter((r) => r.matchStatus === "matched");
  const batchId = `gradebatch-${Date.now().toString(36)}`;

  const gradeRecords = matched.map((r, i) => ({
    id: `${batchId}-g${i}`,
    studentId: r.studentId,
    subjectCode: r.subjectCode,
    subjectName: r.subjectName ?? null,
    subjectType: r.subjectType,
    hours: r.hours ?? null,
    score: r.score,
    scoreStatus: r.scoreStatus ?? null,
    maxScore: r.maxScore ?? null,
    percentage: r.percentage ?? null,
    notes: r.notes ?? null,
    term: r.term ?? meta.term,
    sourceBatchId: batchId,
  }));
  await bulkPut("grades", gradeRecords);

  const matchedTerms = termSummaries.filter((t) => t.matchStatus === "matched");
  if (matchedTerms.length) {
    const termRecords = matchedTerms.map((t, i) => ({
      id: `${batchId}-t${i}`,
      studentId: t.studentId,
      term: t.term,
      averagePct: t.averagePct,
      rating: t.rating,
      sourceBatchId: batchId,
    }));
    await bulkPut("termAverages", termRecords);
  }

  const batch = {
    id: batchId,
    fileName: meta.fileName,
    term: meta.term,
    importedAt: new Date().toISOString(),
    totalRows: rows.length,
    matchedCount: matched.length,
    unmatchedCount: rows.length - matched.length,
    status: "Committed",
  };
  await save("importBatches", batch);
  return batch;
}

export async function listBatches() {
  const batches = await listAll("importBatches");
  return batches.sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
}

export async function rollbackBatch(batchId) {
  const grades = await listAll("grades");
  for (const g of grades.filter((g) => g.sourceBatchId === batchId)) {
    await remove("grades", g.id);
  }
  const termAverages = await listAll("termAverages");
  for (const t of termAverages.filter((t) => t.sourceBatchId === batchId)) {
    await remove("termAverages", t.id);
  }
  const batch = await get("importBatches", batchId);
  if (batch) await save("importBatches", { ...batch, status: "RolledBack" });
}

export async function listGradesForStudent(studentId) {
  const grades = await listAll("grades");
  return grades.filter((g) => g.studentId === String(studentId));
}

export async function getGradeStats() {
  const grades = await listAll("grades");
  const bySubject = new Map();
  for (const g of grades) {
    const key = g.subjectCode || "غير محدد";
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(g);
  }
  // Grades with no recorded score (e.g. "غائب" / absent) are counted but excluded
  // from averages — an absence isn't a 0% and shouldn't drag the average down.
  const graded = grades.filter((g) => g.score != null);

  const subjectStats = [...bySubject.entries()]
    .map(([code, list]) => {
      const withScore = list.filter((g) => g.score != null);
      const avg = withScore.length ? withScore.reduce((sum, g) => sum + gradeRowPct(g), 0) / withScore.length : null;
      return { code, count: list.length, avgPct: avg != null ? Math.round(avg * 100) : null };
    })
    .sort((a, b) => (a.avgPct ?? -1) - (b.avgPct ?? -1));

  const overallAvg = graded.length
    ? Math.round((graded.reduce((sum, g) => sum + gradeRowPct(g), 0) / graded.length) * 100)
    : 0;

  return { total: grades.length, overallAvg, subjectStats };
}
