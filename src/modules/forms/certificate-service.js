// سجل الشهادات — كل دفعة شهادات (قالب + نص + مستلمون) سجل واحد بجدول سجلات
// الفعاليات (attendanceSheets) بـkind = "certificate"، مثل استمارة اعتماد
// الفعالية: لا يحتاج جدولًا جديدًا، وتشمله النسخ الاحتياطية وسجل التدقيق.
import { listWhere } from "../../services/cloud-runtime.js";
import { createAttendanceSheet, updateAttendanceSheet, getAttendanceSheet, removeAttendanceSheet } from "./attendance-service.js";

export const CERTIFICATE_KIND = "certificate";

const clean = (value) => String(value ?? "").trim();

// يحوّل حالة المحرر إلى سجل نظيف: المستلمون بلا أسماء فارغة، والنصوص كما كُتبت.
export function normalizeCertificateRecord({ templateKey, title, date, settings = {}, recipients = [] } = {}, templates = {}) {
  if (!templates[templateKey]) throw new Error("اختر قالب الشهادة أولًا");
  const list = recipients
    .map((r) => ({ name: clean(r.name), title: clean(r.title), sub: clean(r.sub), average: clean(r.average) }))
    .filter((r) => r.name);
  if (!list.length) throw new Error("أضف مستلمًا واحدًا على الأقل");
  const { date: _ignored, ...text } = settings;
  return {
    kind: CERTIFICATE_KIND,
    templateKey,
    templateLabel: templates[templateKey].label,
    title: clean(title) || templates[templateKey].label,
    date: clean(date),
    settings: text,
    recipients: list,
  };
}

export async function listCertificates() {
  const rows = await listWhere("attendanceSheets", "kind", CERTIFICATE_KIND);
  return rows.sort((a, b) => `${b.date || ""}${b.updatedAt || ""}`.localeCompare(`${a.date || ""}${a.updatedAt || ""}`));
}

export async function getCertificate(id) {
  const row = await getAttendanceSheet(id);
  return row?.kind === CERTIFICATE_KIND ? row : null;
}

export async function saveCertificate(id, record) {
  return id ? updateAttendanceSheet(id, record) : createAttendanceSheet(record);
}

export const removeCertificate = (id) => removeAttendanceSheet(id);
