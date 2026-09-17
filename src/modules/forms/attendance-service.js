// كشف حضور فعالية — سجل مستقل عن departmentForms (لا "نوع طلب" ولا حالة
// متابعة، مجرد مستند يُعاد فتحه للتعديل لاحقًا). نفس نمط التوثيق التلقائي
// المستخدم بـdepartmentForms: التغيير الفعلي يُسجَّل بمحفّز قاعدة البيانات
// (masar_audit_sensitive_change عبر attendanceSheets_audit)، لا حاجة لاستدعاء
// logAuditEvent يدويًا هنا.
import { list as listAll, get, save, remove } from "../../services/cloud-runtime.js";
import { getCurrentProfile } from "../../services/auth-service.js?v=2026-09-04-form-actor-1";

function currentActor() {
  try {
    const profile = getCurrentProfile();
    const name = String(profile?.full_name || profile?.name || profile?.email || "").trim();
    if (!name) return null;
    return { id: String(profile?.id || ""), name };
  } catch {
    return null;
  }
}

function validate(data) {
  if (!String(data.title || "").trim()) throw new Error("اكتب عنوان الفعالية أولًا");
  if (!data.students?.length) throw new Error("اختر الطلبة المشاركين أولًا");
}

export async function listAttendanceSheets() {
  const rows = await listAll("attendanceSheets");
  return rows.sort((a, b) => `${b.date || ""}${b.updatedAt || ""}`.localeCompare(`${a.date || ""}${a.updatedAt || ""}`));
}

export async function getAttendanceSheet(id) {
  return get("attendanceSheets", id);
}

export async function createAttendanceSheet(data) {
  validate(data);
  const now = new Date().toISOString();
  const actor = currentActor();
  return save("attendanceSheets", {
    ...data,
    createdAt: now,
    updatedAt: now,
    ...(actor ? { createdById: actor.id, createdByName: actor.name } : {}),
  });
}

export async function updateAttendanceSheet(id, data) {
  const current = await getAttendanceSheet(id);
  if (!current) throw new Error("كشف الحضور غير موجود");
  validate(data);
  const actor = currentActor();
  return save("attendanceSheets", {
    ...current,
    ...data,
    id: current.id,
    createdAt: current.createdAt,
    createdById: current.createdById,
    createdByName: current.createdByName,
    updatedAt: new Date().toISOString(),
    ...(actor ? { updatedById: actor.id, updatedByName: actor.name } : {}),
  });
}

export const removeAttendanceSheet = (id) => remove("attendanceSheets", id);
