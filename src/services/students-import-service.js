// استيراد سجل الطلبة من شيت "كشف الطلاب" (نفس ملف كشف الطلاب الكامل
// المستخدم لبقية الاستيرادات — المرفعين، الجدول الدراسي، الساعات المكتبية).
// حل محل التعبئة القديمة من data/students.local.json المحلي: بعد نقل مسار
// لمستودع GitHub عام (لاستضافة GitHub Pages)، ملف ثابت فيه بيانات طلاب
// حقيقية داخل نفس المستودع كان يعني أي زائر يقدر يجلبه مباشرة بدون تسجيل
// دخول — استيراد داخل التطبيق (يكتب عبر storage-runtime.js، خلف تسجيل
// الدخول + RLS) هو البديل الآمن.
import { clear, bulkPut } from "./storage-runtime.js";
import { invalidateStudentsCache } from "../modules/students/students-service.js";
import { readWorkbook } from "./xlsx-parser.js";
import { resetStudentsSeedCache } from "./students-source.js";

const SHEET_HINT = "كشف الطلاب";

// فهرسة الأعمدة مطابقة لترويسة الشيت الفعلية بالملف الرسمي — مفحوصة صفًا
// بصف مقابل الحقول اللي كان يُنتجها seed القديم (data/students.local.json)
// للتأكد من تطابق الشكل تمامًا (نفس أسماء الحقول، نفس بنية counselor/
// weekSchedule/phones) فلا يتغيّر أي شيء بباقي الشاشات اللي تقرأ سجل الطالب.
const COL = {
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

function toText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function rowToStudent(r, i) {
  const civilId = toText(r[COL.civilId]);
  const academicId = toText(r[COL.academicId]);
  const phones = [r[COL.phone1], r[COL.phone2], r[COL.phone3], r[COL.phone4], r[COL.phone5]]
    .map(toText)
    .filter(Boolean);

  return {
    id: academicId || civilId || `student-${i + 1}`,
    civilId,
    academicId,
    name: toText(r[COL.name]),
    nameEn: toText(r[COL.nameEn]),
    email: toText(r[COL.email]),
    level: toText(r[COL.level]),
    section: toText(r[COL.section]),
    department: toText(r[COL.department]),
    track: toText(r[COL.track]),
    phones,
    transport: toText(r[COL.transport]),
    complexNumber: toText(r[COL.complexNumber]),
    weekSchedule: {
      sunday: toText(r[COL.sunday]),
      monday: toText(r[COL.monday]),
      tuesday: toText(r[COL.tuesday]),
      wednesday: toText(r[COL.wednesday]),
      thursday: toText(r[COL.thursday]),
    },
    counselor: {
      name: toText(r[COL.counselorName]),
      phone: toText(r[COL.counselorPhone]),
      email: toText(r[COL.counselorEmail]),
      department: toText(r[COL.counselorDepartment]),
    },
    socialGuidance: toText(r[COL.socialGuidance]),
    supportNeeded: toText(r[COL.supportNeeded]),
    nonArabNationality: toText(r[COL.nonArabNationality]),
    specializationPreference: toText(r[COL.specializationPreference]),
    minSpecializationThreshold: toText(r[COL.minSpecializationThreshold]),
    seatNumber: toText(r[COL.seatNumber]),
    committee: toText(r[COL.committee]),
  };
}

export async function parseStudentsWorkbook(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const sheetName = sheetNames.find((n) => n.includes(SHEET_HINT));
  if (!sheetName) {
    throw new Error(`تعذّر إيجاد شيت "${SHEET_HINT}" داخل الملف — تأكد من رفع ملف كشف الطلاب الكامل.`);
  }

  const rows = (sheets[sheetName] || []).slice(1);
  const students = rows
    .filter((r) => r && r[COL.academicId] != null)
    .map(rowToStudent);

  return { sheetName, students };
}

// كشف الطلاب يُعاد إصداره كامل كل مرة من إدارة المدرسة — استبدال كامل
// وليس دفعة قابلة للتراجع.
export async function commitStudentsImport(students) {
  await clear("students");
  if (students.length) await bulkPut("students", students);
  invalidateStudentsCache();
  resetStudentsSeedCache();
  return { count: students.length };
}
