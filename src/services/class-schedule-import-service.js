// جدول الحصص لكل شعبة من شيت "الجدول الدراسي" بملف كشف الطلاب — مصدر
// واحد فقط بدل مسح مجلد "مسار" المحلي وتحليل PDF جدول الحصص هندسيًا
// (نفس القرار المتبع لاستيراد الدرجات، راجع
// academic-averages-workbook-import-service.js وREADME). جزء من رفعة
// "تحديث شامل" الواحدة — شيت اختياري، غيابه لا يوقف بقية التحديث.
import { list, bulkPut, removeMany } from "./cloud-runtime.js";
import { readWorkbook } from "./xlsx-parser.js";

const CLASS_SCHEDULE_SHEET_HINT = "الجدول الدراسي";

const HEADER_ALIASES = {
  section: ["الشعبة"],
  day: ["اليوم"],
  period: ["الحصة"],
  subjectCode: ["المقرر"],
  room: ["الغرفة"],
  teacher: ["المعلم"],
  department: ["القسم"],
  session: ["الفترة(ص-م)", "الفترة"],
};

function cleanHeader(value) {
  return String(value ?? "").replace(/[‎‏‪-‮]/g, "").trim();
}

function detectColumns(headerRow) {
  const columns = {};
  (headerRow || []).forEach((cell, index) => {
    const header = cleanHeader(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (columns[field] === undefined && aliases.includes(header)) columns[field] = index;
    }
  });
  return columns;
}

function toText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

// شيت "الجدول الدراسي" → صف واحد لكل (شعبة × يوم × حصة)، بلا أي تجميع هنا.
export function parseClassScheduleRows(rows) {
  if (!rows || !rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const columns = detectColumns(headerRow);
  if (columns.section === undefined || columns.day === undefined || columns.period === undefined) return [];
  const result = [];
  for (const row of dataRows) {
    if (!row) continue;
    const section = toText(row[columns.section]);
    const day = toText(row[columns.day]);
    const period = toText(row[columns.period]);
    if (!section || !day || !period) continue;
    result.push({
      section, day, period,
      subjectCode: toText(row[columns.subjectCode]),
      room: toText(row[columns.room]),
      teacher: toText(row[columns.teacher]),
      department: toText(row[columns.department]),
      session: toText(row[columns.session]),
    });
  }
  return result;
}

export async function parseClassScheduleWorkbook(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const sheetName = sheetNames.find((n) => n.includes(CLASS_SCHEDULE_SHEET_HINT));
  if (!sheetName) throw new Error(`تعذّر إيجاد شيت "${CLASS_SCHEDULE_SHEET_HINT}" داخل الملف.`);
  return parseClassScheduleRows(sheets[sheetName] || []);
}

// صف بلا معرّف مكرّر لنفس (شعبة × يوم × حصة) — آخر صف يُقرأ يحل محل
// السابق بهدوء (لا حالة معروفة بأرشيف مدرسي حقيقي لتكرار كهذا، بعكس
// المعدلات الفصلية اللي تحتاج تتبّع تعارض صريح).
export function buildClassScheduleRecords(rows) {
  const byId = new Map();
  for (const r of rows) {
    const id = `${r.section}--${r.day}--${r.period}`;
    byId.set(id, {
      id, section: r.section, day: r.day, period: r.period,
      subjectCode: r.subjectCode, room: r.room, teacher: r.teacher,
      department: r.department, session: r.session,
    });
  }
  return [...byId.values()];
}

// استبدال كامل لا تراكم — نفس نمط commitAcademicAverages.
export async function commitClassSchedules(records) {
  const existing = await list("classSchedules");
  await bulkPut("classSchedules", records);
  const newIds = new Set(records.map((r) => r.id));
  const stale = existing.filter((r) => !newIds.has(r.id));
  await removeMany("classSchedules", stale.map((r) => r.id));
  return { classSchedulesCount: records.length, removedClassSchedulesCount: stale.length };
}
