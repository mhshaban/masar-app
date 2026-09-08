// استيراد سجل الطلبة من شيت "كشف الطلاب" (نفس ملف كشف الطلاب الكامل
// المستخدم لبقية الاستيرادات — المرفعين، الجدول الدراسي، الساعات المكتبية).
// حل محل التعبئة القديمة من data/students.local.json المحلي: بعد نقل مسار
// لمستودع GitHub عام (لاستضافة GitHub Pages)، ملف ثابت فيه بيانات طلاب
// حقيقية داخل نفس المستودع كان يعني أي زائر يقدر يجلبه مباشرة بدون تسجيل
// دخول — استيراد داخل التطبيق (يكتب عبر cloud-runtime.js، خلف تسجيل
// الدخول + RLS) هو البديل الآمن.
import { list, bulkPut, remove } from "./cloud-runtime.js";
import { invalidateStudentsCache } from "../modules/students/students-service.js";
import { readWorkbook } from "./xlsx-parser.js";
import { resetStudentsSeedCache } from "./students-source.js";
import { logAuditEvent } from "../modules/audit/audit-service.js?v=2026-09-04-audit-1";

const SHEET_HINT = "كشف الطلاب";

// فهرسة الأعمدة مطابقة لترويسة الشيت الفعلية بالملف الرسمي — مفحوصة صفًا
// بصف مقابل الحقول اللي كان يُنتجها seed القديم (data/students.local.json)
// للتأكد من تطابق الشكل تمامًا (نفس أسماء الحقول، نفس بنية counselor/
// weekSchedule/phones) فلا يتغيّر أي شيء بباقي الشاشات اللي تقرأ سجل الطالب.
const LEGACY_COL = {
  civilId: 3,
  academicId: 4,
  name: 5,
  nameEn: 6,
  email: 7,
  level: 8,
  section: 9,
  department: 10,
  track: 11,
  phone1: 12,
  phone2: 13,
  phone3: 14,
  phone4: 15,
  phone5: 16,
  transport: 17,
  complexNumber: 18,
  sunday: 19,
  monday: 20,
  tuesday: 21,
  wednesday: 22,
  thursday: 23,
  counselorName: 25,
  counselorPhone: 26,
  counselorEmail: 27,
  counselorDepartment: 28,
  socialGuidance: 29,
  supportNeeded: 30,
  nonArabNationality: 31,
  specializationPreference: 32,
  minSpecializationThreshold: 33,
  seatNumber: 34,
  committee: 35,
};

const HEADER_ALIASES = {
  civilId: ["الرقم الشخصي", "الرقم السكانى", "الرقم السكاني"],
  academicId: ["الرقم الاكاديمي", "الرقم الأكاديمي"],
  name: ["اسم الطالب", "الاسم"], nameEn: ["الاسم باللغة الإنجليزية", "الاسم باللغة الانجليزية"],
  email: ["البريد الالكتروني", "البريد الإلكتروني", "الايميل"], level: ["المستوى"], section: ["الشعبة"],
  department: ["القسم"], track: ["المسار"], transport: ["المواصلات"], complexNumber: ["رقم المجمع", "المجمع"],
  counselorName: ["اسم المرشد"], counselorPhone: ["رقم المرشد"], counselorEmail: ["ايميل المرشد", "إيميل المرشد"],
  counselorDepartment: ["قسم المرشد"], socialGuidance: ["الارشاد الاجتماعي", "الإرشاد الاجتماعي"],
  supportNeeded: ["الدعم المطلوب"], nonArabNationality: ["جنسيات غير عربية"], specializationPreference: ["رغبة التخصص"],
  minSpecializationThreshold: ["الحد الأدنى للتخصص", "الحد الادنى للتخصص"], seatNumber: ["رقم المقعد"], committee: ["اللجنة"],
};

function cleanHeader(value) {
  return String(value ?? "").replace(/[‎‏‪-‮]/g, "").trim();
}

function detectColumns(headerRow) {
  const columns = {};
  headerRow.forEach((cell, index) => {
    const header = cleanHeader(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (columns[field] === undefined && aliases.includes(header)) columns[field] = index;
    }
    if (/^رقم الاتصال[١-٦1-6]$/.test(header)) {
      if (!columns.phones) columns.phones = [];
      columns.phones.push(index);
    }
  });
  return columns;
}

function toText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function rowToStudent(r, i, columns = LEGACY_COL) {
  const civilId = toText(r[columns.civilId]);
  const academicId = toText(r[columns.academicId]);
  const phoneColumns = columns.phones || [columns.phone1, columns.phone2, columns.phone3, columns.phone4, columns.phone5];
  const phones = phoneColumns.map((index) => r[index])
    .map(toText)
    .filter(Boolean);

  return {
    id: academicId || civilId || `student-${i + 1}`,
    civilId,
    academicId,
    name: toText(r[columns.name]),
    nameEn: toText(r[columns.nameEn]),
    email: toText(r[columns.email]),
    level: toText(r[columns.level]),
    section: toText(r[columns.section]),
    department: toText(r[columns.department]),
    track: toText(r[columns.track]),
    phones,
    transport: toText(r[columns.transport]),
    complexNumber: toText(r[columns.complexNumber]),
    weekSchedule: {
      sunday: toText(r[columns.sunday]), monday: toText(r[columns.monday]), tuesday: toText(r[columns.tuesday]),
      wednesday: toText(r[columns.wednesday]), thursday: toText(r[columns.thursday]),
    },
    counselor: {
      name: toText(r[columns.counselorName]), phone: toText(r[columns.counselorPhone]),
      email: toText(r[columns.counselorEmail]), department: toText(r[columns.counselorDepartment]),
    },
    socialGuidance: toText(r[columns.socialGuidance]), supportNeeded: toText(r[columns.supportNeeded]),
    nonArabNationality: toText(r[columns.nonArabNationality]), specializationPreference: toText(r[columns.specializationPreference]),
    minSpecializationThreshold: toText(r[columns.minSpecializationThreshold]), seatNumber: toText(r[columns.seatNumber]),
    committee: toText(r[columns.committee]),
  };
}

export function parseStudentsRows(rows) {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) throw new Error("شيت كشف الطلاب فارغ.");
  const columns = detectColumns(headerRow);
  if (columns.academicId === undefined || columns.name === undefined) throw new Error("تعذّر التعرّف على عمودي الرقم الأكاديمي واسم الطالب.");
  const byId = new Map();
  for (const [index, row] of dataRows.entries()) {
    if (!row || row[columns.academicId] == null) continue;
    const student = rowToStudent(row, index, columns);
    if (!student.name) throw new Error(`يوجد طالب بلا اسم عند الصف ${index + 2}.`);
    if (byId.has(student.id)) throw new Error(`الرقم الأكاديمي مكرر في كشف الطلاب: ${student.id}`);
    byId.set(student.id, student);
  }
  return [...byId.values()];
}

export async function parseStudentsWorkbook(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const sheetName = sheetNames.find((n) => n.includes(SHEET_HINT));
  if (!sheetName) {
    throw new Error(`تعذّر إيجاد شيت "${SHEET_HINT}" داخل الملف — تأكد من رفع ملف كشف الطلاب الكامل.`);
  }

  const students = parseStudentsRows(sheets[sheetName] || []);

  return { sheetName, students };
}

// كشف الطلاب يُعاد إصداره كامل كل مرة من إدارة المدرسة — استبدال كامل
// وليس دفعة قابلة للتراجع.
export async function commitStudentsImport(students) {
  // الملاحظات يضيفها المرشد يدويًا، لذلك لا يجوز أن يمحوها كشف جديد صادر
  // من المدرسة. بقية البيانات الأساسية تتبع الملف الأحدث كما هو متوقع.
  const existing = await list("students");
  const existingNotes = new Map(existing
    .filter((student) => student.notes)
    .map((student) => [String(student.id), student.notes]));
  const merged = students.map((student) => ({
    ...student,
    ...(existingNotes.has(String(student.id)) ? { notes: existingNotes.get(String(student.id)) } : {}),
  }));
  // اكتب السجل الجديد أولًا؛ لو انقطع الاتصال لا يصبح سجل الطلبة فارغًا.
  if (merged.length) await bulkPut("students", merged);
  const incomingIds = new Set(merged.map((student) => String(student.id)));
  for (const student of existing) {
    if (!incomingIds.has(String(student.id))) await remove("students", student.id);
  }
  invalidateStudentsCache();
  resetStudentsSeedCache();
  await logAuditEvent("import_students", { tableName: "students", count: merged.length });
  return { count: students.length };
}
