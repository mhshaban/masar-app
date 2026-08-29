import { mountStudentPicker } from "../shared/student-picker.js";
import {
  FORM_TYPES, createDepartmentForm, listDepartmentForms, getDepartmentForm,
  updateDepartmentForm, removeDepartmentForm, listTeachers, saveTeacher, removeTeacher,
} from "./forms-service.js";
import { buildDepartmentFormReportHtml } from "../../services/report-builders.js";
import { downloadAsWordDoc } from "../../services/word-export.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const field = (label, name, type = "text", required = false, value = "") => `<label class="forms-field"><span>${label}${required ? " *" : ""}</span><input name="${name}" type="${type}" ${required ? "required" : ""} value="${esc(value)}"></label>`;
const area = (label, name, required = false, value = "") => `<label class="forms-field forms-wide"><span>${label}${required ? " *" : ""}</span><textarea name="${name}" rows="3" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;

function studentCard(student) {
  if (!student) return '<div class="forms-student empty">لم يتم اختيار طالب بعد</div>';
  return `<div class="forms-student"><strong>${esc(student.name)}</strong><span>الرقم الأكاديمي: ${esc(student.academicId) || "—"}</span><span>الرقم الشخصي: ${esc(student.civilId) || "—"}</span><span>المستوى: ${esc(student.level) || "—"}</span><span>الشعبة: ${esc(student.section) || "—"}</span><span>المسار/التخصص: ${esc(student.track || student.specialization) || "—"}</span></div>`;
}

function typeFields(type) {
  const def = FORM_TYPES[type];
  if (def.kind === "referral") return `
    ${area("سبب التحويل وملخص الحالة", "reason", true)}
    ${area("الإجراء المطلوب من الجهة المحال إليها", "requestedAction")}
    ${area("مرفقات أو ملاحظات", "notes")}`;
  if (def.kind === "section_change") return `
    <label class="forms-field"><span>نوع الطلب *</span><select name="requestKind" required><option value="">اختر</option><option value="section">تغيير شعبة</option><option value="specialization">تحويل تخصص</option></select></label>
    ${field("اسم ولي الأمر (مقدم الطلب)", "guardianName", "text", true)}
    ${field("الرقم الشخصي لولي الأمر", "guardianPersonalNo")}
    ${field("رقم التواصل", "guardianPhone", "tel")}
    ${field("الشعبة/التخصص الحالي", "currentPlacement")}
    ${field("الشعبة/التخصص المطلوب", "requestedPlacement")}
    ${area("سبب الطلب", "reason", true)}
    ${area("رأي قسم الإرشاد الأكاديمي والتوجيه المهني", "guidanceOpinion")}
    ${area("رأي قسم الإرشاد الاجتماعي (للحالات الخاصة والمرضية)", "socialOpinion")}
    ${area("رأي قسم التسجيل", "registrationOpinion")}
    ${area("قرار إدارة المدرسة النهائي", "finalDecision")}`;
  return `
    ${field("اسم ولي الأمر", "guardianName", "text", true)}
    ${field("العنوان", "address")}
    ${field("الموضوع / اسم الفعالية", "subject", "text", true)}
    ${area("نص طلب الموافقة", "consentText", true, "نرجو من حضرتكم موافاتنا بموافقتكم على مشاركة ابنكم في هذه الفعالية.")}
    <label class="forms-field"><span>رد ولي الأمر</span><select name="guardianResponse"><option value="pending">بانتظار الرد</option><option value="approved">موافق</option><option value="declined">غير موافق</option></select></label>
    ${field("الرقم الشخصي لولي الأمر", "guardianPersonalNo")}
    ${field("رقم التواصل", "guardianPhone", "tel")}
    ${field("التاريخ", "responseDate", "date")}
    ${field("التوقيع / اسم ولي الأمر المقرّ", "signature")}`;
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

async function renderLog(root, openDetail) {
  const forms = await listDepartmentForms();
  root.innerHTML = `<div class="card"><div class="forms-toolbar"><div class="search"><input id="forms-search" type="search" placeholder="بحث بالطالب أو نوع الاستمارة..."></div><select id="forms-status"><option value="">كل الحالات</option><option value="pending">بانتظار الإجراء</option><option value="in_progress">قيد الإجراء</option><option value="completed">مكتملة</option><option value="rejected">مرفوضة</option></select></div><div id="forms-table"></div></div>`;
  const table = root.querySelector("#forms-table");
  function draw() {
    const q = root.querySelector("#forms-search").value.trim().toLowerCase(); const status = root.querySelector("#forms-status").value;
    const filtered = forms.filter((item) => (!status || item.status === status) && (!q || `${item.student?.name || ""} ${item.student?.academicId || ""} ${item.title || ""}`.toLowerCase().includes(q)));
    table.innerHTML = filtered.length ? `<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>الاستمارة</th><th>الطالب</th><th>الجهة/الحالة</th><th></th></tr></thead><tbody>${filtered.map((item) => `<tr><td class="num">${esc(item.createdDate)}</td><td>${esc(item.title)}</td><td><strong>${esc(item.student?.name)}</strong><div class="hint">${esc(item.student?.academicId)}</div></td><td>${item.destination ? `${esc(item.destination)}<br>` : ""}${statusPill(item.status)}</td><td><button class="btn btn-ghost" data-open="${esc(item.id)}">فتح</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">لا توجد استمارات مطابقة</div>';
    table.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.open)));
  }
  root.querySelector("#forms-search").addEventListener("input", draw); root.querySelector("#forms-status").addEventListener("change", draw); draw();
}

function detailFields(item) {
  const labels = { reason: "السبب", requestedAction: "الإجراء المطلوب", notes: "ملاحظات", requestKind: "نوع الطلب", guardianName: "اسم ولي الأمر", guardianPersonalNo: "الرقم الشخصي لولي الأمر", guardianPhone: "رقم التواصل", currentPlacement: "الوضع الحالي", requestedPlacement: "الوضع المطلوب", guidanceOpinion: "رأي الإرشاد الأكاديمي والتوجيه المهني", socialOpinion: "رأي الإرشاد الاجتماعي", registrationOpinion: "رأي التسجيل", finalDecision: "قرار إدارة المدرسة", address: "العنوان", subject: "الموضوع", consentText: "نص الموافقة", guardianResponse: "رد ولي الأمر", responseDate: "تاريخ الرد", signature: "التوقيع/الإقرار" };
  const translations = { section: "تغيير شعبة", specialization: "تحويل تخصص", pending: "بانتظار الرد", approved: "موافق", declined: "غير موافق" };
  return Object.entries(item.fields || {}).filter(([key, value]) => value && key !== "createdDate").map(([key, value]) => `<div class="forms-detail-row"><span>${esc(labels[key] || key)}</span><strong>${esc(translations[value] || value)}</strong></div>`).join("");
}

async function renderDetail(root, id, back) {
  const item = await getDepartmentForm(id); if (!item) return back();
  root.innerHTML = `<button class="backlink" id="forms-back">رجوع لسجل الاستمارات</button><div class="forms-print" id="form-printable">
    <div class="topbar"><div><h1>${esc(item.title)}</h1><div class="sub">رقم السجل: ${esc(item.id)} · ${esc(item.createdDate)}</div></div>${statusPill(item.status)}</div>
    <div class="card"><h2>بيانات الطالب</h2>${studentCard(item.student)}</div>
    <div class="card"><h2>بيانات الاستمارة</h2>${detailFields(item)}</div>
    <div class="card"><h2>الإجراء والتغذية الراجعة</h2><div class="forms-print-feedback"><div class="forms-detail-row"><span>الحالة</span><strong>${esc(({ pending: "بانتظار الإجراء", in_progress: "قيد الإجراء", completed: "مكتملة", rejected: "مرفوضة" })[item.status] || "—")}</strong></div><div class="forms-detail-row"><span>تاريخ التغذية الراجعة</span><strong>${esc(item.feedbackDate || "—")}</strong></div><div class="forms-detail-row"><span>التغذية الراجعة / الإجراء المتخذ</span><strong>${esc(item.feedback || "—")}</strong></div></div><form id="feedback-form" class="forms-grid">
      <label class="forms-field"><span>حالة الطلب</span><select name="status"><option value="pending">بانتظار الإجراء</option><option value="in_progress">قيد الإجراء</option><option value="completed">مكتملة</option><option value="rejected">مرفوضة</option></select></label>
      ${field("تاريخ التغذية الراجعة", "feedbackDate", "date", false, item.feedbackDate || "")}${area("التغذية الراجعة / الإجراء المتخذ", "feedback", false, item.feedback || "")}
      <div class="forms-actions forms-wide"><button class="btn btn-primary" type="submit">حفظ المتابعة</button><button class="btn btn-ghost" type="button" id="forms-word">تصدير Word</button><button class="btn btn-ghost" type="button" id="forms-print">طباعة</button><button class="btn btn-ghost forms-danger" type="button" id="forms-delete">حذف</button></div>
    </form></div></div>`;
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

async function renderTeachers(root) {
  const teachers = await listTeachers();
  root.innerHTML = `<div class="card forms-card"><h2>إضافة معلم</h2><form id="teacher-form" class="forms-grid">${field("اسم المعلم", "name", "text", true)}${field("الاسم باللغة الإنجليزية", "nameEn")}${field("الرقم الشخصي", "personalNo")}${field("الرقم الوظيفي", "employeeNo")}${field("المسمى الوظيفي", "jobTitle")}${field("القسم / المادة", "department")}${field("رقم التواصل", "phone", "tel")}${field("البريد الإلكتروني", "email", "email")}${area("ملاحظات", "notes")}<label class="forms-field"><span>الصورة</span><input name="photo" type="file" accept="image/*"></label><div class="forms-actions forms-wide"><button class="btn btn-primary">حفظ المعلم</button></div></form></div>
    <div class="card"><div class="forms-toolbar"><div><h2>جدول بيانات المعلمين (${teachers.length})</h2></div><div class="search"><input id="teacher-search" type="search" placeholder="بحث بالاسم أو الرقم أو القسم..."></div></div><div id="teachers-table"></div></div>`;
  root.querySelector("#teacher-form").addEventListener("submit", async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target).entries()); try { data.photoDataUrl = await imageToDataUrl(event.target.photo.files[0]); delete data.photo; await saveTeacher(data); alert("تم حفظ بيانات المعلم"); await renderTeachers(root); } catch (error) { alert(error.message); } });
  const tableRoot = root.querySelector("#teachers-table");
  function drawTeachers() {
    const q = root.querySelector("#teacher-search").value.trim().toLowerCase();
    const filtered = teachers.filter((teacher) => !q || `${teacher.name || ""} ${teacher.nameEn || ""} ${teacher.personalNo || ""} ${teacher.employeeNo || ""} ${teacher.department || ""} ${teacher.jobTitle || ""}`.toLowerCase().includes(q));
    tableRoot.innerHTML = filtered.length ? `<div class="tablewrap"><table class="teachers-table"><thead><tr><th>الصورة</th><th>المعلم</th><th>الرقم الشخصي</th><th>القسم</th><th>الوظيفة</th><th>التواصل</th><th></th></tr></thead><tbody>${filtered.map((teacher) => `<tr>${teacher.photoDataUrl ? `<td><img src="${teacher.photoDataUrl}" alt="صورة ${esc(teacher.name)}"></td>` : '<td><div class="teacher-avatar">م</div></td>'}<td><strong>${esc(teacher.name)}</strong><div class="hint" dir="ltr">${esc(teacher.nameEn)}</div></td><td class="num">${esc(teacher.personalNo || teacher.employeeNo) || "—"}</td><td>${esc(teacher.department) || "—"}</td><td>${esc(teacher.jobTitle) || "—"}</td><td>${teacher.phone ? `<a href="tel:${esc(teacher.phone)}">${esc(teacher.phone)}</a><br>` : ""}${teacher.email ? `<a href="mailto:${esc(teacher.email)}">${esc(teacher.email)}</a>` : "—"}</td><td><button class="link-btn forms-danger" data-remove-teacher="${esc(teacher.id)}">حذف</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">لا توجد بيانات مطابقة</div>';
    tableRoot.querySelectorAll("[data-remove-teacher]").forEach((button) => button.addEventListener("click", async () => { if (!confirm("حذف بيانات هذا المعلم؟")) return; await removeTeacher(button.dataset.removeTeacher); await renderTeachers(root); }));
  }
  root.querySelector("#teacher-search").addEventListener("input", drawTeachers); drawTeachers();
}

export async function mountFormsView(container) {
  container.innerHTML = `<div class="topbar"><div><h1>الاستمارات والسجلات</h1><div class="sub">إحالات القسم، طلبات تغيير الشعب، موافقات أولياء الأمور، وسجل المعلمين</div></div></div><div class="tabs" role="tablist"><button class="tab active" data-tab="new">استمارة جديدة</button><button class="tab" data-tab="log">سجل الاستمارات</button><button class="tab" data-tab="teachers">بيانات المعلمين</button></div><div id="forms-content"></div>`;
  const content = container.querySelector("#forms-content");
  async function show(tab) { container.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab)); if (tab === "new") await renderCreate(content, show); else if (tab === "log") await renderLog(content, (id) => renderDetail(content, id, () => show("log"))); else await renderTeachers(content); }
  container.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => show(button.dataset.tab))); await show("new");
}
