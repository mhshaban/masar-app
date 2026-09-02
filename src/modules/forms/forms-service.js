import { list as listAll, listWhere, get, save, remove, bulkPut, rpc } from "../../services/cloud-runtime.js?v=2026-08-31-egress-1";

export const FORM_TYPES = {
  school_admin: { label: "تحويل إلى إدارة المدرسة", kind: "referral", destination: "إدارة المدرسة" },
  social_guidance: { label: "تحويل إلى قسم الإرشاد الاجتماعي", kind: "referral", destination: "قسم الإرشاد الاجتماعي" },
  admin_supervision: { label: "تحويل إلى قسم الإشراف الإداري", kind: "referral", destination: "قسم الإشراف الإداري" },
  registration: { label: "تحويل إلى قسم التسجيل", kind: "referral", destination: "قسم التسجيل" },
  section_change: { label: "طلب تغيير شعبة أو تحويل تخصص", kind: "section_change" },
  guardian_consent: { label: "موافقة ولي الأمر", kind: "consent" },
};

const today = () => new Date().toISOString().slice(0, 10);

function normalizeAverage(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function averageFrom(student, flag) {
  return normalizeAverage(
    student?.finalCumulativeAverage ?? student?.cumulativeAverage ?? student?.overallPct ?? flag?.overallPct,
  );
}

async function finalCumulativeAverageFor(student) {
  const embedded = averageFrom(student);
  if (embedded != null) return embedded;
  const [flag] = await listWhere("academicFlags", "studentId", String(student?.id || student?.academicId || ""));
  return averageFrom(student, flag);
}

export function studentSnapshot(student) {
  if (!student?.id) throw new Error("يجب اختيار الطالب أولًا");
  return {
    id: String(student.id), name: student.name || "", nameEn: student.nameEn || "",
    academicId: student.academicId || "", civilId: student.civilId || "",
    level: student.level || "", section: student.section || "", department: student.department || "",
    track: student.track || "", specialization: student.specialization || student.program || "",
    finalCumulativeAverage: averageFrom(student),
    phone: student.phone || student.mobile || "", guardianPhone: student.guardianPhone || "",
  };
}

export async function createDepartmentForm(type, student, fields = {}) {
  const definition = FORM_TYPES[type];
  if (!definition) throw new Error("نوع الاستمارة غير معروف");
  const snapshot = studentSnapshot(student);
  snapshot.finalCumulativeAverage = await finalCumulativeAverageFor(student);
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

export async function getDepartmentForm(id) {
  const item = await get("departmentForms", id);
  if (!item?.student || item.student.finalCumulativeAverage != null) return item;
  return { ...item, student: { ...item.student, finalCumulativeAverage: await finalCumulativeAverageFor(item.student) } };
}

export async function addFinalCumulativeAverages(forms) {
  const flags = await listAll("academicFlags");
  const byStudent = new Map(flags.map((flag) => [String(flag.studentId), flag]));
  return forms.map((item) => ({
    ...item,
    student: item.student ? {
      ...item.student,
      finalCumulativeAverage: averageFrom(item.student, byStudent.get(String(item.studentId || item.student.id))),
    } : item.student,
  }));
}

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

export async function listTeachersDirectory({ query = "", offset = 0, limit = 25 } = {}) {
  if (!globalThis.__MASAR_TEST_BACKEND__) {
    return rpc("masar_teacher_directory", { p_query: query, p_offset: offset, p_limit: limit });
  }
  const rows = (await listTeachers()).filter((teacher) => !query || `${teacher.name || ""} ${teacher.nameEn || ""} ${teacher.personalNo || ""} ${teacher.employeeNo || ""} ${teacher.department || ""} ${teacher.jobTitle || ""}`.toLowerCase().includes(query.toLowerCase()));
  return { total: rows.length, rows: rows.slice(offset, offset + limit).map(({ photoDataUrl, ...teacher }) => ({ ...teacher, hasPhoto: !!photoDataUrl })) };
}

export async function getTeacherPhoto(id) {
  if (!globalThis.__MASAR_TEST_BACKEND__) return rpc("masar_teacher_photo", { p_id: id });
  return (await get("schoolTeachers", id))?.photoDataUrl || "";
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
