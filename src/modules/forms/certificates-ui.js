// قوالب الشهادات — خمسة قوالب مطابقة لملفات Word المعتمدة بالمدرسة:
// شكر الأقسام، تهنئة المتفوقين، شكر المعلمين والطلاب، شهادة الإيميل (بخلفية
// كاملة)، والشهادة العامة (توقيعان). أربعة منها تُطبع على ورق الشهادات المطبوع
// مسبقًا (نص + المخطوطة فقط)، وشهادة الإيميل بخلفيتها الكاملة للإرسال الرقمي.
// تُعبّأ وتُطبع فقط (لا تُحفظ بقاعدة البيانات)؛ أسماء المستلمين من الطلاب
// والمعلمين والأقسام المسجّلة في مسار، أو تُكتب يدويًا. صفحة A4 أفقية لكل مستلم.
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { mountStudentPicker } from "../shared/student-picker.js?v=2026-10-01-avg-decimals-1";
import { getFilterOptions } from "../students/students-service.js";
import { listTeachers } from "./forms-service.js?v=2026-09-08-form-fields-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const asset = (name) => {
  try { return new URL(`../../../icons/certificates/${name}`, import.meta.url).href; } catch { return `icons/certificates/${name}`; }
};

const SCHOOL = "بمدرسة الشيخ عبدالله بن عيسى آل خليفة الثانوية الصناعية للبنين";
const PRINCIPAL = { name: "عارف عبدالحسين الاسكافي", title: "مدير المدرسة" };
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

// العام الدراسي يبدأ في سبتمبر: نوفمبر 2026 ← 2026/2027.
export function academicYear(date = todayBahrain()) {
  const [y, m] = String(date).split("-").map(Number);
  if (!y || !m) return "";
  const start = m >= 9 ? y : y - 1;
  return `${start}/${start + 1}`;
}

export function editedOn(date) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(date || ""));
  return match ? `حرر في ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "";
}

export function todayBahrain() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bahrain" });
}

// النصوص الافتراضية مأخوذة من ملفات Word نفسها (العام الدراسي يُحدَّث تلقائيًا).
export function templateDefaults(key, date = todayBahrain()) {
  const year = academicYear(date);
  const [a, b] = year.split("/");
  const defs = {
    departments: {
      intro: `يسر الارشاد والتوجيه والتدريب الميداني\n${SCHOOL}\nأن تتقدم بخالص الشكر والتقدير الى`,
      body: `وذلك للجهود المميزة والجبارة\nمن أعضاء القسم ومرشدي الشعب في دعم وارشاد الطلاب مما كان له الأثر البالغ في تسهيل متابعة التحصيل الأكاديمي للطلاب في القسم\nللعام الدراسي ${year}م`,
      closing: "متمنين له دوام التوفيق والعطاء",
      signers: [PRINCIPAL],
    },
    top: {
      intro: `يسر الهيئة الإدارية والتعليمية\n${SCHOOL}\nأن تهنئ الطالب`,
      body: `وذلك لتفوقه في امتحانات الفصل الأول\nللعام الدراسي ${a} / ${b} م`,
      averageLabel: "بمعدل",
      closing: "راجين له دوام التوفيق والنجاح",
      signers: [PRINCIPAL],
    },
    staff: {
      intro: `يسر الهيئة الإدارية والتعليمية\n${SCHOOL}\nأن تتقدم بخالص الشكر والتقدير إلى`,
      body: "وذلك لجهوده المميزة وتعاونه الدائم\nوالتي كان لها الأثر البالغ في إثراء الطلبة وتوجيههم نحو مستقبل واعد",
      closing: "متمنين له دوام التوفيق والعطاء",
      signers: [PRINCIPAL],
    },
    email: {
      intro: `يسر الهيئة الإدارية والتعليمية\n${SCHOOL}\nأن تتقدم بخالص الشكر والتقدير الى`,
      body: `وذلك للتفعيل المميز لبرنامج ...\nخلال الفصل الأول للعام الدراسي ${a} - ${b} م`,
      closing: "راجين له دوام التوفيق والعطاء",
      badge: "شكر وتقدير",
      signers: [PRINCIPAL],
    },
    general: {
      intro: `يسر قسم ...\n${SCHOOL}\nأن تتقدم بخالص الشكر والتقدير الى`,
      body: "وذلك لحسن سلوكه وتعاونه الدائم في القسم",
      closing: "راجين له دوام التوفيق والعطاء",
      // اليمين ثم اليسار كما في القالب الأصلي.
      signers: [{ name: "", title: "معلم المقرر" }, { name: "", title: "رئيس القسم" }],
    },
  };
  return defs[key];
}

// layout: side = المخطوطة يسار والنص بالوسط وتوقيع المدير يسار أسفل؛
// top = المخطوطة أعلى الوسط وتوقيعان؛ email = خلفية كاملة ووسام «شكر وتقدير».
export const CERTIFICATE_TEMPLATES = {
  departments: { label: "شكر الأقسام", layout: "side", art: "thanks.png", font: "somar", sources: ["department", "manual"], prefix: false, textCenter: 150, artBox: [19, 84, 41, 19.4], signCenter: 32 },
  top: { label: "تهنئة المتفوقين", layout: "side", art: "congrats.png", font: "somar", sources: ["student", "manual"], prefix: false, average: true, textCenter: 138, artBox: [13, 79, 28.3, 25.4], signCenter: 26 },
  staff: { label: "شكر المعلمين والطلاب", layout: "side", art: "thanks.png", font: "somar", sources: ["teacher", "student", "manual"], prefix: true, textCenter: 138, artBox: [11.4, 84, 41, 19.4], signCenter: 26, big: true },
  email: { label: "شهادة الإيميل (بخلفية كاملة)", layout: "email", art: "email-background.jpg", font: "thesans", sources: ["teacher", "student", "manual"], prefix: true },
  general: { label: "شهادة عامة (توقيعان)", layout: "top", art: "thanks-wide.png", font: "frutiger", sources: ["student", "teacher", "manual"], prefix: true },
};

const SOURCE_LABELS = { student: "طلاب", teacher: "معلمون", department: "أقسام", manual: "اسم يدوي" };

const lines = (text) => String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const para = (text, cls = "") => lines(text).map((line) => `<p${cls ? ` class="${cls}"` : ""}>${esc(line)}</p>`).join("");

export function studentRecipient(student, key) {
  const id = student.academicId || "";
  const section = student.section || "";
  const sub = key === "top"
    ? [id && `الرقم الاكاديمي ${id}`, section && `شعبة ${section}`].filter(Boolean).join(" | ")
    : [id, section].filter(Boolean).join(" | ");
  return { name: student.name || "", title: "الطالب", sub, average: "" };
}

export function teacherRecipient(teacher) {
  return { name: teacher.name || "", title: "الأستاذ", sub: "", average: "" };
}

export function departmentRecipient(name) {
  return { name: String(name || "").startsWith("قسم") ? name : `قسم ${name}`, title: "", sub: "", average: "" };
}

function nameLine(template, r) {
  const name = esc(r.name || "");
  if (!template.prefix || !r.title) return `<p class="c-name">${name}</p>`;
  return `<p class="c-name"><span class="c-title">${esc(r.title)} / </span>${name}</p>`;
}

function averageBlock(template, settings, r) {
  if (!template.average || !String(r.average || "").trim()) return "";
  const value = String(r.average).trim();
  return `${settings.averageLabel ? `<p>${esc(settings.averageLabel)}</p>` : ""}<p class="c-average"><bdi dir="ltr">${esc(value)}${value.includes("%") ? "" : "%"}</bdi></p>`;
}

const signerBox = (s, cls) => (s?.name || s?.title)
  ? `<div class="c-sign ${cls}">${s.name ? `<p class="c-sign-name">${esc(s.name)}</p>` : ""}${s.title ? `<p>${esc(s.title)}</p>` : ""}</div>` : "";

export function certificateMarkup(key, recipient = {}, settings = {}) {
  const template = CERTIFICATE_TEMPLATES[key];
  if (!template) throw new Error("قالب غير معروف");
  const s = { ...templateDefaults(key, settings.date || todayBahrain()), ...settings };
  const signers = s.signers || [];
  const text = `<div class="c-text">
      ${para(s.intro)}
      ${nameLine(template, recipient)}
      ${recipient.sub ? `<p class="c-sub">${esc(recipient.sub)}</p>` : ""}
      <div class="c-body">${para(s.body)}${averageBlock(template, s, recipient)}${para(s.closing)}</div>
    </div>`;
  const date = s.date ? `<div class="c-date">${esc(editedOn(s.date))}</div>` : "";
  const style = template.layout === "side"
    ? ` style="--tc:${template.textCenter}mm;--ax:${template.artBox[0]}mm;--ay:${template.artBox[1]}mm;--aw:${template.artBox[2]}mm;--ah:${template.artBox[3]}mm;--sc:${template.signCenter}mm;"` : "";
  if (template.layout === "email") {
    return `<section class="c-page c-email c-font-${template.font}">
      <img class="c-bg" src="${asset(template.art)}" alt="">
      <div class="c-badge">${para(s.badge)}</div>
      ${text}
      ${signerBox(signers[0], "c-sign-left")}
      ${date}
    </section>`;
  }
  if (template.layout === "top") {
    return `<section class="c-page c-top c-font-${template.font}">
      <img class="c-art" src="${asset(template.art)}" alt="شكر وتقدير">
      ${text}
      ${signerBox(signers[0], "c-sign-right")}
      ${signerBox(signers[1], "c-sign-left")}
      ${date}
    </section>`;
  }
  return `<section class="c-page c-side${template.big ? " c-big" : ""} c-font-${template.font}"${style}>
    <img class="c-art" src="${asset(template.art)}" alt="">
    ${text}
    ${signerBox(signers[0], "c-sign-left")}
    ${date}
  </section>`;
}

// الخطوط الأصلية (Somar / TheSans / Frutiger) تُستخدم من خطوط الجهاز إن كانت
// مثبّتة، وCairo احتياطي. font-synthesis: none حتى لا يُسمَّك Somar Black مرتين.
export const CERTIFICATE_CSS = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #000; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .c-page { position: relative; width: 297mm; height: 209.5mm; overflow: hidden; margin: 0 auto; page-break-after: always; break-after: page; background: #fff; font-synthesis: none; }
  .c-page:last-child { page-break-after: auto; break-after: auto; }
  .c-page p { margin: 0; }
  .c-font-somar { font-family: "Somar Medium", "Somar", "Cairo", sans-serif; font-weight: 500; }
  .c-font-somar .c-name, .c-font-somar .c-average { font-family: "Somar Black", "Somar", "Cairo", sans-serif; font-weight: 900; }
  .c-font-somar .c-sign-name { font-family: "Somar Bold", "Somar", "Cairo", sans-serif; font-weight: 700; }
  .c-font-somar .c-sign p:not(.c-sign-name), .c-font-somar .c-date { font-family: "Somar", "Cairo", sans-serif; font-weight: 400; }
  .c-font-thesans { font-family: "TheSans", "TheSans Plain", "Cairo", sans-serif; font-weight: 400; }
  .c-font-thesans .c-name, .c-font-thesans .c-badge, .c-font-thesans .c-sign-name { font-family: "TheSans Bold", "TheSans", "Cairo", sans-serif; font-weight: 700; }
  .c-font-frutiger { font-family: "Frutiger LT Arabic 55 Roman", "Frutiger LT Arabic", "Cairo", sans-serif; font-weight: 400; }
  .c-font-frutiger .c-name, .c-font-frutiger .c-sub { font-weight: 700; }
  .c-text { position: absolute; text-align: center; line-height: 1.45; overflow: hidden; display: flex; flex-direction: column; align-items: center; }
  .c-text > p, .c-body > p { max-width: 100%; }
  .c-name { font-size: 1.29em; margin: 1.5mm 0 !important; }
  .c-title { font-size: .78em; font-weight: inherit; }
  .c-sub { font-size: .66em; margin-bottom: 3mm !important; }
  .c-body { margin-top: 2mm; }
  .c-average { font-size: 1.15em; }
  .c-art { position: absolute; object-fit: contain; }
  .c-sign { position: absolute; width: 56mm; text-align: center; line-height: 1.35; }
  .c-date { position: absolute; width: 60mm; text-align: center; }

  /* شكر الأقسام / المتفوقين / المعلمين والطلاب */
  .c-side .c-text { width: 158mm; left: calc(var(--tc) - 79mm); top: 47mm; height: 122mm; font-size: 21pt; }
  .c-side.c-big .c-text { font-size: 22pt; }
  .c-side.c-big .c-name { font-size: 1em; }
  .c-side .c-art { left: var(--ax); top: var(--ay); width: var(--aw); height: var(--ah); }
  .c-side .c-sign { left: max(3mm, calc(var(--sc) - 28mm)); top: 178mm; font-size: 15.5pt; }
  .c-side .c-date { left: calc(var(--tc) - 30mm); top: 184mm; font-size: 13.5pt; }

  /* شهادة عامة */
  .c-top .c-art { left: calc(148.5mm - 26mm); top: 20mm; width: 52.6mm; height: 22mm; }
  .c-top .c-text { width: 170mm; left: 63.5mm; top: 52mm; height: 112mm; font-size: 16pt; }
  .c-top .c-name { font-size: 1.125em; }
  .c-top .c-title { font-size: 1em; }
  .c-top .c-sub { font-size: .56em; }
  .c-top .c-sign { top: 170mm; font-size: 12pt; width: 44mm; }
  .c-top .c-sign-right { left: calc(210mm - 22mm); }
  .c-top .c-sign-left { left: calc(50mm - 22mm); }
  .c-top .c-date { left: calc(148.5mm - 30mm); top: 184mm; font-size: 14pt; }

  /* شهادة الإيميل */
  .c-email .c-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
  .c-email .c-badge { position: absolute; left: calc(44.5mm - 17mm); top: calc(105.5mm - 13mm); width: 34mm; height: 26mm; display: flex; flex-direction: column; justify-content: center; text-align: center; font-size: 17pt; line-height: 1.2; }
  .c-email .c-text { width: 160mm; left: 64mm; top: 64mm; height: 94mm; font-size: 16pt; }
  .c-email .c-name { font-size: 1.125em; }
  .c-email .c-title { font-size: 1em; }
  .c-email .c-sign { left: calc(44mm - 28mm); top: 160mm; font-size: 14pt; }
  .c-email .c-sign p:not(.c-sign-name) { font-size: 1.15em; }
  .c-email .c-date { left: calc(140mm - 30mm); top: 180mm; font-size: 14pt; }

  @media screen { body { background: #e9ecf1; padding: 8mm 0; } .c-page { margin-bottom: 8mm; box-shadow: 0 1mm 4mm rgba(0,0,0,.15); } }
`;

// يصغّر خط النص تدريجيًا إن طال حتى لا يتجاوز مساحته فوق التوقيع.
export const FIT_SCRIPT = `function fitCertificates(doc){doc.querySelectorAll('.c-text').forEach(function(el){el.style.fontSize='';var base=parseFloat(getComputedStyle(el).fontSize),s=1;while(el.scrollHeight>el.clientHeight+1&&s>0.55){s-=0.04;el.style.fontSize=(base*s)+'px';}});}`;

export function certificatesDocument(title, pages) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;700;900&display=swap" rel="stylesheet">
    <style>${CERTIFICATE_CSS}</style><script>${FIT_SCRIPT}</script></head><body>${pages.join("")}</body></html>`;
}

async function waitForAssets(doc) {
  const images = [...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => { img.onload = img.onerror = resolve; })));
  const fonts = Promise.all([400, 500, 700, 900].map((w) => doc.fonts.load(`${w} 12px "Cairo"`, "شهادة"))).catch(() => {});
  await Promise.race([Promise.all([...images, fonts]), new Promise((resolve) => setTimeout(resolve, 5000))]);
  await doc.fonts.ready;
}

export async function printCertificates(key, recipients, settings) {
  const popup = window.open("", "_blank");
  if (!popup) { notify("اسمح بفتح نافذة الطباعة في المتصفح."); return; }
  try {
    const label = CERTIFICATE_TEMPLATES[key].label;
    const title = recipients.length === 1 ? `${label} - ${recipients[0].name}` : `${label} (${recipients.length})`;
    popup.document.open();
    popup.document.write(certificatesDocument(title, recipients.map((r) => certificateMarkup(key, r, settings))));
    popup.document.close();
    await waitForAssets(popup.document);
    if (popup.closed) return;
    popup.fitCertificates?.(popup.document);
    popup.requestAnimationFrame(() => { if (!popup.closed) { popup.focus(); popup.print(); } });
  } catch (error) { if (!popup.closed) popup.close(); notify(error.message || "تعذّرت الطباعة."); }
}

const STORE_KEY = (key) => `masar.certificates.${key}.v1`;
function loadSaved(key) {
  try { return JSON.parse(localStorage.getItem(STORE_KEY(key)) || "null"); } catch { return null; }
}
function saveSettings(key, settings) {
  try { const { date, ...rest } = settings; localStorage.setItem(STORE_KEY(key), JSON.stringify(rest)); } catch { /* تخزين المتصفح غير متاح */ }
}
function clearSaved(key) {
  try { localStorage.removeItem(STORE_KEY(key)); } catch { /* تخزين المتصفح غير متاح */ }
}

export async function renderCertificates(root) {
  const [teachers, options] = await Promise.all([listTeachers().catch(() => []), getFilterOptions().catch(() => ({ departments: [] }))]);
  const teacherByName = new Map(teachers.filter((t) => t.name).map((t) => [t.name.trim(), t]));
  let key = "departments";
  let recipients = [];

  root.innerHTML = `<div class="card forms-card">
    <div class="card-head"><h2>الشهادات</h2></div>
    <p class="hint">اختر القالب، أضف المستلمين من الطلاب أو المعلمين أو الأقسام، وعدّل النص إن احتجت. تُطبع شهادة لكل مستلم على صفحة A4 أفقية — القوالب الأربعة الأولى للطباعة على ورق الشهادات المطبوع، وشهادة الإيميل بخلفيتها الكاملة (احفظها PDF من نافذة الطباعة).</p>
    <div class="forms-grid">
      <label class="forms-field"><span>القالب</span><select id="cert-template">${Object.entries(CERTIFICATE_TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join("")}</select></label>
      <label class="forms-field"><span>تاريخ التحرير</span><input id="cert-date" type="date" value="${todayBahrain()}"></label>
    </div>
    <h3 style="margin:18px 0 8px;">المستلمون</h3>
    <div class="tabs" role="tablist" id="cert-sources"></div>
    <div id="cert-source-area" style="margin-top:10px;"></div>
    <div id="cert-recipients" style="margin-top:12px;"></div>
    <h3 style="margin:18px 0 8px;">نص الشهادة</h3>
    <form id="cert-text" class="forms-grid"></form>
    <div class="forms-actions" style="margin-top:14px;flex-wrap:wrap;">
      <button class="btn btn-primary" type="button" id="cert-print">طباعة الشهادات</button>
      <button class="btn btn-ghost" type="button" id="cert-reset">استعادة النص الأصلي للقالب</button>
    </div>
    <h3 style="margin:18px 0 8px;">معاينة</h3>
    <div id="cert-preview-wrap" style="position:relative;width:100%;max-width:900px;aspect-ratio:297/210;overflow:hidden;border:1px solid var(--line, #dde3ea);border-radius:8px;background:#fff;">
      <iframe id="cert-preview" title="معاينة الشهادة" style="position:absolute;top:0;left:0;width:1123px;height:794px;border:0;transform-origin:0 0;pointer-events:none;"></iframe>
    </div>
  </div>`;

  const select = root.querySelector("#cert-template");
  const dateInput = root.querySelector("#cert-date");
  const sourcesRoot = root.querySelector("#cert-sources");
  const sourceArea = root.querySelector("#cert-source-area");
  const recipientsRoot = root.querySelector("#cert-recipients");
  const textForm = root.querySelector("#cert-text");
  const frame = root.querySelector("#cert-preview");
  const wrap = root.querySelector("#cert-preview-wrap");

  const settingsFromForm = () => {
    const f = textForm.elements;
    const signers = [0, 1].map((i) => ({ name: f[`signer${i}Name`]?.value.trim() || "", title: f[`signer${i}Title`]?.value.trim() || "" })).filter((_, i) => f[`signer${i}Name`]);
    const out = { intro: f.intro.value, body: f.body.value, closing: f.closing.value, signers, date: dateInput.value };
    if (f.averageLabel) out.averageLabel = f.averageLabel.value;
    if (f.badge) out.badge = f.badge.value;
    return out;
  };

  let previewTimer = 0;
  const scalePreview = () => { frame.style.transform = `scale(${wrap.clientWidth / 1123})`; };
  const updatePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const sample = recipients[0] || { name: "اسم المستلم", title: CERTIFICATE_TEMPLATES[key].sources[0] === "teacher" ? "الأستاذ" : "الطالب", sub: "", average: "" };
      frame.srcdoc = certificatesDocument("معاينة", [certificateMarkup(key, sample, settingsFromForm())]).replace("@media screen", "@media not all");
      frame.onload = async () => {
        scalePreview();
        try { await waitForAssets(frame.contentDocument); frame.contentWindow.fitCertificates?.(frame.contentDocument); } catch { /* المعاينة اختيارية */ }
      };
    }, 200);
  };
  window.addEventListener("resize", scalePreview);

  const persist = () => { saveSettings(key, settingsFromForm()); updatePreview(); };

  const drawText = (useDefaults = false) => {
    const defaults = templateDefaults(key, dateInput.value);
    const saved = useDefaults ? null : loadSaved(key);
    const s = { ...defaults, ...(saved || {}) };
    const t = CERTIFICATE_TEMPLATES[key];
    const signers = defaults.signers.map((d, i) => s.signers?.[i] || d);
    const signerLabel = t.layout === "top" ? ["التوقيع الأيمن", "التوقيع الأيسر"] : ["التوقيع"];
    textForm.innerHTML = `
      <label class="forms-field forms-wide"><span>المقدمة (قبل الاسم)</span><textarea name="intro" rows="3">${esc(s.intro)}</textarea></label>
      <label class="forms-field forms-wide"><span>سبب الشكر / التهنئة (بعد الاسم)</span><textarea name="body" rows="3">${esc(s.body)}</textarea></label>
      ${t.average ? `<label class="forms-field"><span>عبارة المعدل</span><input name="averageLabel" value="${esc(s.averageLabel)}"></label>` : ""}
      <label class="forms-field${t.average ? "" : " forms-wide"}"><span>الختام</span><input name="closing" value="${esc(s.closing)}"></label>
      ${t.layout === "email" ? `<label class="forms-field"><span>نص الوسام</span><input name="badge" value="${esc(s.badge)}"></label>` : ""}
      ${signers.map((sg, i) => `
        <label class="forms-field"><span>${signerLabel[i]}: الاسم</span><input name="signer${i}Name" value="${esc(sg.name)}"></label>
        <label class="forms-field"><span>${signerLabel[i]}: الصفة</span><input name="signer${i}Title" value="${esc(sg.title)}"></label>`).join("")}`;
    updatePreview();
  };
  textForm.addEventListener("input", persist);
  dateInput.addEventListener("change", updatePreview);

  const drawRecipients = () => {
    const t = CERTIFICATE_TEMPLATES[key];
    if (!recipients.length) { recipientsRoot.innerHTML = '<div class="empty">لم يُضف أي مستلم بعد</div>'; updatePreview(); return; }
    recipientsRoot.innerHTML = `<div class="tablewrap"><table><thead><tr><th>#</th>${t.prefix ? "<th>اللقب</th>" : ""}<th>الاسم</th><th>السطر الفرعي</th>${t.average ? "<th>المعدل</th>" : ""}<th></th></tr></thead><tbody>
      ${recipients.map((r, i) => `<tr data-i="${i}"><td class="num">${i + 1}</td>
        ${t.prefix ? `<td><input data-f="title" value="${esc(r.title)}" style="width:90px"></td>` : ""}
        <td><input data-f="name" value="${esc(r.name)}" style="min-width:200px;width:100%"></td>
        <td><input data-f="sub" value="${esc(r.sub)}" style="min-width:160px;width:100%"></td>
        ${t.average ? `<td><input data-f="average" value="${esc(r.average)}" dir="ltr" placeholder="98.50" style="width:90px"></td>` : ""}
        <td><div class="forms-actions"><button class="btn btn-ghost" type="button" data-print-one>طباعة</button><button class="btn btn-ghost" type="button" data-remove>حذف</button></div></td></tr>`).join("")}
      </tbody></table></div>
      <div class="forms-actions" style="margin-top:8px;"><button class="btn btn-ghost" type="button" id="cert-clear">إفراغ القائمة</button></div>`;
    recipientsRoot.querySelectorAll("tr[data-i]").forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelectorAll("input[data-f]").forEach((input) => input.addEventListener("input", () => { recipients[i][input.dataset.f] = input.value; if (i === 0) updatePreview(); }));
      row.querySelector("[data-remove]").addEventListener("click", () => { recipients.splice(i, 1); drawRecipients(); });
      row.querySelector("[data-print-one]").addEventListener("click", () => printCertificates(key, [recipients[i]], settingsFromForm()));
    });
    recipientsRoot.querySelector("#cert-clear").addEventListener("click", () => { recipients = []; drawRecipients(); });
    updatePreview();
  };

  const addRecipient = (r) => {
    if (!r.name.trim()) return;
    if (recipients.some((x) => x.name === r.name && x.sub === r.sub)) return notify("المستلم مضاف مسبقًا");
    recipients.push(r);
    drawRecipients();
  };

  const drawSource = (source) => {
    sourcesRoot.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.source === source));
    if (source === "student") {
      sourceArea.innerHTML = '<div id="cert-student-picker"></div>';
      mountStudentPicker(sourceArea.querySelector("#cert-student-picker"), {
        placeholder: "ابحث عن طالب بالاسم أو الرقم الأكاديمي...",
        onSelect(student) { addRecipient(studentRecipient(student, key)); sourceArea.querySelector("#picker-q").value = ""; sourceArea.querySelector("#picker-results").innerHTML = ""; },
      });
      return;
    }
    if (source === "teacher") {
      sourceArea.innerHTML = `<div class="forms-grid"><label class="forms-field"><span>اسم المعلم</span><input id="cert-teacher" list="cert-teachers" autocomplete="off" placeholder="اكتب أو اختر من القائمة"></label>
        <div class="forms-actions" style="align-self:end;"><button class="btn btn-primary" type="button" id="cert-add-teacher">إضافة</button></div></div>
        <datalist id="cert-teachers">${[...teacherByName.keys()].map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>`;
      const input = sourceArea.querySelector("#cert-teacher");
      const add = () => { const name = input.value.trim(); if (!name) return; addRecipient(teacherRecipient(teacherByName.get(name) || { name })); input.value = ""; input.focus(); };
      sourceArea.querySelector("#cert-add-teacher").addEventListener("click", add);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      return;
    }
    if (source === "department") {
      const departments = options.departments || [];
      sourceArea.innerHTML = departments.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${departments.map((d) => `<button class="btn btn-ghost" type="button" data-dept="${esc(d)}">+ ${esc(d)}</button>`).join("")}<button class="btn btn-primary" type="button" id="cert-all-depts">إضافة كل الأقسام</button></div>`
        : '<p class="hint">لا توجد أقسام مسجّلة في بيانات الطلاب؛ أضف اسم القسم يدويًا.</p>';
      sourceArea.querySelectorAll("[data-dept]").forEach((b) => b.addEventListener("click", () => addRecipient(departmentRecipient(b.dataset.dept))));
      sourceArea.querySelector("#cert-all-depts")?.addEventListener("click", () => { departments.forEach((d) => { const r = departmentRecipient(d); if (!recipients.some((x) => x.name === r.name)) recipients.push(r); }); drawRecipients(); });
      return;
    }
    sourceArea.innerHTML = `<div class="forms-grid"><label class="forms-field forms-wide"><span>الأسماء (اسم في كل سطر)</span><textarea id="cert-manual" rows="3"></textarea></label>
      <div class="forms-actions forms-wide"><button class="btn btn-primary" type="button" id="cert-add-manual">إضافة</button></div></div>`;
    sourceArea.querySelector("#cert-add-manual").addEventListener("click", () => {
      const box = sourceArea.querySelector("#cert-manual");
      const title = key === "departments" ? "" : CERTIFICATE_TEMPLATES[key].sources[0] === "teacher" ? "الأستاذ" : "الطالب";
      lines(box.value).forEach((name) => { if (!recipients.some((x) => x.name === name)) recipients.push({ name, title, sub: "", average: "" }); });
      box.value = "";
      drawRecipients();
    });
  };

  const drawTemplate = () => {
    const t = CERTIFICATE_TEMPLATES[key];
    sourcesRoot.innerHTML = t.sources.map((src) => `<button class="tab" type="button" data-source="${src}">${SOURCE_LABELS[src]}</button>`).join("");
    sourcesRoot.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => drawSource(b.dataset.source)));
    drawSource(t.sources[0]);
    drawText();
    drawRecipients();
  };

  select.addEventListener("change", () => { key = select.value; recipients = []; drawTemplate(); });
  root.querySelector("#cert-reset").addEventListener("click", () => { clearSaved(key); drawText(true); });
  root.querySelector("#cert-print").addEventListener("click", () => {
    if (!recipients.length) return notify("أضف مستلمًا واحدًا على الأقل");
    printCertificates(key, recipients, settingsFromForm());
  });
  drawTemplate();
}
