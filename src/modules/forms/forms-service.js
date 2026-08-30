import { list as listAll, get, save, remove, bulkPut } from "../../services/cloud-runtime.js";

export const FORM_TYPES = {
  school_admin: { label: "تحويل إلى إدارة المدرسة", kind: "referral", destination: "إدارة المدرسة" },
  social_guidance: { label: "تحويل إلى قسم الإرشاد الاجتماعي", kind: "referral", destination: "قسم الإرشاد الاجتماعي" },
  admin_supervision: { label: "تحويل إلى قسم الإشراف الإداري", kind: "referral", destination: "قسم الإشراف الإداري" },
  registration: { label: "تحويل إلى قسم التسجيل", kind: "referral", destination: "قسم التسجيل" },
  section_change: { label: "طلب تغيير شعبة أو تحويل تخصص", kind: "section_change" },
  guardian_consent: { label: "موافقة ولي الأمر", kind: "consent" },
};

const today = () => new Date().toISOString().slice(0, 10);

export function studentSnapshot(student) {
  if (!student?.id) throw new Error("يجب اختيار الطالب أولًا");
  return {
    id: String(student.id), name: student.name || "", nameEn: student.nameEn || "",
    academicId: student.academicId || "", civilId: student.civilId || "",
    level: student.level || "", section: student.section || "", department: student.department || "",
    track: student.track || "", specialization: student.specialization || student.program || "",
    phone: student.phone || student.mobile || "", guardianPhone: student.guardianPhone || "",
  };
}

export async function createDepartmentForm(type, student, fields = {}) {
  const definition = FORM_TYPES[type];
  if (!definition) throw new Error("نوع الاستمارة غير معروف");
  const snapshot = studentSnapshot(student);
  const base = {
    type, title: definition.label, kind: definition.kind, destination: definition.destination || null,
    studentId: snapshot.id, student: snapshot, status: "pending", createdDate: fields.createdDate || today(),
    updatedAt: new Date().toISOString(), fields: { ...fields }, feedback: "", feedbackDate: null,
  };
  if (definition.kind === "referral" && !String(fields.reason || "").trim()) throw new Error("سبب التحويل مطلوب");
  if (definition.kind === "section_change") {
    if (!fields.guardianName?.trim()) throw new Error("اسم ولي الأمر مقدم الطلب مطلوب");
    if (!fields.requestKind) throw new Error("حدد تغيير شعبة أو تحويل تخصص");
    if (!fields.reason?.trim()) throw new Error("سبب الطلب مطلوب");
  }
  if (definition.kind === "consent" && !fields.guardianName?.trim()) throw new Error("اسم ولي الأمر مطلوب");
  return save("departmentForms", base);
}

export async function listDepartmentForms() {
  const rows = await listAll("departmentForms");
  return rows.sort((a, b) => `${b.createdDate || ""}${b.updatedAt || ""}`.localeCompare(`${a.createdDate || ""}${a.updatedAt || ""}`));
}

export const getDepartmentForm = (id) => get("departmentForms", id);

export async function updateDepartmentForm(id, patch) {
  const current = await getDepartmentForm(id);
  if (!current) throw new Error("الاستمارة غير موجودة");
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (patch.fields) next.fields = { ...(current.fields || {}), ...patch.fields };
  return save("departmentForms", next);
}

export const removeDepartmentForm = (id) => remove("departmentForms", id);

export async function listTeachers() {
  const rows = await listAll("schoolTeachers");
  return rows.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
}

export async function saveTeacher(fields) {
  if (!fields.name?.trim()) throw new Error("اسم المعلم مطلوب");
  return save("schoolTeachers", {
    ...(fields.personalNo && !fields.id ? { id: `teacher-${fields.personalNo}` } : {}),
    ...fields, name: fields.name.trim(), updatedAt: new Date().toISOString(),
    createdAt: fields.createdAt || new Date().toISOString(),
  });
}

export async function importTeachers(records) {
  if (!Array.isArray(records) || !records.length) throw new Error("لا توجد بيانات معلمين للاستيراد");
  const cleaned = records.map((item) => {
    if (!item.name?.trim()) throw new Error("يوجد سجل دون اسم معلم");
    const personalNo = String(item.personalNo || "").trim();
    return {
      ...item,
      id: item.id || (personalNo ? `teacher-${personalNo}` : undefined),
      name: item.name.trim(), personalNo, updatedAt: new Date().toISOString(),
      createdAt: item.createdAt || new Date().toISOString(),
    };
  });
  await bulkPut("schoolTeachers", cleaned);
  return cleaned.length;
}

export const removeTeacher = (id) => remove("schoolTeachers", id);
