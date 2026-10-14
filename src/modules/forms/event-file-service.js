// ملف الفعالية الموحّد: المرشحون ← موافقات أولياء الأمور ← كشف الحضور، بسجل
// واحد بدل ثلاثة كشوف منفصلة. يُحفظ بجدول سجلات الفعاليات (attendanceSheets)
// بـkind = "event": students = المرشحون، consents = ردود أولياء الأمور لكل
// طالب ("approved" | "declined"؛ غيابه = بانتظار الرد)، وكشف الحضور = الموافَق
// عليهم فقط، يُشتق دائمًا لا يُخزَّن منفصلًا.
import { listWhere } from "../../services/cloud-runtime.js";
import { getAttendanceSheet, updateAttendanceSheet, removeAttendanceSheet } from "./attendance-service.js";

export const EVENT_KIND = "event";
export const CONSENT_LABELS = { approved: "موافق", declined: "غير موافق", pending: "بانتظار الرد" };

export const studentKey = (s) => String(s?.id || s?.academicId || "");

export function consentOf(event, student) {
  const value = event?.consents?.[studentKey(student)];
  return value === "approved" || value === "declined" ? value : "pending";
}

export function consentSummary(event) {
  const counts = { approved: 0, declined: 0, pending: 0 };
  for (const s of event?.students || []) counts[consentOf(event, s)] += 1;
  return { ...counts, total: (event?.students || []).length };
}

export const approvedStudents = (event) => (event?.students || []).filter((s) => consentOf(event, s) === "approved");

function timeLabel(t) {
  const [h, m] = String(t || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "صباحًا" : "مساءً"}`;
}

// نص خطاب الموافقة المعبّأ تلقائيًا من بيانات الفعالية (قابل للتعديل بالملف).
export function defaultConsentText(event = {}) {
  const parts = [`نرجو من حضرتكم التكرم بالموافقة على مشاركة ابنكم في فعالية «${String(event.title || "").trim()}»`];
  if (event.day || event.date) parts.push(`يوم ${[event.day, event.date ? `الموافق ${event.date}` : ""].filter(Boolean).join(" ")}`);
  const start = timeLabel(event.startTime);
  const end = timeLabel(event.endTime);
  if (start && end) parts.push(`من الساعة ${start} حتى الساعة ${end}`);
  else if (start) parts.push(`الساعة ${start}`);
  if (event.location) parts.push(`في ${String(event.location).trim()}`);
  return `${parts.join(" ")}، علمًا بأن الطلبة سيكونون برفقة المعلمين المرافقين طوال مدة الفعالية.`;
}

export const consentTextOf = (event) => String(event?.consentText || "").trim() || defaultConsentText(event);

export async function listEventFiles() {
  const rows = await listWhere("attendanceSheets", "kind", EVENT_KIND);
  return rows.sort((a, b) => `${b.date || ""}${b.updatedAt || ""}`.localeCompare(`${a.date || ""}${a.updatedAt || ""}`));
}

export async function getEventFile(id) {
  const row = await getAttendanceSheet(id);
  return row?.kind === EVENT_KIND ? row : null;
}

// تسجيل رد ولي الأمر لطالب واحد (أو إعادته "بانتظار الرد"). يُعاد تحميل الملف
// قبل الحفظ ويُطبَّق التغيير وحده، كي لا يمحو ردًا سجّله زميل بنفس الوقت.
export async function setConsent(id, student, value) {
  const current = await getEventFile(id);
  if (!current) throw new Error("ملف الفعالية غير موجود");
  const consents = { ...(current.consents || {}) };
  const key = studentKey(student);
  if (value === "approved" || value === "declined") consents[key] = value;
  else delete consents[key];
  return updateAttendanceSheet(id, { consents });
}

export async function saveConsentText(id, text) {
  return updateAttendanceSheet(id, { consentText: String(text || "").trim() });
}

export const removeEventFile = (id) => removeAttendanceSheet(id);
