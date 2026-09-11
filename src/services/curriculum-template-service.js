// استيراد قالب المقررات (شيتا "الصناعي" و"التجاري") من نفس ملف كشف
// المدرسة الشامل — اختياري تمامًا: لو الشيتان غير موجودين بالملف، لا يتأثر
// بقية الاستيراد (الطلبة/المعلمين/المرفعين) ويبقى قالب المقررات المحفوظ
// كما هو. هذا يلغي الحاجة لطلب تحديث الكود يدويًا كل مرة يصدر ملف
// "المقررات.xlsx" محدَّث — يكفي إضافة شيتيه لملف كشف المدرسة الشامل.
import { list, bulkPut } from "./cloud-runtime.js";
import { logAuditEvent } from "../modules/audit/audit-service.js?v=2026-09-11-curriculum-import-1";

const clean = (value) => String(value ?? "").replace(/[‎‏‪-‮]/g, "").trim();

const TRACKS = ["الصناعي", "التجاري"];
const TERM_COUNT = 6;

function parseTrackSheet(rows) {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];
  const departments = [];
  for (const row of dataRows) {
    if (!row) continue;
    const department = clean(row[0]);
    if (!department) continue;
    const type = clean(row[1]);
    const codes = Array.from({ length: TERM_COUNT }, (_, i) => clean(row[2 + i]));
    departments.push({ department, type, codes });
  }
  return departments;
}

// يرجّع {} لو ما فيه أي شيت من الشيتين بالملف — تمييز متعمَّد عن "شيت
// موجود لكن فارغ" حتى تقدر شاشة الاستيراد تعرض حالة واضحة (سيُحدَّث/لن
// يتغيّر) بدل افتراض غامض.
export function parseCurriculumTemplateSheets(sheets) {
  const templates = {};
  for (const track of TRACKS) {
    if (!sheets[track]) continue;
    const departments = parseTrackSheet(sheets[track]);
    if (departments.length) templates[track] = departments;
  }
  return templates;
}

export async function commitCurriculumTemplates(templates) {
  const tracks = Object.keys(templates);
  if (!tracks.length) return { updatedTracks: [] };
  const records = tracks.map((track) => ({ id: track, departments: templates[track] }));
  await bulkPut("curriculumTemplates", records);
  await logAuditEvent("import_curriculum_template", { tableName: "curriculumTemplates", count: records.length });
  return { updatedTracks: tracks };
}

export async function loadCurriculumTemplates() {
  const rows = await list("curriculumTemplates");
  const templates = {};
  for (const row of rows) templates[row.id] = row.departments || [];
  return templates;
}
