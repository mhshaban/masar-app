// تصدير Excel للتحديثات فقط (طلبة/معلمين) منذ آخر تصدير — بديل لتصدير
// السجل الكامل في كل مرة: صف واحد لكل طالب/معلم جديد أو تغيّر أي حقل من
// حقوله، عمود "الحالة" (جديد/معدّل/محذوف)، وأعمدة الحقول التي تغيّرت فعليًا
// فقط عبر كل الصفوف المُصدَّرة (لا الحقول الـ36 كاملة كل مرة). المقارنة مع
// آخر نسخة محفوظة محليًا بالمتصفح (roster-export-snapshot.js) — لا نسخة
// سابقة بمعنى "أول تصدير"، فتُعامَل كل الصفوف كـ"جديد".
//
// منطق المقارنة/بناء الصفوف هنا خالص (بلا IndexedDB ولا XLSX)، قابل
// للاختبار مباشرة؛ exportStudentsRosterChanges/exportTeachersRosterChanges
// أدناه هما الطبقة الرقيقة اللي تربطه بالمتصفح الفعلي.
import { ensureXlsx } from "./vendor-loader.js?v=2026-09-07-academic-fix-1";
import { list } from "./cloud-runtime.js";
import { getRosterSnapshot, saveRosterSnapshot } from "./roster-export-snapshot.js";
import { logAuditEvent } from "../modules/audit/audit-service.js?v=2026-09-04-audit-1";

export const STUDENT_IDENTITY_FIELDS = [
  { key: "academicId", label: "الرقم الأكاديمي" },
  { key: "name", label: "الاسم" },
];
export const STUDENT_FIELDS = [
  { key: "nameEn", label: "الاسم بالإنجليزية" },
  { key: "civilId", label: "الرقم الشخصي" },
  { key: "email", label: "البريد الإلكتروني" },
  { key: "level", label: "المستوى" },
  { key: "section", label: "الشعبة" },
  { key: "department", label: "القسم" },
  { key: "track", label: "المسار / التخصص" },
  { key: "phones", label: "أرقام الاتصال" },
  { key: "transport", label: "المواصلات" },
  { key: "complexNumber", label: "رقم المجمع" },
  { key: "notes", label: "ملاحظات الطالب" },
];

export const TEACHER_IDENTITY_FIELDS = [
  { key: "personalNo", label: "الرقم الشخصي" },
  { key: "name", label: "الاسم" },
];
export const TEACHER_FIELDS = [
  { key: "nameEn", label: "الاسم بالإنجليزية" },
  { key: "employeeNo", label: "الرقم الوظيفي" },
  { key: "jobTitle", label: "المسمى الوظيفي" },
  { key: "department", label: "القسم / المادة" },
  { key: "phone", label: "رقم التواصل" },
  { key: "email", label: "البريد الإلكتروني" },
  { key: "notes", label: "ملاحظات" },
];

function fieldValue(record, key) {
  const v = record?.[key];
  if (Array.isArray(v)) return v.filter(Boolean).join("، ") || null;
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function recordsById(records) {
  return Object.fromEntries(records.map((r) => [String(r.id), r]));
}

// {changed, deleted, changedFieldKeys} — changed يضم "جديد" و"معدّل" معًا،
// كل عنصر يحمل السجل الحالي الكامل (لتعبئة أعمدة الهوية دائمًا) ومجموعة
// أسماء الحقول المتغيّرة فقط (فارغة الباقي بالصف).
export function diffRoster(currentRecords, snapshotById, fields) {
  const currentIds = new Set(currentRecords.map((r) => String(r.id)));
  const changed = [];
  const changedFieldKeys = new Set();
  for (const record of currentRecords) {
    const id = String(record.id);
    const prev = snapshotById[id];
    if (!prev) {
      const keys = new Set();
      for (const f of fields) if (fieldValue(record, f.key) != null) keys.add(f.key);
      changed.push({ id, record, status: "جديد", changedKeys: keys });
      keys.forEach((k) => changedFieldKeys.add(k));
      continue;
    }
    const keys = new Set();
    for (const f of fields) {
      if (fieldValue(record, f.key) !== fieldValue(prev, f.key)) keys.add(f.key);
    }
    if (keys.size) {
      changed.push({ id, record, status: "معدّل", changedKeys: keys });
      keys.forEach((k) => changedFieldKeys.add(k));
    }
  }
  const deleted = Object.keys(snapshotById)
    .filter((id) => !currentIds.has(id))
    .map((id) => ({ id, record: snapshotById[id] }));
  return { changed, deleted, changedFieldKeys };
}

// عمود الحقل يظهر فقط لو تغيّر بصف واحد على الأقل ضمن هذا التصدير — لا
// الحقول كاملة كل مرة. أعمدة الهوية (الرقم/الاسم) تظهر دائمًا بكل الصفوف
// (بما فيها "محذوف") لتحديد مين تغيّر حتى لو الاسم نفسه لم يتغيّر.
export function buildChangesSheetRows(diffResult, identityFields, fields) {
  const usedFields = fields.filter((f) => diffResult.changedFieldKeys.has(f.key));
  const header = [...identityFields.map((f) => f.label), "الحالة", ...usedFields.map((f) => f.label)];
  const rows = [
    ...diffResult.changed.map(({ record, status, changedKeys }) => [
      ...identityFields.map((f) => fieldValue(record, f.key) ?? ""),
      status,
      ...usedFields.map((f) => (changedKeys.has(f.key) ? fieldValue(record, f.key) ?? "" : "")),
    ]),
    ...diffResult.deleted.map(({ record }) => [
      ...identityFields.map((f) => fieldValue(record, f.key) ?? ""),
      "محذوف",
      ...usedFields.map(() => ""),
    ]),
  ];
  return { header, rows };
}

const today = () => new Date().toISOString().slice(0, 10);

async function exportRosterChanges(collection, identityFields, fields, fileLabel) {
  const [current, snapshot] = await Promise.all([list(collection), getRosterSnapshot(collection)]);
  const diff = diffRoster(current, snapshot, fields);
  const newCount = diff.changed.filter((c) => c.status === "جديد").length;
  const changedCount = diff.changed.filter((c) => c.status === "معدّل").length;
  const deletedCount = diff.deleted.length;
  const totalRows = diff.changed.length + diff.deleted.length;

  if (totalRows > 0) {
    const { header, rows } = buildChangesSheetRows(diff, identityFields, fields);
    const XLSX = await ensureXlsx();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "التحديثات");
    XLSX.writeFile(wb, `${fileLabel}-${today()}.xlsx`, { compression: true });
    await saveRosterSnapshot(collection, recordsById(current));
    await logAuditEvent("export_excel", { tableName: collection, count: totalRows });
  }

  return { newCount, changedCount, deletedCount, totalRows };
}

export async function exportStudentsRosterChanges() {
  return exportRosterChanges("students", STUDENT_IDENTITY_FIELDS, STUDENT_FIELDS, "تحديثات-سجل-الطلبة");
}

export async function exportTeachersRosterChanges() {
  return exportRosterChanges("schoolTeachers", TEACHER_IDENTITY_FIELDS, TEACHER_FIELDS, "تحديثات-سجل-المعلمين");
}
