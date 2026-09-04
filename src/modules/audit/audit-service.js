import { rpc } from "../../services/cloud-runtime.js?v=2026-09-04-audit-1";

export const ACTION_LABELS = {
  insert: "إضافة سجل",
  update: "تعديل سجل",
  delete: "حذف سجل",
  create_user: "إنشاء مستخدم",
  activate_user: "تفعيل مستخدم",
  deactivate_user: "تعطيل مستخدم",
  set_role: "تغيير صلاحية",
  reset_password: "إعادة تعيين كلمة مرور",
  restore_backup: "استعادة نسخة احتياطية",
  export_backup: "تصدير نسخة احتياطية",
  export_word: "تصدير Word",
  export_excel: "تصدير Excel",
  import_students: "استيراد سجل الطلبة",
  import_teachers: "استيراد سجل المعلمين",
  import_promoted: "استيراد مقررات المرفعين",
  update_student: "تعديل بيانات طالب",
  update_teacher: "تعديل بيانات معلم",
};

export const TABLE_LABELS = {
  departmentPlanProjects: "خطة القسم",
  actionProgress: "تنفيذ الخطة",
  reminders: "التذكيرات",
  guidanceCases: "الحالات الإرشادية",
  caseSessions: "جلسات الحالات",
  supportPlans: "خطط الدعم",
  supportPlanActions: "إجراءات الدعم",
  careerSessions: "التوجيه المهني",
  promotedImportBatches: "دفعات المرفعين",
  departmentForms: "الاستمارات",
  students: "سجل الطلبة",
  schoolTeachers: "سجل المعلمين",
  reports: "التقارير",
  backup: "النسخ الاحتياطي",
  users: "المستخدمون",
};

export function normalizeAuditPage(payload, page = 1, pageSize = 25) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const total = Number(payload?.total || 0);
  return {
    rows,
    total: Number.isFinite(total) ? total : 0,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil((Number.isFinite(total) ? total : 0) / pageSize)),
  };
}

export async function listAuditLogs({
  page = 1,
  pageSize = 25,
  action = "",
  tableName = "",
  actor = "",
  recordId = "",
  from = "",
  to = "",
} = {}) {
  const safeSize = Math.min(500, Math.max(1, Number(pageSize) || 25));
  const safePage = Math.max(1, Number(page) || 1);
  const payload = await rpc("masar_list_audit_logs", {
    p_limit: safeSize,
    p_offset: (safePage - 1) * safeSize,
    p_action: action || null,
    p_table_name: tableName || null,
    p_actor: actor.trim() || null,
    p_record_id: recordId.trim() || null,
    p_from: from || null,
    p_to: to || null,
  });
  return normalizeAuditPage(payload, safePage, safeSize);
}

// التسجيل الإضافي مخصص للأحداث التي لا تغيّر صفًا في قاعدة البيانات
// (التصدير مثلًا). فشل التسجيل لا يعطّل عمل المستخدم الأساسي.
export async function logAuditEvent(action, { tableName = null, recordId = null, count = null } = {}) {
  if (globalThis.__MASAR_TEST_BACKEND__) return false;
  try {
    await rpc("masar_log_app_event", {
      p_action: action,
      p_table_name: tableName,
      p_record_id: recordId,
      p_count: Number.isFinite(Number(count)) ? Number(count) : null,
    });
    return true;
  } catch {
    return false;
  }
}
