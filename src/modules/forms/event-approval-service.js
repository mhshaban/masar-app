// استمارة طلب اعتماد فعالية مدرسية — بنود المدرسة/القسم فقط من النموذج
// الرسمي (ملاحظات إدارة التعليم ورأي إدارة الخدمات الطلابية وتاريخ الاعتماد
// تُعبّأ هناك لا هنا). تُحفظ بنفس جدول كشوف الفعاليات (attendanceSheets)
// بـkind = "approval"، فلا تحتاج جدولًا جديدًا وتشملها النسخ الاحتياطية وسجل
// التدقيق تلقائيًا.
import {
  createAttendanceSheet, updateAttendanceSheet, listAttendanceSheets, getAttendanceSheet, removeAttendanceSheet,
} from "./attendance-service.js";

export const APPROVAL_KIND = "approval";
export const SCHOOL_NAME = "الشيخ عبدالله بن عيسى آل خليفة الثانوية الصناعية للبنين";
export const DEPARTMENT_NAME = "قسم الإرشاد الأكاديمي والتوجيه المهني";
export const EVENT_TYPES = ["محاضرة", "ورشة عمل", "ندوة", "زيارة ميدانية", "معرض", "مسابقة", "لقاء توعوي", "برنامج إرشادي", "حفل"];

export const BENEFICIARY_GROUPS = [
  { key: "teachers", label: "معلم" },
  { key: "students", label: "طالب" },
  { key: "admins", label: "إداري" },
  { key: "guardians", label: "ولي أمر" },
  { key: "others", label: "أخرى" },
];
// صف "من مدارس أخرى" بالنموذج الرسمي بلا خانة "أخرى".
export const OTHER_SCHOOL_GROUPS = BENEFICIARY_GROUPS.filter((g) => g.key !== "others");

const TEXT_FIELDS = [
  "title", "schoolName", "requestDate", "eventType", "concernedParty", "description", "objectives",
  "date", "startTime", "endTime", "duration", "sponsor", "budget",
  "organizerName", "organizerTitle", "organizerWorkplace", "supervisorName", "supervisorTitle",
  "presenterName", "presenterWorkplace", "partners", "notes",
];

function count(value) {
  const digits = String(value ?? "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();
  if (!digits) return "";
  const number = Number(digits);
  return Number.isInteger(number) && number >= 0 ? String(number) : "";
}

const hourWords = (h) => (h === 1 ? "ساعة" : h === 2 ? "ساعتان" : h <= 10 ? `${h} ساعات` : `${h} ساعة`);

// "08:00" → "09:30" = "ساعة و30 دقيقة". فارغ لو الوقتان ناقصان أو النهاية قبل البداية.
export function durationLabel(startTime, endTime) {
  const toMinutes = (t) => {
    const [h, m] = String(t || "").split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start == null || end == null || end <= start) return "";
  const hours = Math.floor((end - start) / 60);
  const minutes = (end - start) % 60;
  if (!hours) return `${minutes} دقيقة`;
  return minutes ? `${hourWords(hours)} و${minutes} دقيقة` : hourWords(hours);
}

export function beneficiaryTotal(counts = {}) {
  return Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

// يحوّل قيم النموذج (FormData) إلى سجل نظيف: نصوص مشذّبة، أعداد صحيحة
// (تقبل الأرقام العربية)، والمدة تُحسب من الوقتين ما لم يكتبها المستخدم.
export function normalizeEventApproval(values = {}) {
  const record = { kind: APPROVAL_KIND };
  for (const key of TEXT_FIELDS) record[key] = String(values[key] ?? "").trim();
  if (!record.duration) record.duration = durationLabel(record.startTime, record.endTime);
  record.beneficiaries = Object.fromEntries(BENEFICIARY_GROUPS.map(({ key }) => [key, count(values[`ben_${key}`] ?? values.beneficiaries?.[key])]));
  record.otherSchoolBeneficiaries = Object.fromEntries(OTHER_SCHOOL_GROUPS.map(({ key }) => [key, count(values[`other_${key}`] ?? values.otherSchoolBeneficiaries?.[key])]));
  return record;
}

export async function listEventApprovals() {
  return (await listAttendanceSheets()).filter((row) => row.kind === APPROVAL_KIND);
}

export async function getEventApproval(id) {
  const row = await getAttendanceSheet(id);
  return row?.kind === APPROVAL_KIND ? row : null;
}

export async function saveEventApproval(id, values) {
  const record = normalizeEventApproval(values);
  if (!record.title) throw new Error("اكتب اسم الفعالية أولًا");
  return id ? updateAttendanceSheet(id, record) : createAttendanceSheet(record);
}

export const removeEventApproval = (id) => removeAttendanceSheet(id);
