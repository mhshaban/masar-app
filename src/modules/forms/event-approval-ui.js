import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { listTeachers } from "./forms-service.js?v=2026-09-08-form-fields-1";
import { dayName, formatDate, formatTime } from "./official-task-ui.js?v=2026-11-22-official-task-3";
import {
  SCHOOL_NAME, DEPARTMENT_NAME, EVENT_TYPES, BENEFICIARY_GROUPS, OTHER_SCHOOL_GROUPS,
  durationLabel, normalizeEventApproval, listEventApprovals, getEventApproval, saveEventApproval, removeEventApproval,
} from "./event-approval-service.js?v=2026-10-12-event-approval-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const FORM_TITLE = "استمارة طلب إعتماد فعالية مدرسية";

const input = (label, name, value = "", { type = "text", required = false, wide = false, list = "", dir = "" } = {}) =>
  `<label class="forms-field${wide ? " forms-wide" : ""}"><span>${label}${required ? " *" : ""}</span><input name="${name}" type="${type}" value="${esc(value)}"${required ? " required" : ""}${list ? ` list="${list}" autocomplete="off"` : ""}${dir ? ` dir="${dir}"` : ""}></label>`;
const textarea = (label, name, value = "") =>
  `<label class="forms-field forms-wide"><span>${label}</span><textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;
const section = (title) => `<h3 class="forms-wide event-approval-section">${title}</h3>`;
const countInputs = (prefix, groups, values = {}) => groups.map(({ key, label }) =>
  `<label class="forms-field"><span>${label}</span><input name="${prefix}_${key}" type="number" min="0" step="1" inputmode="numeric" value="${esc(values[key] ?? "")}"></label>`).join("");

const LOGO_URL = new URL("../../../icons/moe-logo.png", import.meta.url).href;

// نسخة مطابقة لنموذج الوزارة الورقي «استمارة طلب إعتماد فعالية مدرسية»:
// شعار الوزارة، نفس الشبكة والخانات الرمادية وترتيبها. خانات إدارة التعليم
// وإدارة الخدمات الطلابية وتاريخ الاعتماد تُطبع فارغة لتعبئتها هناك.
export function eventApprovalMarkup(raw = {}) {
  const d = normalizeEventApproval(raw);
  const v = (value) => esc(value || "");
  const multi = (value) => `<div class="ea-multi">${esc(value || "")}</div>`;
  const th = (label, attrs = "") => `<th${attrs}>${label}</th>`;
  const ben = d.beneficiaries;
  const oth = d.otherSchoolBeneficiaries;
  return `<div class="ea-page">
    <header class="ea-head"><img src="${LOGO_URL}" alt="وزارة التربية والتعليم"></header>
    <h1 class="ea-title">${FORM_TITLE}</h1>
    <table class="ea-grid ea-info">
      <colgroup><col style="width:17%"><col style="width:15%"><col style="width:10%"><col style="width:11%"><col style="width:10%"><col style="width:11%"><col style="width:11%"><col style="width:15%"></colgroup>
      <tr>${th("اسم الفعالية")}<td colspan="7"><b>${v(d.title)}</b></td></tr>
      <tr>${th("اسم المدرسة:")}<td colspan="3" class="ea-center">${v(d.schoolName)}</td>${th("تاريخ الطلب:")}<td colspan="3"><bdi dir="ltr">${v(formatDate(d.requestDate))}</bdi></td></tr>
      <tr>${th("نوع الفعالية / النشاط المطلوب")}<td colspan="3">${v(d.eventType)}</td>${th("الجهة المعنية:")}<td colspan="3">${v(d.concernedParty)}</td></tr>
      <tr class="ea-tall">${th("وصف الفعالية / النشاط:")}<td colspan="7">${multi(d.description)}</td></tr>
      <tr class="ea-tall">${th("مبررات تنفيذ الفعالية / أهداف الفعالية:")}<td colspan="7">${multi(d.objectives)}</td></tr>
      <tr>${th("تاريخ التنفيذ:")}<td>${d.date ? `${v(dayName(d.date))} <bdi dir="ltr">${v(formatDate(d.date))}</bdi>` : ""}</td>${th("من الساعة:")}<td>${v(formatTime(d.startTime))}</td>${th("إلى الساعة:")}<td>${v(formatTime(d.endTime))}</td>${th("المدة الزمنية:")}<td>${v(d.duration)}</td></tr>
      <tr>${th("اسم الراعي:")}<td colspan="7">${v(d.sponsor)}</td></tr>
      <tr>${th("الميزانية المخصصة:")}<td colspan="7">${v(d.budget)}</td></tr>
    </table>
    <table class="ea-grid ea-cols">
      <colgroup><col style="width:19%"><col style="width:16%"><col style="width:27%"><col style="width:20%"><col style="width:18%"></colgroup>
      <tr>${th("الجهة المنظمة", ' colspan="3"')}${th("المشرف على التنظيم", ' colspan="2"')}</tr>
      <tr>${th("الاسم")}${th("المسمى الوظيفي")}${th("جهة العمل")}${th("الاسم")}${th("المسمى الوظيفي")}</tr>
      <tr class="ea-val"><td>${v(d.organizerName)}</td><td>${v(d.organizerTitle)}</td><td>${v(d.organizerWorkplace)}</td><td>${v(d.supervisorName)}</td><td>${v(d.supervisorTitle)}</td></tr>
    </table>
    <table class="ea-grid ea-cols">
      <colgroup><col style="width:40%"><col style="width:30%"><col style="width:30%"></colgroup>
      <tr>${th("اسم المحاضر / منفذ الورشة أو الندوة")}${th("جهة العمل")}${th("الجهات الأخرى المتعاونة")}</tr>
      <tr class="ea-val"><td>${v(d.presenterName)}</td><td>${v(d.presenterWorkplace)}</td><td>${v(d.partners)}</td></tr>
    </table>
    <table class="ea-grid ea-cols ea-counts">
      <colgroup><col style="width:15%"><col style="width:17%"><col style="width:17%"><col style="width:17%"><col style="width:17%"><col style="width:17%"></colgroup>
      <tr>${th("عدد المنتفعين", ' rowspan="2"')}${BENEFICIARY_GROUPS.map((g) => th(g.label)).join("")}</tr>
      <tr class="ea-val">${BENEFICIARY_GROUPS.map((g) => `<td>${v(ben[g.key])}</td>`).join("")}</tr>
      <tr>${th("عدد المنتفعين من مدارس أخرى", ' rowspan="2"')}${OTHER_SCHOOL_GROUPS.map((g) => th(g.label)).join("")}<td rowspan="2"></td></tr>
      <tr class="ea-val">${OTHER_SCHOOL_GROUPS.map((g) => `<td>${v(oth[g.key])}</td>`).join("")}</tr>
      <tr class="ea-tall">${th("أهم الملاحظات:")}<td colspan="5" class="ea-start">${multi(d.notes)}</td></tr>
      <tr class="ea-tall">${th("يعتمد من مدير(ة) المدرسة")}<td colspan="2"></td>${th("ختم المدرسة")}<td colspan="2"></td></tr>
      <tr class="ea-gap"><td colspan="6"></td></tr>
      <tr class="ea-tall">${th("ملاحظات إدارة التعليم")}<td colspan="5"></td></tr>
      <tr>${th("رأي إدارة الخدمات الطلابية", ' colspan="6"')}</tr>
      <tr class="ea-opinion"><td colspan="6"></td></tr>
      <tr class="ea-tall">${th("ملاحظات إدارة الخدمات الطلابية")}<td colspan="5"></td></tr>
    </table>
    <table class="ea-grid ea-approved">
      <colgroup><col style="width:15%"><col style="width:18%"></colgroup>
      <tr>${th("تاريخ الاعتماد")}<td></td></tr>
    </table>
  </div>`;
}

export const PRINT_CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #000; }
  body { font-family: "Sakkal Majalla", "Cairo", "Segoe UI", Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ea-page { width: 210mm; min-height: 296mm; padding: 8mm 12mm 5mm; margin: 0 auto; }
  .ea-head { display: flex; justify-content: center; }
  .ea-head img { display: block; height: 13mm; max-width: 100%; margin: 0 auto; }
  .ea-title { text-align: center; font-size: 18pt; font-weight: 700; margin: 3mm 0 2.5mm; }
  .ea-grid { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12pt; margin-top: -.3mm; }
  .ea-info { margin-top: 0; }
  .ea-grid th, .ea-grid td { border: .3mm solid #000; padding: .4mm 1.6mm; height: 7.2mm; vertical-align: middle; line-height: 1.05; overflow-wrap: anywhere; }
  .ea-grid th { background: #bfbfbf; font-weight: 400; text-align: right; }
  .ea-cols th, .ea-cols td { text-align: center; }
  .ea-cols tr > th:first-child[rowspan] { text-align: right; }
  .ea-grid td.ea-center { text-align: center; }
  .ea-grid td.ea-start { text-align: right; }
  .ea-grid tr.ea-tall > * { height: 15mm; }
  .ea-grid tr.ea-val > td { height: 8mm; }
  .ea-grid tr.ea-gap > td { height: 6mm; }
  .ea-grid tr.ea-opinion > td { height: 8mm; }
  .ea-grid b { font-weight: 700; }
  .ea-info th { white-space: nowrap; }
  .ea-info tr > th:first-child { white-space: normal; }
  .ea-multi { white-space: pre-wrap; text-align: right; }
  .ea-approved { width: 33%; margin-inline-start: 0; margin-top: -.3mm; }
  @media screen { body { background: #e9ecf1; padding: 8mm 0; } .ea-page { background: #fff; box-shadow: 0 1mm 4mm rgba(0,0,0,.15); } }
`;

async function printApproval(data = {}) {
  const popup = window.open("", "_blank");
  if (!popup) { notify("اسمح بفتح نافذة الطباعة في المتصفح."); return; }
  try {
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(FORM_TITLE)}${data.title ? ` - ${esc(data.title)}` : ""}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
      <style>${PRINT_CSS}</style></head><body>${eventApprovalMarkup(data)}</body></html>`);
    popup.document.close();
    const logo = popup.document.querySelector(".ea-head img");
    const logoReady = logo.complete ? Promise.resolve() : new Promise((resolve) => { logo.onload = logo.onerror = resolve; });
    // الخط الأساسي Sakkal Majalla من خطوط الجهاز (موجود مع ويندوز)، وCairo احتياطي لو ما كان مثبّتًا.
    const fontsReady = Promise.all([400, 700].map((w) => popup.document.fonts.load(`${w} 12px "Cairo"`, "استمارة"))).catch(() => {});
    await Promise.race([Promise.all([logoReady, fontsReady]), new Promise((resolve) => setTimeout(resolve, 4000))]);
    await popup.document.fonts.ready;
    if (popup.closed) return;
    popup.requestAnimationFrame(() => { if (!popup.closed) { popup.focus(); popup.print(); } });
  } catch (error) { if (!popup.closed) popup.close(); notify(error.message || "تعذّرت الطباعة."); }
}

async function renderLog(root, onNew, onEdit) {
  const rows = await listEventApprovals();
  root.innerHTML = `<div class="card">
    <div class="card-head">
      <h2>استمارات اعتماد الفعاليات المحفوظة (${rows.length})</h2>
      <div class="forms-actions"><button class="btn btn-ghost" id="approval-blank-btn" type="button">طباعة نموذج فارغ</button><button class="btn btn-primary" id="approval-new-btn" type="button">+ استمارة اعتماد جديدة</button></div>
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
  root.querySelector("#approval-blank-btn").addEventListener("click", () => printApproval({ schoolName: SCHOOL_NAME }));
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
    <p class="hint">تُطبع على نموذج الوزارة الرسمي نفسه. خانات إدارة التعليم وإدارة الخدمات الطلابية وتاريخ الاعتماد واعتماد المدير تُطبع فارغة لتعبئتها يدويًا، وكذلك أي خانة تتركها فارغة.</p>
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
