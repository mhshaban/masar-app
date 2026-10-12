import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { listTeachers } from "./forms-service.js?v=2026-09-08-form-fields-1";
import { printMarkupInPopup } from "./print-popup.js?v=2026-10-12-event-approval-1";
import {
  SCHOOL_NAME, DEPARTMENT_NAME, EVENT_TYPES, BENEFICIARY_GROUPS, OTHER_SCHOOL_GROUPS,
  durationLabel, normalizeEventApproval, listEventApprovals, getEventApproval, saveEventApproval, removeEventApproval,
} from "./event-approval-service.js?v=2026-10-12-event-approval-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const FORM_TITLE = "استمارة طلب اعتماد فعالية مدرسية";

const input = (label, name, value = "", { type = "text", required = false, wide = false, list = "", dir = "" } = {}) =>
  `<label class="forms-field${wide ? " forms-wide" : ""}"><span>${label}${required ? " *" : ""}</span><input name="${name}" type="${type}" value="${esc(value)}"${required ? " required" : ""}${list ? ` list="${list}" autocomplete="off"` : ""}${dir ? ` dir="${dir}"` : ""}></label>`;
const textarea = (label, name, value = "") =>
  `<label class="forms-field forms-wide"><span>${label}</span><textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;
const section = (title) => `<h3 class="forms-wide event-approval-section">${title}</h3>`;
const countInputs = (prefix, groups, values = {}) => groups.map(({ key, label }) =>
  `<label class="forms-field"><span>${label}</span><input name="${prefix}_${key}" type="number" min="0" step="1" inputmode="numeric" value="${esc(values[key] ?? "")}"></label>`).join("");

function formatTime(t) {
  const [h, m] = String(t || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t || "";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}

function formatDate(date) {
  if (!date) return "";
  const parsed = new Date(date);
  const day = Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("ar-BH", { timeZone: "Asia/Bahrain", weekday: "long" }).format(parsed);
  return `${esc(day)} <span dir="ltr">${esc(date)}</span>`;
}

// نفس قالب طباعة استمارات مسار (سطر القسم + العنوان + بطاقات)، ببنود
// المدرسة والقسم فقط من النموذج الرسمي.
export function eventApprovalMarkup(raw) {
  const d = normalizeEventApproval(raw);
  const v = (value) => (value ? esc(value) : "—");
  const multi = (value) => (value ? `<div class="ea-multiline">${esc(value)}</div>` : "—");
  const time = (t) => v(formatTime(t));
  return `<table class="forms-print event-approval-print">
    <thead><tr><td>
      <div class="print-dept-line">${esc(DEPARTMENT_NAME)}</div>
      <div class="topbar"><div><h1>${FORM_TITLE}</h1><div class="sub">تاريخ الطلب: ${v(d.requestDate)}</div></div></div>
    </td></tr></thead>
    <tbody><tr><td>
      <div class="card"><h2>بيانات الفعالية</h2>
        <div class="tablewrap"><table class="ea-pairs">
          <tr><th>اسم الفعالية</th><td colspan="3"><strong>${v(d.title)}</strong></td></tr>
          <tr><th>اسم المدرسة</th><td colspan="3">${v(d.schoolName)}</td></tr>
          <tr><th>نوع الفعالية / النشاط المطلوب</th><td>${v(d.eventType)}</td><th>الجهة المعنية</th><td>${v(d.concernedParty)}</td></tr>
          <tr><th>وصف الفعالية / النشاط</th><td colspan="3">${multi(d.description)}</td></tr>
          <tr><th>مبررات تنفيذ الفعالية / أهداف الفعالية</th><td colspan="3">${multi(d.objectives)}</td></tr>
        </table></div>
      </div>
      <div class="card"><h2>موعد التنفيذ والتمويل</h2>
        <div class="tablewrap"><table class="ea-pairs">
          <tr><th>تاريخ التنفيذ</th><td>${formatDate(d.date) || "—"}</td><th>المدة الزمنية</th><td>${v(d.duration)}</td></tr>
          <tr><th>من الساعة</th><td>${time(d.startTime)}</td><th>إلى الساعة</th><td>${time(d.endTime)}</td></tr>
          <tr><th>اسم الراعي</th><td>${v(d.sponsor)}</td><th>الميزانية المخصصة</th><td>${v(d.budget)}</td></tr>
        </table></div>
      </div>
      <div class="card"><h2>الجهة المنظمة والمشرف على التنظيم</h2>
        <div class="tablewrap"><table>
          <thead><tr><th></th><th>الاسم</th><th>المسمى الوظيفي</th><th>جهة العمل</th></tr></thead>
          <tbody>
            <tr><th>الجهة المنظمة</th><td>${v(d.organizerName)}</td><td>${v(d.organizerTitle)}</td><td>${v(d.organizerWorkplace)}</td></tr>
            <tr><th>المشرف على التنظيم</th><td>${v(d.supervisorName)}</td><td>${v(d.supervisorTitle)}</td><td>—</td></tr>
          </tbody>
        </table></div>
      </div>
      <div class="card"><h2>المحاضر والجهات المتعاونة</h2>
        <div class="tablewrap"><table class="ea-pairs">
          <tr><th>اسم المحاضر / منفذ الورشة أو الندوة</th><td>${v(d.presenterName)}</td><th>جهة العمل</th><td>${v(d.presenterWorkplace)}</td></tr>
          <tr><th>الجهات الأخرى المتعاونة</th><td colspan="3">${v(d.partners)}</td></tr>
        </table></div>
      </div>
      <div class="card"><h2>عدد المنتفعين</h2>
        <div class="tablewrap"><table class="ea-counts">
          <thead><tr><th></th>${BENEFICIARY_GROUPS.map((g) => `<th>${g.label}</th>`).join("")}</tr></thead>
          <tbody>
            <tr><th>من المدرسة</th>${BENEFICIARY_GROUPS.map((g) => `<td>${v(d.beneficiaries[g.key])}</td>`).join("")}</tr>
            <tr><th>من مدارس أخرى</th>${BENEFICIARY_GROUPS.map((g) => `<td>${g.key in d.otherSchoolBeneficiaries ? v(d.otherSchoolBeneficiaries[g.key]) : "—"}</td>`).join("")}</tr>
          </tbody>
        </table></div>
      </div>
      <div class="card"><h2>أهم الملاحظات</h2>${multi(d.notes)}</div>
      <div class="print-approval form-workflow"><strong>اعتماد مدير المدرسة</strong><div class="workflow-signatures"><span>الاسم: ................................</span><span>التوقيع: ................................</span><span>ختم المدرسة:</span></div></div>
    </td></tr></tbody>
  </table>`;
}

const printApproval = (data) => printMarkupInPopup(data.title || FORM_TITLE, eventApprovalMarkup(data));

async function renderLog(root, onNew, onEdit) {
  const rows = await listEventApprovals();
  root.innerHTML = `<div class="card">
    <div class="card-head">
      <h2>استمارات اعتماد الفعاليات المحفوظة (${rows.length})</h2>
      <button class="btn btn-primary" id="approval-new-btn" type="button">+ استمارة اعتماد جديدة</button>
    </div>
    ${rows.length ? `<div class="tablewrap"><table>
      <thead><tr><th>اسم الفعالية</th><th>نوع الفعالية</th><th>تاريخ التنفيذ</th><th>تاريخ الطلب</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${esc(r.title)}</td><td>${esc(r.eventType) || "—"}</td><td class="num">${esc(r.date) || "—"}</td><td class="num">${esc(r.requestDate) || "—"}</td>
        <td><div class="forms-actions"><button class="btn btn-ghost" data-edit="${esc(r.id)}" type="button">تعديل</button><button class="btn btn-ghost" data-print="${esc(r.id)}" type="button">طباعة</button><button class="btn btn-ghost forms-danger" data-remove="${esc(r.id)}" type="button">حذف</button></div></td>
      </tr>`).join("")}</tbody>
    </table></div>` : '<div class="empty">لا توجد استمارات اعتماد محفوظة بعد</div>'}
  </div>`;
  root.querySelector("#approval-new-btn").addEventListener("click", onNew);
  root.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => onEdit(btn.dataset.edit)));
  root.querySelectorAll("[data-print]").forEach((btn) => btn.addEventListener("click", () => printApproval(rows.find((r) => r.id === btn.dataset.print))));
  root.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!await confirmDialog("حذف استمارة الاعتماد هذه نهائيًا؟")) return;
    await removeEventApproval(btn.dataset.remove);
    await renderLog(root, onNew, onEdit);
  }));
}

async function renderEditor(root, id, onDone) {
  const [teachers, existing] = await Promise.all([listTeachers(), id ? getEventApproval(id) : Promise.resolve(null)]);
  if (id && !existing) { notify("استمارة الاعتماد غير موجودة"); await onDone(); return; }
  const e = existing || { schoolName: SCHOOL_NAME, requestDate: today(), concernedParty: DEPARTMENT_NAME, organizerWorkplace: SCHOOL_NAME };
  const jobTitleOf = new Map(teachers.filter((t) => t.name && t.jobTitle).map((t) => [t.name.trim(), t.jobTitle.trim()]));

  root.innerHTML = `<div class="card forms-card">
    <div class="card-head">
      <h2>${id ? "تعديل استمارة اعتماد الفعالية" : "استمارة اعتماد فعالية جديدة"}</h2>
      <button class="btn btn-ghost" type="button" id="approval-back">رجوع للسجل</button>
    </div>
    <p class="hint">بنود المدرسة والقسم فقط من استمارة طلب اعتماد فعالية مدرسية. الخانات الفارغة تُطبع فارغة لتعبئتها يدويًا.</p>
    <form id="approval-form" class="forms-grid">
      ${section("بيانات الفعالية")}
      ${input("اسم الفعالية", "title", e.title, { required: true, wide: true })}
      ${input("اسم المدرسة", "schoolName", e.schoolName)}
      ${input("تاريخ الطلب", "requestDate", e.requestDate, { type: "date" })}
      ${input("نوع الفعالية / النشاط المطلوب", "eventType", e.eventType, { list: "approval-event-types" })}
      ${input("الجهة المعنية", "concernedParty", e.concernedParty)}
      ${textarea("وصف الفعالية / النشاط", "description", e.description)}
      ${textarea("مبررات تنفيذ الفعالية / أهداف الفعالية", "objectives", e.objectives)}
      ${section("موعد التنفيذ والتمويل")}
      ${input("تاريخ التنفيذ", "date", e.date, { type: "date" })}
      ${input("المدة الزمنية", "duration", e.duration)}
      ${input("من الساعة", "startTime", e.startTime, { type: "time" })}
      ${input("إلى الساعة", "endTime", e.endTime, { type: "time" })}
      ${input("اسم الراعي", "sponsor", e.sponsor)}
      ${input("الميزانية المخصصة", "budget", e.budget)}
      ${section("الجهة المنظمة")}
      ${input("الاسم", "organizerName", e.organizerName, { list: "approval-teachers" })}
      ${input("المسمى الوظيفي", "organizerTitle", e.organizerTitle)}
      ${input("جهة العمل", "organizerWorkplace", e.organizerWorkplace, { wide: true })}
      ${section("المشرف على التنظيم")}
      ${input("الاسم", "supervisorName", e.supervisorName, { list: "approval-teachers" })}
      ${input("المسمى الوظيفي", "supervisorTitle", e.supervisorTitle)}
      ${section("المحاضر والجهات المتعاونة")}
      ${input("اسم المحاضر / منفذ الورشة أو الندوة", "presenterName", e.presenterName)}
      ${input("جهة العمل", "presenterWorkplace", e.presenterWorkplace)}
      ${input("الجهات الأخرى المتعاونة", "partners", e.partners, { wide: true })}
      ${section("عدد المنتفعين")}
      <div class="forms-wide event-approval-counts">${countInputs("ben", BENEFICIARY_GROUPS, e.beneficiaries)}</div>
      ${section("عدد المنتفعين من مدارس أخرى")}
      <div class="forms-wide event-approval-counts">${countInputs("other", OTHER_SCHOOL_GROUPS, e.otherSchoolBeneficiaries)}</div>
      ${section("ملاحظات")}
      ${textarea("أهم الملاحظات", "notes", e.notes)}
      <datalist id="approval-event-types">${EVENT_TYPES.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist>
      <datalist id="approval-teachers">${teachers.map((t) => t.name).filter(Boolean).map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      <div class="forms-actions forms-wide">
        <button class="btn btn-primary" type="submit" id="approval-save">حفظ الاستمارة</button>
        <button class="btn btn-ghost" type="button" id="approval-print">طباعة</button>
      </div>
    </form>
  </div>`;

  const form = root.querySelector("#approval-form");
  const values = () => Object.fromEntries(new FormData(form).entries());
  root.querySelector("#approval-back").addEventListener("click", onDone);

  // المدة تُحسب من الوقتين تلقائيًا ما لم يكتبها المستخدم بنفسه.
  const duration = form.elements.duration;
  if (!duration.value || duration.value === durationLabel(e.startTime, e.endTime)) duration.dataset.auto = "1";
  duration.addEventListener("input", () => { delete duration.dataset.auto; });
  for (const name of ["startTime", "endTime"]) form.elements[name].addEventListener("change", () => {
    if (duration.dataset.auto) duration.value = durationLabel(form.elements.startTime.value, form.elements.endTime.value);
  });

  // اختيار اسم معلم من القائمة يعبّئ مسماه الوظيفي من بيانات المعلمين لو الخانة فارغة.
  for (const [nameField, titleField] of [["organizerName", "organizerTitle"], ["supervisorName", "supervisorTitle"]]) {
    form.elements[nameField].addEventListener("change", () => {
      const jobTitle = jobTitleOf.get(form.elements[nameField].value.trim());
      if (jobTitle && !form.elements[titleField].value.trim()) form.elements[titleField].value = jobTitle;
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = root.querySelector("#approval-save");
    const original = button.textContent; button.disabled = true; button.textContent = "جارٍ الحفظ…";
    try {
      await saveEventApproval(id, values());
      notify(id ? "تم حفظ التعديلات" : "تم حفظ استمارة الاعتماد");
      await onDone();
    } catch (error) { notify(error.message || "تعذر حفظ الاستمارة"); }
    finally { button.disabled = false; button.textContent = original; }
  });

  root.querySelector("#approval-print").addEventListener("click", async () => {
    const data = values();
    if (!data.title?.trim()) { notify("اكتب اسم الفعالية أولًا"); return; }
    await printApproval(data);
  });
}

export async function renderEventApprovals(root) {
  const showLog = () => renderLog(root, () => showEditor(null), (id) => showEditor(id));
  const showEditor = (id) => renderEditor(root, id, showLog);
  await showLog();
}
