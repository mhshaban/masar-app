// نسخة Node من parseGradesFile بـsrc/modules/grades/grades-import-service.js
// (قبل نقل استيراد الدرجات لـCowork) — تكتشف نفس الأعمدة بنفس الأسماء
// البديلة، لكن بلا مطابقة طلبة هنا (تصير مركزية بالسكربت الرئيسي) وبلا أي
// اعتماد على المتصفح (FileReader/window.XLSX) — قراءة Buffer مباشرة عبر
// حزمة xlsx (SheetJS) من npm.
import XLSX from "xlsx";
import { isEncodedAbsenceScore } from "./score-conventions.mjs";

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
    .replace(/[‎‏‪-‮]/g, "")
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

// يرجّع null (لا يرمي) لو الملف ما فيه أعمدة درجات معروفة — يسمح للسكربت
// الرئيسي بتجاهل ملفات إكسل بصمت لو ما كانت فعليًا ملف درجات وقفة تقويمية
// (مثال: نسخة قديمة من ملف كشف الطلاب الكامل بالخطأ بنفس المجلد).
export function parseCheckpointWorkbook(buf) {
  const workbook = XLSX.read(buf, { type: "buffer" });
  const sheetName = workbook.SheetNames.find((n) => n.includes("درجات")) || workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return null;

  const cols = detectColumns(headerRow);
  if (cols.studentId === undefined || cols.score === undefined) return null;

  const parsed = dataRows
    .filter((r) => r && r[cols.studentId] != null)
    .map((r) => {
      const studentId = String(r[cols.studentId]).trim();
      const rawScore = cols.score !== undefined ? r[cols.score] : null;
      const isEncodedAbsence = rawScore != null && isEncodedAbsenceScore(rawScore);
      return {
        studentId,
        fileStudentName: cols.studentName !== undefined ? r[cols.studentName] : null,
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
