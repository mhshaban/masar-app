import { mountStudentPicker } from "../shared/student-picker.js";
import {
  FORM_TYPES, createDepartmentForm, listDepartmentForms, getDepartmentForm,
  updateDepartmentForm, removeDepartmentForm, addFinalCumulativeAverages, listTeachersDirectory, getTeacherPhoto, saveTeacher, removeTeacher,
} from "./forms-service.js?v=2026-09-02-official-cumulative-2";
import { buildDepartmentFormReportHtml } from "../../services/report-builders.js?v=2026-09-02-form-layout-1";
import { downloadAsWordDoc } from "../../services/word-export.js?v=2026-09-02-form-layout-1";
import { ensureXlsx } from "../../services/vendor-loader.js";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const field = (label, name, type = "text", required = false, value = "") => `<label class="forms-field"><span>${label}${required ? " *" : ""}</span><input name="${name}" type="${type}" ${required ? "required" : ""} value="${esc(value)}"></label>`;
const area = (label, name, required = false, value = "") => `<label class="forms-field forms-wide"><span>${label}${required ? " *" : ""}</span><textarea name="${name}" rows="3" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;

const FORM_FIELD_LABELS = { reason: "السبب", requestedAction: "الإجراء المطلوب", notes: "ملاحظات الاستمارة", requestKind: "نوع الطلب", guardianName: "اسم ولي الأمر", guardianPersonalNo: "الرقم الشخصي لولي الأمر", guardianPhone: "رقم تواصل ولي الأمر", currentPlacement: "الشعبة/التخصص الحالي", requestedPlacement: "الشعبة/التخصص المطلوب", guidanceOpinion: "رأي الإرشاد الأكاديمي والتوجيه المهني", socialOpinion: "رأي الإرشاد الاجتماعي", registrationOpinion: "رأي التسجيل", finalDecision: "قرار إدارة المدرسة", address: "العنوان", subject: "الموضوع/الفعالية", consentText: "نص طلب الموافقة", guardianResponse: "رد ولي الأمر", responseDate: "تاريخ رد ولي الأمر", signature: "التوقيع/الإقرار" };
const FORM_VALUE_LABELS = { section: "تغيير شعبة", specialization: "تحويل تخصص", pending: "بانتظار الرد", approved: "موافق", declined: "غير موافق" };
const STATUS_LABELS = { pending: "بانتظار الإجراء", in_progress: "قيد الإجراء", completed: "مكتملة", rejected: "مرفوضة" };
const FORM_FIELD_ORDER = {
  referral: ["reason", "requestedAction", "notes"],
  section_change: ["requestKind", "guardianName", "guardianPersonalNo", "guardianPhone", "currentPlacement", "requestedPlacement", "reason", "guidanceOpinion", "socialOpinion", "registrationOpinion", "finalDecision"],
  consent: ["guardianName", "address", "subject", "consentText", "guardianResponse", "guardianPersonalNo", "guardianPhone", "responseDate", "signature"],
};
const formFieldLabel = (item, key) => {
  if (item.kind === "section_change" && key === "reason") return "سبب الطلب";
  if (item.kind === "referral" && key === "reason") return "سبب التحويل وملخص الحالة";
  if (item.kind === "section_change" && key === "socialOpinion") return "رأي قسم الإرشاد الاجتماعي (للحالات الخاصة والمرضية)";
  if (item.kind === "section_change" && key === "registrationOpinion") return "رأي قسم التسجيل";
  if (item.kind === "section_change" && key === "finalDecision") return "قرار إدارة المدرسة النهائي";
  return FORM_FIELD_LABELS[key] || key;
};

function formExcelRow(item) {
  const row = {
    "تاريخ الطلب": item.createdDate || "", "نوع الاستمارة": item.title || FORM_TYPES[item.type]?.label || item.type || "",
    "الجهة المحال إليها": item.destination || "", "حالة الطلب": STATUS_LABELS[item.status] || item.status || "غير محدد",
    "اسم الطالب": item.student?.name || "", "الرقم الأكاديمي": item.student?.academicId || item.studentId || "", "الرقم الشخصي للطالب": item.student?.civilId || "",
    "المستوى": item.student?.level || "", "الشعبة": item.student?.section || "", "المسار/التخصص": item.student?.track || item.student?.specialization || "",
    "المعدل التراكمي النهائي": item.student?.finalCumulativeAverage ?? "",
  };
  for (const [key, label] of Object.entries(FORM_FIELD_LABELS)) row[label] = FORM_VALUE_LABELS[item.fields?.[key]] || item.fields?.[key] || "";
  return { ...row, "التغذية الراجعة/الإجراء المتخذ": item.feedback || "", "تاريخ التغذية الراجعة": item.feedbackDate || "", "آخر تحديث": item.updatedAt || "" };
}

async function exportFormsExcel(forms) {
  if (!forms.length) throw new Error("لا توجد استمارات لتصديرها");
  const XLSX = await ensureXlsx();
  const rows = (await addFinalCumulativeAverages(forms)).map(formExcelRow);
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0]).map((key) => ({ wch: Math.min(45, Math.max(12, key.length + 3, ...rows.map((row) => String(row[key] || "").length + 2))) }));
  const counts = Object.entries(forms.reduce((acc, item) => { const key = item.title || FORM_TYPES[item.type]?.label || "غير محدد"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([type, count]) => ({ "نوع الاستمارة": type, "العدد": count }));
  const summary = XLSX.utils.json_to_sheet([{ "البيان": "إجمالي الاستمارات", "القيمة": forms.length }, { "البيان": "تاريخ التصدير", "القيمة": new Date().toLocaleString("ar-BH") }]);
  XLSX.utils.sheet_add_json(summary, counts.map((row) => ({ "البيان": row["نوع الاستمارة"], "القيمة": row["العدد"] })), { origin: -1, skipHeader: true });
  summary["!cols"] = [{ wch: 42 }, { wch: 18 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "سجل الاستمارات");
  XLSX.utils.book_append_sheet(workbook, summary, "الملخص");
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(workbook, `سجل-الاستمارات-${today()}.xlsx`, { compression: true });
  await logAuditEvent("export_excel", { tableName: "departmentForms", count: forms.length });
}

function studentCard(student) {
  if (!student) return '<div class="forms-student empty">لم يتم اختيار طالب بعد</div>';
  const average = student.finalCumulativeAverage;
  return `<div class="forms-student"><strong>${esc(student.name)}</strong><span>الرقم الأكاديمي: ${esc(student.academicId) || "—"}</span><span>الرقم الشخصي: ${esc(student.civilId) || "—"}</span><span>المستوى: ${esc(student.level) || "—"}</span><span>الشعبة: ${esc(student.section) || "—"}</span><span>المسار/التخصص: ${esc(student.track || student.specialization) || "—"}</span><span>المعدل التراكمي النهائي: ${average == null || average === "" ? "—" : `${esc(average)}٪`}</span></div>`;
}

function typeFields(type, values = {}) {
  const def = FORM_TYPES[type];
  if (def.kind === "referral") return `
    ${area("سبب التحويل وملخص الحالة", "reason", true, values.reason || "")}
    ${area("الإجراء المطلوب من الجهة المحال إليها", "requestedAction", false, values.requestedAction || "")}
    ${area("مرفقات أو ملاحظات", "notes", false, values.notes || "")}`;
  if (def.kind === "section_change") return `
    <label class="forms-field"><span>نوع الطلب *</span><select name="requestKind" required><option value="">اختر</option><option value="section" ${values.requestKind === "section" ? "selected" : ""}>تغيير شعبة</option><option value="specialization" ${values.requestKind === "specialization" ? "selected" : ""}>تحويل تخصص</option></select></label>
    ${field("اسم ولي الأمر (مقدم الطلب)", "guardianName", "text", true, values.guardianName || "")}
    ${field("الرقم الشخصي لولي الأمر", "guardianPersonalNo", "text", false, values.guardianPersonalNo || "")}
    ${field("رقم التواصل", "guardianPhone", "tel", false, values.guardianPhone || "")}
    ${field("الشعبة/التخصص الحالي", "currentPlacement", "text", false, values.currentPlacement || "")}
    ${field("الشعبة/التخصص المطلوب", "requestedPlacement", "text", false, values.requestedPlacement || "")}
    ${area("سبب الطلب", "reason", true, values.reason || "")}
    ${area("رأي قسم الإرشاد الأكاديمي والتوجيه المهني", "guidanceOpinion", false, values.guidanceOpinion || "")}
    ${area("رأي قسم الإرشاد الاجتماعي (للحالات الخاصة والمرضية)", "socialOpinion", false, values.socialOpinion || "")}
    ${area("رأي قسم التسجيل", "registrationOpinion", false, values.registrationOpinion || "")}
    ${area("قرار إدارة المدرسة النهائي", "finalDecision", false, values.finalDecision || "")}`;
  return `
    ${field("اسم ولي الأمر", "guardianName", "text", true, values.guardianName || "")}
    ${field("العنوان", "address", "text", false, values.address || "")}
    ${field("الموضوع / اسم الفعالية", "subject", "text", true, values.subject || "")}
    ${area("نص طلب الموافقة", "consentText", true, values.consentText || "نرجو من حضرتكم موافاتنا بموافقتكم على مشاركة ابنكم في هذه الفعالية.")}
    <label class="forms-field"><span>رد ولي الأمر</span><select name="guardianResponse"><option value="pending" ${!values.guardianResponse || values.guardianResponse === "pending" ? "selected" : ""}>بانتظار الرد</option><option value="approved" ${values.guardianResponse === "approved" ? "selected" : ""}>موافق</option><option value="declined" ${values.guardianResponse === "declined" ? "selected" : ""}>غير موافق</option></select></label>
    ${field("الرقم الشخصي لولي الأمر", "guardianPersonalNo", "text", false, values.guardianPersonalNo || "")}
    ${field("رقم التواصل", "guardianPhone", "tel", false, values.guardianPhone || "")}
    ${field("التاريخ", "responseDate", "date", false, values.responseDate || "")}
    ${field("التوقيع / اسم ولي الأمر المقرّ", "signature", "text", false, values.signature || "")}`;
}

async function renderCreate(root, rerender) {
  let selectedStudent = null;
  root.innerHTML = `<div class="card forms-card"><h2>استمارة جديدة</h2><p class="hint">اختر نوع الاستمارة والطالب. تُحفظ بيانات الطالب الحالية كاملة داخل السجل.</p>
    <div class="forms-grid"><label class="forms-field forms-wide"><span>نوع الاستمارة *</span><select id="form-type">${Object.entries(FORM_TYPES).map(([key, v]) => `<option value="${key}">${esc(v.label)}</option>`).join("")}</select></label></div>
    <div id="form-student-picker"></div><div id="form-selected-student">${studentCard(null)}</div>
    <form id="department-form" class="forms-grid"><div id="form-dynamic" class="forms-grid forms-wide">${typeFields("school_admin")}</div>
      ${field("تاريخ الطلب", "createdDate", "date", true, today())}
      <div class="forms-actions forms-wide"><button class="btn btn-primary" type="submit">حفظ الاستمارة</button></div>
    </form></div>`;
  mountStudentPicker(root.querySelector("#form-student-picker"), { onSelect(student) { selectedStudent = student; root.querySelector("#form-selected-student").innerHTML = studentCard(student); } });
  const type = root.querySelector("#form-type");
  type.addEventListener("change", () => { root.querySelector("#form-dynamic").innerHTML = typeFields(type.value); });
  root.querySelector("#department-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedStudent) return alert("اختر الطالب أولًا");
    const values = Object.fromEntries(new FormData(event.target).entries());
    try { await createDepartmentForm(type.value, selectedStudent, values); alert("تم حفظ الاستمارة في السجل"); await rerender("log"); }
    catch (error) { alert(error.message); }
  });
}

const statusPill = (status) => ({ pending: '<span class="pill pill-warning">بانتظار الإجراء</span>', in_progress: '<span class="pill">قيد الإجراء</span>', completed: '<span class="pill pill-success">مكتملة</span>', rejected: '<span class="pill pill-critical">مرفوضة</span>' }[status] || '<span class="pill pill-neutral">غير محدد</span>');

async function renderLog(root, openDetail, openEdit) {
  const forms = await listDepartmentForms();
  root.innerHTML = `<div class="card"><div class="forms-toolbar"><div class="search"><input id="forms-search" type="search" placeholder="بحث بالطالب أو نوع الاستمارة..."></div><div class="forms-actions"><select id="forms-status"><option value="">كل الحالات</option><option value="pending">بانتظار الإجراء</option><option value="in_progress">قيد الإجراء</option><option value="completed">مكتملة</option><option value="rejected">مرفوضة</option></select><button class="btn btn-primary" id="forms-export-excel" type="button" ${forms.length ? "" : "disabled"}>تصدير جماعي Excel</button></div></div><div id="forms-table"></div></div>`;
  const table = root.querySelector("#forms-table");
  function draw() {
    const q = root.querySelector("#forms-search").value.trim().toLowerCase(); const status = root.querySelector("#forms-status").value;
    const filtered = forms.filter((item) => (!status || item.status === status) && (!q || `${item.student?.name || ""} ${item.student?.academicId || ""} ${item.title || ""}`.toLowerCase().includes(q)));
    table.innerHTML = filtered.length ? `<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>الاستمارة</th><th>الطالب</th><th>الجهة/الحالة</th><th></th></tr></thead><tbody>${filtered.map((item) => `<tr><td class="num">${esc(item.createdDate)}</td><td>${esc(item.title)}</td><td><strong>${esc(item.student?.name)}</strong><div class="hint">${esc(item.student?.academicId)}</div></td><td>${item.destination ? `${esc(item.destination)}<br>` : ""}${statusPill(item.status)}</td><td><div class="forms-actions"><button class="btn btn-ghost" data-open="${esc(item.id)}">فتح</button><button class="btn btn-ghost" data-edit-form="${esc(item.id)}">تعديل</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">لا توجد استمارات مطابقة</div>';
    table.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.open)));
    table.querySelectorAll("[data-edit-form]").forEach((button) => button.addEventListener("click", () => openEdit(button.dataset.editForm)));
  }
  root.querySelector("#forms-export-excel").addEventListener("click", async (event) => {
    const button = event.currentTarget; const original = button.textContent; button.disabled = true; button.textContent = "جارٍ إعداد الملف…";
    try { await exportFormsExcel(forms); }
    catch (error) { alert(error.message || "تعذر تصدير ملف Excel"); }
    finally { button.disabled = false; button.textContent = original; }
  });
  root.querySelector("#forms-search").addEventListener("input", draw); root.querySelector("#forms-status").addEventListener("change", draw); draw();
}

async function renderEdit(root, id, back, openDetail) {
  const item = await getDepartmentForm(id); if (!item) return back();
  root.innerHTML = `<button class="backlink" id="forms-edit-back">رجوع لسجل الاستمارات</button>
    <div class="card forms-card"><div class="topbar"><div><h1>تعديل الاستمارة</h1><div class="sub">${esc(item.title)} — ${esc(item.student?.name || "")}</div></div></div>
      <div>${studentCard(item.student)}</div>
      <form id="department-form-edit" class="forms-grid">
        <div class="forms-grid forms-wide">${typeFields(item.type, item.fields || {})}</div>
        ${field("تاريخ الطلب", "createdDate", "date", true, item.createdDate || today())}
        <div class="forms-actions forms-wide"><button class="btn btn-primary" type="submit">حفظ التعديلات</button><button class="btn btn-ghost" type="button" id="forms-edit-cancel">إلغاء</button></div>
      </form>
    </div>`;
  const cancel = () => back();
  root.querySelector("#forms-edit-back").addEventListener("click", cancel);
  root.querySelector("#forms-edit-cancel").addEventListener("click", cancel);
  root.querySelector("#department-form-edit").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target).entries());
    const createdDate = values.createdDate; delete values.createdDate;
    try {
      await updateDepartmentForm(id, { createdDate, fields: values });
      alert("تم حفظ تعديلات الاستمارة");
      await openDetail(id);
    } catch (error) { alert(error.message); }
  });
}

function detailFields(item) {
  const fields = item.fields || {};
  const requiredKeys = FORM_FIELD_ORDER[item.kind] || [];
  const extraKeys = Object.keys(fields).filter((key) => key !== "createdDate" && !requiredKeys.includes(key));
  return [...requiredKeys, ...extraKeys].map((key) => {
    const value = FORM_VALUE_LABELS[fields[key]] || fields[key] || "";
    return `<div class="forms-detail-row${value ? "" : " forms-detail-empty"}"><span>${esc(formFieldLabel(item, key))}</span><strong>${value ? esc(value) : '<i class="forms-empty-screen">لم يُعبّأ</i><i class="forms-empty-print" aria-hidden="true">&nbsp;</i>'}</strong></div>`;
  }).join("");
}

function workflowBlock(item) {
  if (item.kind === "section_change") return `<div class="print-approval form-workflow"><strong>القرار والتوثيق</strong><div class="workflow-options">☐ موافق &nbsp;&nbsp; ☐ غير موافق &nbsp;&nbsp; ☐ مؤجل لاستكمال البيانات</div><div class="workflow-signatures"><span>مدير المدرسة/من ينوب عنه: ................................</span><span>التاريخ: ........ / ........ / ................</span><span>التوقيع: ................................</span></div></div>`;
  if (item.kind === "consent") {
    const response = item.fields?.guardianResponse;
    return `<div class="print-approval form-workflow"><strong>إقرار ولي الأمر</strong><div class="workflow-options">${response === "approved" ? "☑" : "☐"} موافق &nbsp;&nbsp; ${response === "declined" ? "☑" : "☐"} غير موافق</div><div class="workflow-signatures"><span>الاسم: ${esc(item.fields?.guardianName || "................................")}</span><span>الرقم الشخصي: ${esc(item.fields?.guardianPersonalNo || "................................")}</span><span>التاريخ والتوقيع: ${esc(item.fields?.responseDate || "........ / ........ / ................")} &nbsp; ${esc(item.fields?.signature || "................................")}</span></div></div>`;
  }
  return `<div class="print-approval form-workflow"><strong>استلام ومتابعة الجهة المحال إليها</strong><div class="workflow-options">☐ تم الاستلام &nbsp;&nbsp; ☐ تمت المراجعة &nbsp;&nbsp; ☐ تم اتخاذ الإجراء &nbsp;&nbsp; ☐ أُعيدت التغذية الراجعة</div><div class="workflow-signatures"><span>اسم المستلم: ................................</span><span>التاريخ: ........ / ........ / ................</span><span>التوقيع: ................................</span></div></div>`;
}

async function renderDetail(root, id, back) {
  const item = await getDepartmentForm(id); if (!item) return back();
  root.innerHTML = `<button class="backlink" id="forms-back">رجوع لسجل الاستمارات</button><div class="forms-print" id="form-printable">
    <div class="topbar"><div><h1>${esc(item.title)}</h1><div class="sub">تاريخ الطلب: ${esc(item.createdDate || "—")}</div></div>${statusPill(item.status)}</div>
    <div class="card"><h2>بيانات الطالب</h2>${studentCard(item.student)}</div>
    <div class="card"><h2>بيانات الاستمارة</h2>${detailFields(item)}</div>
    <div class="card${!item.feedback && !item.feedbackDate ? " print-hide-empty-feedback" : ""}"><h2>الإجراء والتغذية الراجعة</h2><div class="forms-print-feedback"><div class="forms-detail-row"><span>الحالة</span><strong>${esc(({ pending: "بانتظار الإجراء", in_progress: "قيد الإجراء", completed: "مكتملة", rejected: "مرفوضة" })[item.status] || "—")}</strong></div><div class="forms-detail-row"><span>تاريخ التغذية الراجعة</span><strong>${esc(item.feedbackDate || "—")}</strong></div><div class="forms-detail-row"><span>التغذية الراجعة / الإجراء المتخذ</span><strong>${esc(item.feedback || "—")}</strong></div></div><form id="feedback-form" class="forms-grid">
      <label class="forms-field"><span>حالة الطلب</span><select name="status"><option value="pending">بانتظار الإجراء</option><option value="in_progress">قيد الإجراء</option><option value="completed">مكتملة</option><option value="rejected">مرفوضة</option></select></label>
      ${field("تاريخ التغذية الراجعة", "feedbackDate", "date", false, item.feedbackDate || "")}${area("التغذية الراجعة / الإجراء المتخذ", "feedback", false, item.feedback || "")}
      <div class="forms-actions forms-wide"><button class="btn btn-primary" type="submit">حفظ المتابعة</button><button class="btn btn-ghost" type="button" id="forms-word">تصدير Word</button><button class="btn btn-ghost" type="button" id="forms-print">طباعة</button><button class="btn btn-ghost forms-danger" type="button" id="forms-delete">حذف</button></div>
    </form></div>${workflowBlock(item)}</div>`;
  root.querySelector("[name=status]").value = item.status || "pending";
  root.querySelector("#forms-back").addEventListener("click", back);
  root.querySelector("#feedback-form").addEventListener("submit", async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target).entries()); await updateDepartmentForm(id, data); alert("تم حفظ المتابعة"); await renderDetail(root, id, back); });
  root.querySelector("#forms-print").addEventListener("click", () => window.print());
  root.querySelector("#forms-word").addEventListener("click", () => {
    const report = buildDepartmentFormReportHtml(item, new Date().toLocaleString("ar-BH"));
    const safeName = `${item.title || "استمارة"}-${item.student?.name || item.studentId || item.id}`.replace(/[\\/:*?"<>|]/g, "-");
    downloadAsWordDoc(item.title || "استمارة القسم", report, safeName);
  });
  root.querySelector("#forms-delete").addEventListener("click", async () => { if (!confirm("حذف هذه الاستمارة من السجل؟")) return; await removeDepartmentForm(id); back(); });
}

async function imageToDataUrl(file) {
  if (!file) return ""; if (!file.type.startsWith("image/")) throw new Error("اختر ملف صورة");
  const image = new Image(); image.src = URL.createObjectURL(file); await image.decode();
  const scale = Math.min(1, 400 / Math.max(image.width, image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(image.src); return canvas.toDataURL("image/jpeg", .78);
}

const TEACHERS_PAGE_SIZE = 25;

async function renderTeachers(root, { query = "", page = 0, editTeacher = null } = {}) {
  const offset = page * TEACHERS_PAGE_SIZE;
  const { rows: teachers, total } = await listTeachersDirectory({ query, offset, limit: TEACHERS_PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / TEACHERS_PAGE_SIZE));
  const current = editTeacher || {};
  root.innerHTML = `<div class="card forms-card"><h2>${editTeacher ? "تعديل بيانات المعلم" : "إضافة معلم"}</h2><form id="teacher-form" class="forms-grid"><input type="hidden" name="id" value="${esc(current.id || "")}"><input type="hidden" name="createdAt" value="${esc(current.createdAt || "")}">${field("اسم المعلم", "name", "text", true, current.name || "")}${field("الاسم باللغة الإنجليزية", "nameEn", "text", false, current.nameEn || "")}${field("الرقم الشخصي", "personalNo", "text", false, current.personalNo || "")}${field("الرقم الوظيفي", "employeeNo", "text", false, current.employeeNo || "")}${field("المسمى الوظيفي", "jobTitle", "text", false, current.jobTitle || "")}${field("القسم / المادة", "department", "text", false, current.department || "")}${field("رقم التواصل", "phone", "tel", false, current.phone || "")}${field("البريد الإلكتروني", "email", "email", false, current.email || "")}${area("ملاحظات", "notes", false, current.notes || "")}<label class="forms-field"><span>${editTeacher?.hasPhoto ? "استبدال الصورة (اختياري)" : "الصورة"}</span><input name="photo" type="file" accept="image/*">${editTeacher?.hasPhoto ? '<small class="hint">اتركه فارغًا للاحتفاظ بالصورة الحالية.</small>' : ""}</label><div class="forms-actions forms-wide"><button class="btn btn-primary">${editTeacher ? "حفظ التعديلات" : "حفظ المعلم"}</button>${editTeacher ? '<button class="btn btn-ghost" type="button" id="teacher-edit-cancel">إلغاء التعديل</button>' : ""}</div></form></div>
    <div class="card"><div class="forms-toolbar"><div><h2>جدول بيانات المعلمين (${total})</h2><div class="hint">تُحمّل صور الصفحة الحالية فقط لتقليل استهلاك البيانات.</div></div><div class="search"><input id="teacher-search" type="search" value="${esc(query)}" placeholder="بحث بالاسم أو الرقم أو القسم..."></div></div><div id="teachers-table"></div></div>`;
  root.querySelector("#teacher-edit-cancel")?.addEventListener("click", () => renderTeachers(root, { query, page }));
  root.querySelector("#teacher-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try {
      const newPhoto = event.target.photo.files[0];
      data.photoDataUrl = newPhoto ? await imageToDataUrl(newPhoto) : (editTeacher?.hasPhoto ? await getTeacherPhoto(editTeacher.id) : "");
      delete data.photo;
      if (!data.id) delete data.id;
      if (!data.createdAt) delete data.createdAt;
      await saveTeacher(data);
      alert(editTeacher ? "تم تحديث بيانات المعلم" : "تم حفظ بيانات المعلم");
      await renderTeachers(root, { query, page });
    } catch (error) { alert(error.message); }
  });
  const tableRoot = root.querySelector("#teachers-table");
  tableRoot.innerHTML = teachers.length ? `<div class="tablewrap"><table class="teachers-table"><thead><tr><th>الصورة</th><th>المعلم</th><th>الرقم الشخصي</th><th>القسم</th><th>الوظيفة</th><th>التواصل</th><th></th></tr></thead><tbody>${teachers.map((teacher) => `<tr><td>${teacher.hasPhoto ? `<img data-teacher-photo="${esc(teacher.id)}" alt="صورة ${esc(teacher.name)}">` : '<div class="teacher-avatar">م</div>'}</td><td><strong>${esc(teacher.name)}</strong><div class="hint" dir="ltr">${esc(teacher.nameEn)}</div></td><td class="num">${esc(teacher.personalNo || teacher.employeeNo) || "—"}</td><td>${esc(teacher.department) || "—"}</td><td>${esc(teacher.jobTitle) || "—"}</td><td>${teacher.phone ? `<a href="tel:${esc(teacher.phone)}">${esc(teacher.phone)}</a><br>` : ""}${teacher.email ? `<a href="mailto:${esc(teacher.email)}">${esc(teacher.email)}</a>` : "—"}</td><td><div class="forms-actions"><button class="link-btn" data-edit-teacher="${esc(teacher.id)}">تعديل</button><button class="link-btn forms-danger" data-remove-teacher="${esc(teacher.id)}">حذف</button></div></td></tr>`).join("")}</tbody></table></div><div class="forms-actions" style="justify-content:center;margin-top:12px;"><button class="btn btn-ghost" id="teachers-prev" ${page <= 0 ? "disabled" : ""}>السابق</button><span class="hint">صفحة ${page + 1} من ${pageCount}</span><button class="btn btn-ghost" id="teachers-next" ${page + 1 >= pageCount ? "disabled" : ""}>التالي</button></div>` : '<div class="empty">لا توجد بيانات مطابقة</div>';
  tableRoot.querySelectorAll("[data-edit-teacher]").forEach((button) => button.addEventListener("click", async () => {
    const teacher = teachers.find((item) => item.id === button.dataset.editTeacher);
    await renderTeachers(root, { query, page, editTeacher: teacher });
    root.querySelector("#teacher-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  tableRoot.querySelectorAll("[data-remove-teacher]").forEach((button) => button.addEventListener("click", async () => { if (!confirm("حذف بيانات هذا المعلم؟")) return; await removeTeacher(button.dataset.removeTeacher); await renderTeachers(root, { query, page }); }));
  tableRoot.querySelector("#teachers-prev")?.addEventListener("click", () => renderTeachers(root, { query, page: page - 1 }));
  tableRoot.querySelector("#teachers-next")?.addEventListener("click", () => renderTeachers(root, { query, page: page + 1 }));
  let searchTimer;
  root.querySelector("#teacher-search").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderTeachers(root, { query: event.target.value.trim(), page: 0 }), 300); });
  await Promise.all([...tableRoot.querySelectorAll("[data-teacher-photo]")].map(async (image) => {
    try { const photo = await getTeacherPhoto(image.dataset.teacherPhoto); if (photo) image.src = photo; else image.replaceWith(Object.assign(document.createElement("div"), { className: "teacher-avatar", textContent: "م" })); }
    catch { image.replaceWith(Object.assign(document.createElement("div"), { className: "teacher-avatar", textContent: "م" })); }
  }));
}

export async function mountFormsView(container) {
  container.innerHTML = `<div class="topbar"><div><h1>الاستمارات والسجلات</h1><div class="sub">إحالات القسم، طلبات تغيير الشعب، موافقات أولياء الأمور، وسجل المعلمين</div></div></div><div class="tabs" role="tablist"><button class="tab active" data-tab="new">استمارة جديدة</button><button class="tab" data-tab="log">سجل الاستمارات</button><button class="tab" data-tab="teachers">بيانات المعلمين</button></div><div id="forms-content"></div>`;
  const content = container.querySelector("#forms-content");
  async function show(tab) {
    container.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    content.innerHTML = '<div class="empty" role="status">جارٍ تحميل البيانات…</div>';
    try {
      if (tab === "new") await renderCreate(content, show);
      else if (tab === "log") {
        const back = () => show("log");
        const openDetail = (id) => renderDetail(content, id, back);
        const openEdit = (id) => renderEdit(content, id, back, openDetail);
        await renderLog(content, openDetail, openEdit);
      }
      else await renderTeachers(content);
    } catch (error) {
      console.error("تعذر تحميل قسم الاستمارات", error);
      content.innerHTML = `<div class="card"><div class="empty" role="alert">تعذر تحميل البيانات من الخادم. تأكد من تطبيق تحديث قاعدة البيانات ثم حاول مجددًا.<br><button class="btn btn-primary" id="forms-retry" style="margin-top:12px;">إعادة المحاولة</button></div></div>`;
      content.querySelector("#forms-retry")?.addEventListener("click", () => show(tab));
    }
  }
  container.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => show(button.dataset.tab))); await show("new");
}
