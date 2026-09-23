// تحديث معدلات الطلبة (academicFlags/termAverages) من شيتات "درجات
// المقررات"/"المعدلات الفصلية"/"المعدلات السنوية" بملف كشف الطلاب — مصدر
// واحد فقط بدل مسح شهادات PDF من مجلد "مسار" المحلي (قرار المرشد الصريح:
// هذه الشيتات نفسها مستخرجة من نفس الشهادات الرسمية بأداة خارجية، فلا داعي
// لمصدرين مختلفين قد يتعارضا). راجع README قسم "استيراد الدرجات والشهادات".
//
// كل شيت يغطي أرشيفًا كاملًا متعدد السنوات لا سنة واحدة فقط (نفس الطالب قد
// يتكرر بعدة سنوات دراسية) — لذلك عنوان الفصل هنا يضم السنة صراحة (بعكس شهادة
// PDF المفردة اللي كانت تحمل هذا التمييز ضمنيًا بنص الشهادة نفسه)، ومعدل
// "المعدل التراكمي السنوي" يُعتمد من أحدث سنة دراسية للطالب فقط (وليس كل
// السنوات) لأنه يمثّل معدله التراكمي الحالي لا مجموع سنواته.
import { subjectKeyForGrade } from "../../scripts/lib/subject-groups.mjs";
import { gradeRowPct, isEncodedAbsenceScore } from "../../scripts/lib/score-conventions.mjs";
import { readWorkbook } from "./xlsx-parser.js";

const COURSE_GRADES_SHEET_HINT = "درجات المقررات";
const TERM_AVERAGES_SHEET_HINT = "المعدلات الفصلية";
const ANNUAL_AVERAGES_SHEET_HINT = "المعدلات السنوية";

const COURSE_HEADER_ALIASES = {
  studentId: ["رقم الطالب"],
  year: ["السنة الدراسية"],
  termName: ["الفصل الدراسي"],
  level: ["المستوى", "المستوي"],
  subjectCode: ["رمز المقرر"],
  subjectName: ["اسم المقرر"],
  score: ["الدرجة"],
  sourceFile: ["الملف المصدر"],
};

const TERM_AVERAGE_HEADER_ALIASES = {
  studentId: ["رقم الطالب"],
  year: ["السنة الدراسية"],
  termName: ["الفصل الدراسي"],
  level: ["المستوى", "المستوي"],
  averagePct: ["المعدل الفصلي"],
  rating: ["التقدير"],
};

const ANNUAL_AVERAGE_HEADER_ALIASES = {
  studentId: ["رقم الطالب"],
  year: ["السنة الدراسية"],
  finalCumulativeAverage: ["المعدل التراكمي السنوي"],
};

// نفس الاصطلاح المدرسي الحرفي لغياب/حرمان الدرجة، مطبَّق أيضًا بشهادات PDF
// وملفات الوقفة التقويمية (score-conventions.mjs) — هذا الشيت يكتبها
// صراحة كنص أحيانًا بدل الترميز الرقمي، فنتعرّف الحالتين معًا.
const SCORE_STATUS_LABELS = { "غائب": "absent", "محروم": "barred" };

function cleanHeader(value) {
  return String(value ?? "").replace(/[‎‏‪-‮]/g, "").trim();
}

function detectColumns(headerRow, aliases) {
  const columns = {};
  (headerRow || []).forEach((cell, index) => {
    const header = cleanHeader(cell);
    for (const [field, fieldAliases] of Object.entries(aliases)) {
      if (columns[field] === undefined && fieldAliases.includes(header)) columns[field] = index;
    }
  });
  return columns;
}

function toText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function toPercentFromFraction(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 10 : null;
}

// عنوان فصل يضم الفصل/المستوى/السنة صراحة — يبقى فريدًا عبر كل سنوات
// الأرشيف (بعكس "الأول"/"الثاني" وحدها)، ومتوافق مع الصيغة اللي يتوقعها
// certificateTermOrder (grades/curriculum-results.js) لفرز الجدول الزمني:
// يحتاج "الفصل الدراسي <الاول|الثاني|الثالث|الصيفي>"، "المستوي <الاول|...>"،
// وسنة أربع أرقام، بأي ترتيب بالنص.
function buildTermLabel({ termName, level, year }) {
  return `الفصل الدراسي ${termName || "غير محدد"} — ${level || "غير محدد"} — العام الدراسي ${year || "غير محدد"}`;
}

function parseScoreCell(raw) {
  if (raw == null || raw === "") return { score: null, scoreStatus: null };
  const text = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const num = Number(text);
    return isEncodedAbsenceScore(num) ? { score: null, scoreStatus: "absent" } : { score: num, scoreStatus: null };
  }
  return { score: null, scoreStatus: SCORE_STATUS_LABELS[text] || null };
}

// شيت "درجات المقررات" → صفوف درجة موحّدة (نفس شكل unifiedRow اللي كانت
// تُبنى من شهادات PDF)، صف لكل مقرر لكل فصل لكل سنة — بلا أي تجميع هنا.
export function parseCourseGradeRows(rows) {
  if (!rows || !rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const columns = detectColumns(headerRow, COURSE_HEADER_ALIASES);
  if (columns.studentId === undefined || columns.score === undefined) return [];
  const result = [];
  for (const row of dataRows) {
    if (!row) continue;
    const studentId = toText(row[columns.studentId]);
    if (!studentId) continue;
    const { score, scoreStatus } = parseScoreCell(row[columns.score]);
    result.push({
      studentId,
      subjectCode: toText(row[columns.subjectCode]),
      subjectName: toText(row[columns.subjectName]),
      score,
      scoreStatus,
      term: buildTermLabel({
        termName: toText(row[columns.termName]),
        level: toText(row[columns.level]),
        year: toText(row[columns.year]),
      }),
      sourceFile: toText(row[columns.sourceFile]),
    });
  }
  return result;
}

// شيت "المعدلات الفصلية" → معدل فصلي لكل طالب/فصل/سنة. "المعدل الفصلي"
// بالملف كسر عشري (0.911) لا نسبة مئوية — يُحوَّل هنا ×100 كل الشاشات
// تعرضه وتقارنه كنسبة مئوية (FAIL_THRESHOLD_PCT بـgrade-flags-service.js
// وغيرها).
export function parseTermAverageRows(rows) {
  if (!rows || !rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const columns = detectColumns(headerRow, TERM_AVERAGE_HEADER_ALIASES);
  if (columns.studentId === undefined || columns.averagePct === undefined) return [];
  const result = [];
  for (const row of dataRows) {
    if (!row) continue;
    const studentId = toText(row[columns.studentId]);
    const averagePct = toPercentFromFraction(row[columns.averagePct]);
    if (!studentId || averagePct == null) continue;
    result.push({
      studentId,
      term: buildTermLabel({
        termName: toText(row[columns.termName]),
        level: toText(row[columns.level]),
        year: toText(row[columns.year]),
      }),
      averagePct,
      rating: toText(row[columns.rating]),
    });
  }
  return result;
}

// شيت "المعدلات السنوية" → معدل تراكمي نهائي واحد لكل طالب: أحدث سنة
// دراسية له فقط (الطالب اللي له أكثر من سنة بالأرشيف — أعاد مستوى مثلًا —
// معدله التراكمي "الحالي" هو معدل آخر سنة له لا كل سنواته). نفس تحويل
// الكسر إلى نسبة مئوية.
export function parseAnnualAverageRows(rows) {
  if (!rows || !rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const columns = detectColumns(headerRow, ANNUAL_AVERAGE_HEADER_ALIASES);
  if (columns.studentId === undefined || columns.finalCumulativeAverage === undefined) return [];
  const latestByStudent = new Map();
  for (const row of dataRows) {
    if (!row) continue;
    const studentId = toText(row[columns.studentId]);
    const finalCumulativeAverage = toPercentFromFraction(row[columns.finalCumulativeAverage]);
    if (!studentId || finalCumulativeAverage == null) continue;
    const year = toText(row[columns.year]) || "";
    const existing = latestByStudent.get(studentId);
    if (!existing || year > existing.year) latestByStudent.set(studentId, { studentId, year, finalCumulativeAverage });
  }
  return [...latestByStudent.values()];
}

export async function parseAcademicAveragesWorkbook(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const courseSheetName = sheetNames.find((n) => n.includes(COURSE_GRADES_SHEET_HINT));
  const termSheetName = sheetNames.find((n) => n.includes(TERM_AVERAGES_SHEET_HINT));
  const annualSheetName = sheetNames.find((n) => n.includes(ANNUAL_AVERAGES_SHEET_HINT));
  if (!courseSheetName || !termSheetName || !annualSheetName) {
    throw new Error(`تعذّر إيجاد الشيتات المطلوبة داخل الملف: ${[
      !courseSheetName && COURSE_GRADES_SHEET_HINT,
      !termSheetName && TERM_AVERAGES_SHEET_HINT,
      !annualSheetName && ANNUAL_AVERAGES_SHEET_HINT,
    ].filter(Boolean).join("، ")}.`);
  }
  return {
    rows: parseCourseGradeRows(sheets[courseSheetName] || []),
    termSummaries: parseTermAverageRows(sheets[termSheetName] || []),
    finalCumulativeSummaries: parseAnnualAverageRows(sheets[annualSheetName] || []),
  };
}

function aggregateStudent(studentId, rows) {
  const graded = rows.filter((r) => r.score != null);
  const overallPct = graded.length
    ? Math.round((graded.reduce((sum, r) => sum + gradeRowPct(r), 0) / graded.length) * 100)
    : null;

  const bySubject = new Map();
  for (const r of graded) {
    const key = subjectKeyForGrade(r);
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(r);
  }
  const subjects = [...bySubject.entries()].map(([subject, subjectRows]) => ({
    subject,
    pct: Math.round((subjectRows.reduce((sum, r) => sum + gradeRowPct(r), 0) / subjectRows.length) * 100),
  }));

  return {
    id: studentId,
    studentId,
    overallPct,
    subjects,
    absentCount: rows.filter((r) => r.scoreStatus === "absent").length,
    barredCount: rows.filter((r) => r.scoreStatus === "barred").length,
    computedAt: new Date().toISOString(),
  };
}

// يبني academicFlags/termAverages من صفوف مُحلَّلة مسبقًا (بدل ملف Excel
// حقيقي) — قابل للاختبار بلا XLSX أو FileReader. نفس شكل ومنطق
// buildAcademicAverages القديم (شهادات PDF) تمامًا، فلا يتغيّر أي مستهلك
// لاحق (grade-flags-service.js وغيره) بلا داعٍ.
export function buildAcademicAverages({ rows: allRows, termSummaries, finalCumulativeSummaries }, students) {
  const byAcademicId = new Map(students.filter((s) => s.academicId).map((s) => [String(s.academicId), s]));

  const matchedRows = allRows.filter((r) => byAcademicId.has(String(r.studentId)));
  const unmatchedIds = new Set(allRows.filter((r) => !byAcademicId.has(String(r.studentId))).map((r) => r.studentId));
  const matchedTerms = termSummaries.filter((t) => byAcademicId.has(String(t.studentId)));
  const matchedFinalCumulative = finalCumulativeSummaries.filter((t) => byAcademicId.has(String(t.studentId)));

  const rowsByStudent = new Map();
  for (const r of matchedRows) {
    const id = String(r.studentId);
    if (!rowsByStudent.has(id)) rowsByStudent.set(id, []);
    rowsByStudent.get(id).push(r);
  }

  const finalCumulativeByStudent = new Map();
  for (const item of matchedFinalCumulative) finalCumulativeByStudent.set(String(item.studentId), item);

  const academicFlagsRecords = [...rowsByStudent.entries()].map(([studentId, rows]) => ({
    ...aggregateStudent(studentId, rows),
    finalCumulativeAverage: finalCumulativeByStudent.get(String(studentId))?.finalCumulativeAverage ?? null,
  }));

  const termAveragesByKey = new Map();
  const termConflicts = [];
  for (const t of matchedTerms) {
    const key = `${t.studentId}::${t.term}`;
    const existing = termAveragesByKey.get(key);
    if (existing && existing.averagePct !== t.averagePct) termConflicts.push({ studentId: t.studentId, term: t.term });
    termAveragesByKey.set(key, t);
  }
  const termAveragesRecords = [...termAveragesByKey.values()].map((t) => ({
    id: `${t.studentId}--${t.term}`,
    studentId: String(t.studentId),
    term: t.term,
    averagePct: t.averagePct,
    rating: t.rating,
  }));

  return {
    academicFlagsRecords,
    termAveragesRecords,
    summary: {
      courseRowsRead: allRows.length,
      termAveragesRead: termSummaries.length,
      studentsWithGrades: academicFlagsRecords.length,
      unmatchedCount: unmatchedIds.size,
      termConflictsCount: termConflicts.length,
    },
  };
}
