// استمارة المهام الرسمية — نسخة مطابقة لنموذج الوزارة الورقي (شعار الوزارة،
// جدول البيانات، أسطر المهمة، مرفق/لا مرفق، توقيعا الموظف ومدير المدرسة،
// بدون تذييل).
// تُعبّأ وتُطبع فقط (لا تُحفظ بقاعدة البيانات)؛ اسم الموظف ورقمه الشخصي
// ووظيفته تُعبّأ من بيانات المعلمين عند اختيار الاسم.
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { listTeachers } from "./forms-service.js?v=2026-09-08-form-fields-1";
import { getCurrentProfile } from "../../services/auth-service.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FORM_TITLE = "استمارة المهام الرسمية";
const TASK_LINES = 5;
const LOGO_URL = new URL("../../../assets/moe-logo.png", import.meta.url).href;

export function dayName(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return "";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("ar-BH", { weekday: "long" }).format(parsed);
}

export function formatTime(t) {
  const [h, m] = String(t || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}

export function formatDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

// يوزّع نص المهمة على أسطر الاستمارة المنقّطة (سطر لكل سطر مكتوب، والباقي فارغ).
export function taskLines(text, count = TASK_LINES) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > count) lines.splice(count - 1, lines.length, lines.slice(count - 1).join(" "));
  return [...lines, ...Array(Math.max(0, count - lines.length)).fill("")];
}

export function officialTaskMarkup(d = {}) {
  const v = (value) => esc(value || "");
  const box = (checked) => `<span class="ot-box">${checked ? "✓" : ""}</span>`;
  return `<div class="ot-page">
    <header class="ot-head"><img src="${LOGO_URL}" alt="وزارة التربية والتعليم"></header>
    <h1 class="ot-title">${FORM_TITLE}</h1>
    <table class="ot-table">
      <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
      <tr><td><b>اسم الموظف:</b> ${v(d.name)}</td><td><b>الرقم الشخصي:</b> <bdi dir="ltr">${v(d.personalNo)}</bdi></td></tr>
      <tr><td colspan="2"><b>الوظيفة:</b> ${v(d.jobTitle)}</td></tr>
      <tr><td><b>اليوم:</b> ${v(dayName(d.date))}</td><td><b>التاريخ:</b> <bdi dir="ltr">${v(formatDate(d.date))}</bdi></td></tr>
      <tr><td><b>وقت المغادرة:</b> ${v(formatTime(d.departTime))}</td><td><b>الوقت المتوقع للعودة:</b> ${v(formatTime(d.returnTime))}</td></tr>
      <tr><td colspan="2" class="ot-task"><b>المهمة الرسمية:</b>
        ${taskLines(d.task).map((line) => `<div class="ot-line">${v(line)}</div>`).join("")}
      </td></tr>
      <tr><td colspan="2" class="ot-attach"><span>${box(d.attachment === "yes")} يوجد مرفق</span><span>${box(d.attachment === "no")} لا يوجد مرفق</span></td></tr>
      <tr class="ot-sign"><td><b>توقيع الموظف:</b></td><td><b>توقيع مدير المدرسة:</b></td></tr>
    </table>
  </div>`;
}

export const PRINT_CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #000; }
  body { font-family: "Sakkal Majalla", "Cairo", "Segoe UI", Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ot-page { width: 210mm; height: 296mm; overflow: hidden; padding: 16mm 18mm 10mm; display: flex; flex-direction: column; margin: 0 auto; }
  .ot-head { text-align: center; }
  .ot-head img { height: 15mm; max-width: 100%; }
  .ot-title { text-align: center; font-size: 22pt; font-weight: 700; margin: 12mm 0 8mm; }
  .ot-table { width: 100%; border-collapse: collapse; font-size: 17pt; table-layout: fixed; }
  .ot-table td { border: .35mm solid #000; padding: 3mm 3.5mm; vertical-align: top; height: 17mm; }
  .ot-table b { font-weight: 700; }
  .ot-task .ot-line { border-bottom: .35mm dotted #000; min-height: 11mm; padding: 3mm 1mm 0; line-height: 1.5; }
  .ot-task .ot-line:last-child { margin-bottom: 6mm; }
  .ot-table td.ot-attach { height: auto; padding: 2.5mm 3.5mm; font-weight: 700; }
  .ot-attach > span { display: inline-flex; align-items: center; gap: 2mm; margin-left: 45mm; }
  .ot-box { display: inline-flex; width: 4.5mm; height: 4.5mm; border: .5mm solid #000; align-items: center; justify-content: center; font-size: 10pt; line-height: 1; }
  .ot-sign td { height: 36mm; }
  @media screen { body { background: #e9ecf1; padding: 8mm 0; } .ot-page { background: #fff; box-shadow: 0 1mm 4mm rgba(0,0,0,.15); } }
`;

export async function printOfficialTask(data) {
  const popup = window.open("", "_blank");
  if (!popup) { notify("اسمح بفتح نافذة الطباعة في المتصفح."); return; }
  try {
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(FORM_TITLE)}${data.name ? ` - ${esc(data.name)}` : ""}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
      <style>${PRINT_CSS}</style></head><body>${officialTaskMarkup(data)}</body></html>`);
    popup.document.close();
    const logo = popup.document.querySelector(".ot-head img");
    const logoReady = logo.complete ? Promise.resolve() : new Promise((resolve) => { logo.onload = logo.onerror = resolve; });
    // الخط الأساسي Sakkal Majalla من خطوط الجهاز (موجود مع ويندوز)، وCairo احتياطي لو ما كان مثبّتًا.
    const fontsReady = Promise.all([400, 700].map((w) => popup.document.fonts.load(`${w} 12px "Cairo"`, "استمارة"))).catch(() => {});
    await Promise.race([Promise.all([logoReady, fontsReady]), new Promise((resolve) => setTimeout(resolve, 4000))]);
    await popup.document.fonts.ready;
    if (popup.closed) return;
    popup.requestAnimationFrame(() => { if (!popup.closed) { popup.focus(); popup.print(); } });
  } catch (error) { if (!popup.closed) popup.close(); notify(error.message || "تعذّرت الطباعة."); }
}

const input = (label, name, value = "", { type = "text", wide = false, list = "", dir = "" } = {}) =>
  `<label class="forms-field${wide ? " forms-wide" : ""}"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}"${list ? ` list="${list}" autocomplete="off"` : ""}${dir ? ` dir="${dir}"` : ""}></label>`;

export async function renderOfficialTask(root) {
  const teachers = await listTeachers().catch(() => []);
  const byName = new Map(teachers.filter((t) => t.name).map((t) => [t.name.trim(), t]));
  let profileName = "";
  try { const profile = getCurrentProfile(); profileName = String(profile?.full_name || profile?.name || "").trim(); } catch { /* بلا جلسة: الاسم فارغ */ }
  const me = byName.get(profileName);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bahrain" });

  root.innerHTML = `<div class="card forms-card">
    <div class="card-head"><h2>${FORM_TITLE}</h2></div>
    <p class="hint">تُطبع على نموذج الوزارة نفسه. الخانات الفارغة تُطبع فارغة لتعبئتها يدويًا، واليوم يُكتب تلقائيًا من التاريخ.</p>
    <form id="official-task-form" class="forms-grid">
      ${input("اسم الموظف", "name", profileName, { list: "official-task-teachers" })}
      ${input("الرقم الشخصي", "personalNo", me?.personalNo || "", { dir: "ltr" })}
      ${input("الوظيفة", "jobTitle", me?.jobTitle || "", { wide: true })}
      ${input("التاريخ", "date", today, { type: "date" })}
      <label class="forms-field"><span>اليوم</span><input name="day" type="text" value="${esc(dayName(today))}" readonly tabindex="-1"></label>
      ${input("وقت المغادرة", "departTime", "", { type: "time" })}
      ${input("الوقت المتوقع للعودة", "returnTime", "", { type: "time" })}
      <label class="forms-field forms-wide"><span>المهمة الرسمية</span><textarea name="task" rows="${TASK_LINES}"></textarea></label>
      <fieldset class="forms-field forms-wide" style="border:0;padding:0;margin:0;"><span>المرفقات</span>
        <div style="display:flex;gap:18px;flex-wrap:wrap;">
          <label><input type="radio" name="attachment" value="yes"> يوجد مرفق</label>
          <label><input type="radio" name="attachment" value="no"> لا يوجد مرفق</label>
          <label><input type="radio" name="attachment" value="" checked> بدون تحديد</label>
        </div>
      </fieldset>
      <datalist id="official-task-teachers">${[...byName.keys()].map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      <div class="forms-actions forms-wide">
        <button class="btn btn-primary" type="submit">طباعة الاستمارة</button>
        <button class="btn btn-ghost" type="button" id="official-task-blank">طباعة نموذج فارغ</button>
      </div>
    </form>
  </div>`;

  const form = root.querySelector("#official-task-form");
  form.elements.name.addEventListener("change", () => {
    const teacher = byName.get(form.elements.name.value.trim());
    if (!teacher) return;
    if (teacher.personalNo) form.elements.personalNo.value = teacher.personalNo;
    if (teacher.jobTitle) form.elements.jobTitle.value = teacher.jobTitle;
  });
  form.elements.date.addEventListener("change", () => { form.elements.day.value = dayName(form.elements.date.value); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await printOfficialTask(Object.fromEntries(new FormData(form).entries()));
  });
  root.querySelector("#official-task-blank").addEventListener("click", () => printOfficialTask({}));
}
