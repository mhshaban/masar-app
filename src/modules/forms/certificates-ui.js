// قوالب الشهادات — خمسة قوالب مطابقة لملفات Word المعتمدة بالمدرسة:
// شكر الأقسام، تهنئة المتفوقين، شكر المعلمين والطلاب، شهادة الإيميل (بخلفية
// كاملة)، والشهادة العامة (توقيعان). أربعة منها تُطبع على ورق الشهادات المطبوع
// مسبقًا (نص + المخطوطة فقط)، وشهادة الإيميل بخلفيتها الكاملة للإرسال الرقمي.
// تُعبّأ وتُطبع فقط (لا تُحفظ بقاعدة البيانات)؛ أسماء المستلمين من الطلاب
// والمعلمين والأقسام المسجّلة في مسار، أو تُكتب يدويًا. صفحة A4 أفقية لكل مستلم.
import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { mountStudentPicker } from "../shared/student-picker.js?v=2026-10-01-avg-decimals-1";
import { getFilterOptions } from "../students/students-service.js";
import { listTeachers } from "./forms-service.js?v=2026-09-08-form-fields-1";
import { normalizeCertificateRecord, listCertificates, getCertificate, saveCertificate, removeCertificate, getCertificateLayout, saveCertificateLayout } from "./certificate-service.js?v=2026-11-23-certificates-layout-1";

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

// عناصر الشهادة القابلة للتحريك من «ضبط الأماكن»: إزاحة بالملليمتر وحجم الخط
// (أو حجم الصورة للمخطوطة) لكل عنصر، و«all» تزيح الكل معًا (لفرق الطابعة).
export const LAYOUT_ELEMENTS = {
  all: "كل العناصر معًا", text: "النص", art: "المخطوطة", badge: "نص الوسام",
  sign0: "التوقيع", sign1: "التوقيع الأيسر", date: "تاريخ التحرير",
};

export function layoutElementsFor(key) {
  const t = CERTIFICATE_TEMPLATES[key];
  if (!t) return [];
  if (t.layout === "email") return ["all", "text", "badge", "sign0", "date"];
  if (t.layout === "top") return ["all", "text", "art", "sign0", "sign1", "date"];
  return ["all", "text", "art", "sign0", "date"];
}

export function elementLabel(key, el) {
  if (CERTIFICATE_TEMPLATES[key]?.layout === "top" && el === "sign0") return "التوقيع الأيمن";
  return LAYOUT_ELEMENTS[el] || el;
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round = (v) => Math.round(v * 10) / 10;

// يُرجع خصائص style للعنصر: translate بالملليمتر (+إزاحة الكل) و--fs لحجم الخط.
export function elementStyle(layout = {}, el) {
  const own = layout?.[el] || {};
  const all = layout?.all || {};
  const x = round(num(own.x) + num(all.x));
  const y = round(num(own.y) + num(all.y));
  const size = num(own.size, 100) / 100;
  const parts = [];
  if (x || y) parts.push(`translate(${x}mm, ${y}mm)`);
  if (el === "art" && size !== 1) parts.push(`scale(${size})`);
  const styles = [];
  if (parts.length) styles.push(`transform:${parts.join(" ")}`);
  if (el !== "art" && size !== 1) styles.push(`--fs:${size}`);
  return ` data-el="${el}"${styles.length ? ` style="${styles.join(";")}"` : ""}`;
}

const signerBox = (s, cls, attrs = "") => (s?.name || s?.title)
  ? `<div class="c-sign ${cls}"${attrs}>${s.name ? `<p class="c-sign-name">${esc(s.name)}</p>` : ""}${s.title ? `<p>${esc(s.title)}</p>` : ""}</div>` : "";

export function certificateMarkup(key, recipient = {}, settings = {}) {
  const template = CERTIFICATE_TEMPLATES[key];
  if (!template) throw new Error("قالب غير معروف");
  const s = { ...templateDefaults(key, settings.date || todayBahrain()), ...settings };
  const signers = s.signers || [];
  const L = settings.layout || {};
  const paper = settings.paperImage ? `<img class="c-paper" src="${esc(settings.paperImage)}" alt="">` : "";
  const text = `<div class="c-text"${elementStyle(L, "text")}>
      ${para(s.intro)}
      ${nameLine(template, recipient)}
      ${recipient.sub ? `<p class="c-sub">${esc(recipient.sub)}</p>` : ""}
      <div class="c-body">${para(s.body)}${averageBlock(template, s, recipient)}${para(s.closing)}</div>
    </div>`;
  const date = s.date ? `<div class="c-date"${elementStyle(L, "date")}>${esc(editedOn(s.date))}</div>` : "";
  const style = template.layout === "side"
    ? ` style="--tc:${template.textCenter}mm;--ax:${template.artBox[0]}mm;--ay:${template.artBox[1]}mm;--aw:${template.artBox[2]}mm;--ah:${template.artBox[3]}mm;--sc:${template.signCenter}mm;"` : "";
  if (template.layout === "email") {
    return `<section class="c-page c-email c-font-${template.font}">
      <img class="c-bg" src="${asset(template.art)}" alt="">${paper}
      <div class="c-badge"${elementStyle(L, "badge")}>${para(s.badge)}</div>
      ${text}
      ${signerBox(signers[0], "c-sign-left", elementStyle(L, "sign0"))}
      ${date}
    </section>`;
  }
  if (template.layout === "top") {
    return `<section class="c-page c-top c-font-${template.font}">
${paper}
      <img class="c-art" src="${asset(template.art)}" alt="شكر وتقدير"${elementStyle(L, "art")}>
      ${text}
      ${signerBox(signers[0], "c-sign-right", elementStyle(L, "sign0"))}
      ${signerBox(signers[1], "c-sign-left", elementStyle(L, "sign1"))}
      ${date}
    </section>`;
  }
  return `<section class="c-page c-side${template.big ? " c-big" : ""} c-font-${template.font}"${style}>
${paper}
    <img class="c-art" src="${asset(template.art)}" alt=""${elementStyle(L, "art")}>
    ${text}
    ${signerBox(signers[0], "c-sign-left", elementStyle(L, "sign0"))}
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
  .c-paper { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; opacity: .5; pointer-events: none; }
  .c-editing [data-el] { cursor: move; outline: 1px dashed rgba(200, 140, 40, .55); outline-offset: 1mm; }
  .c-editing [data-el].c-selected { outline: 1.5px solid #c88c28; }
  .c-sign { position: absolute; width: 56mm; text-align: center; line-height: 1.35; }
  .c-date { position: absolute; width: 60mm; text-align: center; }

  /* شكر الأقسام / المتفوقين / المعلمين والطلاب */
  .c-side .c-text { width: 158mm; left: calc(var(--tc) - 79mm); top: 47mm; height: 122mm; font-size: calc(21pt * var(--fs, 1)); }
  .c-side.c-big .c-text { font-size: calc(22pt * var(--fs, 1)); }
  .c-side.c-big .c-name { font-size: 1em; }
  .c-side .c-art { left: var(--ax); top: var(--ay); width: var(--aw); height: var(--ah); }
  .c-side .c-sign { left: max(3mm, calc(var(--sc) - 28mm)); top: 178mm; font-size: calc(15.5pt * var(--fs, 1)); }
  .c-side .c-date { left: calc(var(--tc) - 30mm); top: 184mm; font-size: calc(13.5pt * var(--fs, 1)); }

  /* شهادة عامة */
  .c-top .c-art { left: calc(148.5mm - 26mm); top: 20mm; width: 52.6mm; height: 22mm; }
  .c-top .c-text { width: 170mm; left: 63.5mm; top: 52mm; height: 112mm; font-size: calc(16pt * var(--fs, 1)); }
  .c-top .c-name { font-size: 1.125em; }
  .c-top .c-title { font-size: 1em; }
  .c-top .c-sub { font-size: .56em; }
  .c-top .c-sign { top: 170mm; font-size: calc(12pt * var(--fs, 1)); width: 44mm; }
  .c-top .c-sign-right { left: calc(210mm - 22mm); }
  .c-top .c-sign-left { left: calc(50mm - 22mm); }
  .c-top .c-date { left: calc(148.5mm - 30mm); top: 184mm; font-size: calc(14pt * var(--fs, 1)); }

  /* شهادة الإيميل */
  .c-email .c-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
  .c-email .c-badge { position: absolute; left: calc(44.5mm - 17mm); top: calc(105.5mm - 13mm); width: 34mm; height: 26mm; display: flex; flex-direction: column; justify-content: center; text-align: center; font-size: calc(17pt * var(--fs, 1)); line-height: 1.2; }
  .c-email .c-text { width: 160mm; left: 64mm; top: 64mm; height: 94mm; font-size: calc(16pt * var(--fs, 1)); }
  .c-email .c-name { font-size: 1.125em; }
  .c-email .c-title { font-size: 1em; }
  .c-email .c-sign { left: calc(44mm - 28mm); top: 160mm; font-size: calc(14pt * var(--fs, 1)); }
  .c-email .c-sign p:not(.c-sign-name) { font-size: 1.15em; }
  .c-email .c-date { left: calc(140mm - 30mm); top: 180mm; font-size: calc(14pt * var(--fs, 1)); }

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
    if (popup.document.body) popup.document.body.textContent = "جارٍ تجهيز الشهادات للطباعة…";
    // ضبط الأماكن المحفوظ للقالب يُطبَّق دائمًا (من السجل أو المحرر)؛ صورة الورق للمعاينة فقط.
    const layout = settings.layout ?? await getCertificateLayout(key).catch(() => ({}));
    const printSettings = { ...settings, layout, paperImage: "" };
    popup.document.open();
    popup.document.write(certificatesDocument(title, recipients.map((r) => certificateMarkup(key, r, printSettings))));
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
// صورة الورق المطبوع للمعاينة فقط (تُصغَّر وتُحفظ في متصفح هذا الجهاز).
const PAPER_KEY = (key) => `masar.certificates.paper.${key}.v1`;
function loadPaper(key) {
  try { return localStorage.getItem(PAPER_KEY(key)) || ""; } catch { return ""; }
}
function savePaper(key, dataUrl) {
  try { if (dataUrl) localStorage.setItem(PAPER_KEY(key), dataUrl); else localStorage.removeItem(PAPER_KEY(key)); }
  catch { notify("الصورة كبيرة على تخزين المتصفح؛ جرّب صورة أصغر."); }
}
async function shrinkImage(file, width = 1400) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(width * 210 / 297);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally { URL.revokeObjectURL(url); }
}

function clearSaved(key) {
  try { localStorage.removeItem(STORE_KEY(key)); } catch { /* تخزين المتصفح غير متاح */ }
}

// تبويب الشهادات: السجل أولًا (مثل كشوف الحضور) ومنه «+ شهادات جديدة» أو تعديل سجل.
export async function renderCertificates(root) {
  const showLog = () => renderCertificatesLog(root, () => showEditor(null), (id) => showEditor(id));
  const showEditor = async (id) => {
    root.innerHTML = '<div class="empty" role="status">جارٍ تحميل البيانات…</div>';
    const record = id ? await getCertificate(id) : null;
    if (id && !record) { notify("سجل الشهادات غير موجود"); return showLog(); }
    await renderCertificateEditor(root, { record, onDone: showLog });
  };
  await showLog();
}

const recipientsSummary = (list = []) => {
  const names = list.map((r) => r.name).filter(Boolean);
  return names.length <= 3 ? names.join("، ") : `${names.slice(0, 3).join("، ")} و${names.length - 3} آخرين`;
};

async function renderCertificatesLog(root, onNew, onEdit) {
  const rows = await listCertificates();
  root.innerHTML = `<div class="card">
    <div class="card-head"><h2>سجل الشهادات (${rows.length})</h2><button class="btn btn-primary" id="cert-new" type="button">+ شهادات جديدة</button></div>
    ${rows.length ? `<div class="forms-toolbar"><div class="search"><input id="cert-search" type="search" placeholder="بحث بالعنوان أو القالب أو اسم المستلم..."></div>
      <div class="forms-actions"><select id="cert-filter"><option value="">كل القوالب</option>${Object.entries(CERTIFICATE_TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join("")}</select></div></div>
      <div id="cert-table"></div>` : '<div class="empty">لا توجد شهادات محفوظة بعد. اضغط «+ شهادات جديدة» واحفظها لتظهر هنا.</div>'}
  </div>`;
  root.querySelector("#cert-new").addEventListener("click", onNew);
  if (!rows.length) return;
  const table = root.querySelector("#cert-table");
  const draw = () => {
    const q = root.querySelector("#cert-search").value.trim().toLowerCase();
    const f = root.querySelector("#cert-filter").value;
    const list = rows.filter((r) => (!f || r.templateKey === f) && (!q || `${r.title} ${r.templateLabel} ${(r.recipients || []).map((x) => x.name).join(" ")}`.toLowerCase().includes(q)));
    table.innerHTML = list.length ? `<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>العنوان</th><th>القالب</th><th>المستلمون</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr><td class="num">${esc(r.date) || "—"}</td><td><strong>${esc(r.title)}</strong>${r.createdByName ? `<div class="hint">${esc(r.createdByName)}</div>` : ""}</td><td>${esc(CERTIFICATE_TEMPLATES[r.templateKey]?.label || r.templateLabel)}</td>
        <td><span class="num">${(r.recipients || []).length}</span><div class="hint">${esc(recipientsSummary(r.recipients))}</div></td>
        <td><div class="forms-actions"><button class="btn btn-ghost" type="button" data-edit="${esc(r.id)}">تعديل</button><button class="btn btn-ghost" type="button" data-print="${esc(r.id)}">طباعة</button><button class="btn btn-ghost forms-danger" type="button" data-remove="${esc(r.id)}">حذف</button></div></td></tr>`).join("")}
      </tbody></table></div>` : '<div class="empty">لا نتائج مطابقة</div>';
    table.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => onEdit(b.dataset.edit)));
    table.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => {
      const r = rows.find((x) => x.id === b.dataset.print);
      if (r && CERTIFICATE_TEMPLATES[r.templateKey]) printCertificates(r.templateKey, r.recipients || [], { ...(r.settings || {}), date: r.date });
    }));
    table.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
      if (!await confirmDialog("حذف سجل الشهادات هذا نهائيًا؟")) return;
      try { await removeCertificate(b.dataset.remove); notify("تم حذف السجل"); await renderCertificatesLog(root, onNew, onEdit); }
      catch (error) { notify(error.message || "تعذّر الحذف"); }
    }));
  };
  root.querySelector("#cert-search").addEventListener("input", draw);
  root.querySelector("#cert-filter").addEventListener("change", draw);
  draw();
}

async function renderCertificateEditor(root, { record = null, onDone } = {}) {
  const [teachers, options] = await Promise.all([listTeachers().catch(() => []), getFilterOptions().catch(() => ({ departments: [] }))]);
  const teacherByName = new Map(teachers.filter((t) => t.name).map((t) => [t.name.trim(), t]));
  let key = record && CERTIFICATE_TEMPLATES[record.templateKey] ? record.templateKey : "departments";
  let recipients = (record?.recipients || []).map((r) => ({ ...r }));
  // نص السجل المحفوظ يُستخدم مرة واحدة عند فتحه؛ تغيير القالب يرجع للنص المعتاد.
  let recordSettings = record ? { ...(record.settings || {}) } : null;

  root.innerHTML = `<div class="card forms-card">
    <div class="card-head"><h2>${record ? "تعديل سجل شهادات" : "شهادات جديدة"}</h2><button class="btn btn-ghost" type="button" id="cert-back">رجوع للسجل</button></div>
    <p class="hint">اختر القالب، أضف المستلمين من الطلاب أو المعلمين أو الأقسام، وعدّل النص إن احتجت. تُطبع شهادة لكل مستلم على صفحة A4 أفقية — القوالب الأربعة الأولى للطباعة على ورق الشهادات المطبوع، وشهادة الإيميل بخلفيتها الكاملة (احفظها PDF من نافذة الطباعة).</p>
    <div class="forms-grid">
      <label class="forms-field"><span>القالب</span><select id="cert-template">${Object.entries(CERTIFICATE_TEMPLATES).map(([k, t]) => `<option value="${k}"${k === key ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
      <label class="forms-field"><span>تاريخ التحرير</span><input id="cert-date" type="date" value="${esc(record?.date || todayBahrain())}"></label>
      <label class="forms-field forms-wide"><span>عنوان السجل (المناسبة)</span><input id="cert-title" value="${esc(record?.title || "")}" placeholder="مثال: تكريم المتفوقين - الفصل الأول"></label>
    </div>
    <h3 style="margin:18px 0 8px;">المستلمون</h3>
    <div class="tabs" role="tablist" id="cert-sources"></div>
    <div id="cert-source-area" style="margin-top:10px;"></div>
    <div id="cert-recipients" style="margin-top:12px;"></div>
    <h3 style="margin:18px 0 8px;">نص الشهادة</h3>
    <form id="cert-text" class="forms-grid"></form>
    <div class="forms-actions" style="margin-top:14px;flex-wrap:wrap;">
      <button class="btn btn-primary" type="button" id="cert-save-print">حفظ وطباعة</button>
      <button class="btn btn-ghost" type="button" id="cert-save">حفظ في السجل</button>
      <button class="btn btn-ghost" type="button" id="cert-print">طباعة بدون حفظ</button>
      <button class="btn btn-ghost" type="button" id="cert-reset">استعادة النص الأصلي للقالب</button>
    </div>
    <h3 style="margin:18px 0 8px;">معاينة وضبط الأماكن</h3>
    <p class="hint">اسحب أي عنصر في المعاينة بالماوس، أو اختره من القائمة وحرّكه بالأسهم (كل ضغطة 1 مم). الضبط يُحفظ لهذا القالب ويُطبَّق على كل الشهادات وعلى كل الأجهزة. «كل العناصر معًا» تزيح الشهادة كلها إذا كانت الطابعة مزحزحة.</p>
    <div class="forms-grid" id="cert-layout" style="align-items:end;">
      <label class="forms-field"><span>العنصر</span><select id="cert-el"></select></label>
      <div class="forms-actions" style="flex-wrap:wrap;gap:6px;">
        <button class="btn btn-ghost" type="button" data-move="0,-1" title="لأعلى">↑</button>
        <button class="btn btn-ghost" type="button" data-move="0,1" title="لأسفل">↓</button>
        <button class="btn btn-ghost" type="button" data-move="1,0" title="لليمين">→</button>
        <button class="btn btn-ghost" type="button" data-move="-1,0" title="لليسار">←</button>
      </div>
      <label class="forms-field"><span>أفقي (مم، + لليمين)</span><input id="cert-x" type="number" step="0.5" dir="ltr"></label>
      <label class="forms-field"><span>عمودي (مم، + للأسفل)</span><input id="cert-y" type="number" step="0.5" dir="ltr"></label>
      <label class="forms-field"><span id="cert-size-label">حجم الخط ٪</span><input id="cert-size" type="number" step="5" min="40" max="200" dir="ltr"></label>
      <div class="forms-actions" style="flex-wrap:wrap;">
        <button class="btn btn-primary" type="button" id="cert-layout-save">حفظ الأماكن</button>
        <button class="btn btn-ghost" type="button" id="cert-layout-reset-el">إرجاع العنصر</button>
        <button class="btn btn-ghost" type="button" id="cert-layout-reset">إرجاع الكل للأصل</button>
      </div>
      <label class="forms-field forms-wide"><span>صورة ورق الشهادة المطبوع (اختياري، تظهر في المعاينة فقط ولا تُطبع)</span>
        <span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><input id="cert-paper" type="file" accept="image/*"><button class="btn btn-ghost" type="button" id="cert-paper-clear">إزالة الصورة</button><span class="hint" id="cert-layout-state"></span></span></label>
    </div>
    <div id="cert-preview-wrap" style="position:relative;width:100%;max-width:900px;aspect-ratio:297/210;overflow:hidden;border:1px solid var(--line, #dde3ea);border-radius:8px;background:#fff;margin-top:10px;">
      <iframe id="cert-preview" title="معاينة الشهادة" style="position:absolute;top:0;left:0;width:1123px;height:794px;border:0;transform-origin:0 0;"></iframe>
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

  // ضبط الأماكن: يُحمَّل من مسار لكل قالب، ويتعدّل بالسحب أو الأسهم، ويُحفظ بزر.
  let layout = {};
  let layoutDirty = false;
  let selectedEl = "text";
  const elSelect = root.querySelector("#cert-el");
  const xInput = root.querySelector("#cert-x");
  const yInput = root.querySelector("#cert-y");
  const sizeInput = root.querySelector("#cert-size");
  const layoutState = root.querySelector("#cert-layout-state");
  const withLayout = () => ({ ...settingsFromForm(), layout, paperImage: loadPaper(key) });
  const setDirty = (dirty) => { layoutDirty = dirty; layoutState.textContent = dirty ? "تغييرات أماكن غير محفوظة" : ""; };
  const syncLayoutInputs = () => {
    const v = layout[selectedEl] || {};
    xInput.value = num(v.x);
    yInput.value = num(v.y);
    sizeInput.value = num(v.size, 100);
    sizeInput.disabled = selectedEl === "all";
    root.querySelector("#cert-size-label").textContent = selectedEl === "art" ? "حجم المخطوطة ٪" : "حجم الخط ٪";
  };
  const drawLayoutControls = () => {
    const els = layoutElementsFor(key);
    if (!els.includes(selectedEl)) selectedEl = "text";
    elSelect.innerHTML = els.map((el) => `<option value="${el}"${el === selectedEl ? " selected" : ""}>${esc(elementLabel(key, el))}</option>`).join("");
    syncLayoutInputs();
  };
  const loadLayout = async () => {
    layout = await getCertificateLayout(key).catch(() => ({}));
    setDirty(false);
    drawLayoutControls();
    updatePreview();
  };
  const setLayoutValue = (el, patch) => {
    const next = { ...(layout[el] || {}), ...patch };
    for (const k of ["x", "y"]) next[k] = round(num(next[k]));
    if (el !== "all") next.size = Math.min(200, Math.max(40, num(next.size, 100)));
    layout = { ...layout, [el]: next };
    setDirty(true);
  };

  let previewTimer = 0;
  const scalePreview = () => { frame.style.transform = `scale(${wrap.clientWidth / 1123})`; };
  const highlight = (doc) => doc?.querySelectorAll("[data-el]").forEach((n) => n.classList.toggle("c-selected", n.dataset.el === selectedEl));
  const PX_PER_MM = 96 / 25.4;
  const enableDrag = (doc) => {
    doc.querySelector(".c-page")?.classList.add("c-editing");
    highlight(doc);
    doc.querySelectorAll("[data-el]").forEach((node) => {
      node.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const el = node.dataset.el;
        selectedEl = el;
        elSelect.value = el;
        syncLayoutInputs();
        highlight(doc);
        const start = { x: event.clientX, y: event.clientY, ox: num(layout[el]?.x), oy: num(layout[el]?.y) };
        node.setPointerCapture?.(event.pointerId);
        const move = (e) => {
          setLayoutValue(el, { x: start.ox + (e.clientX - start.x) / PX_PER_MM, y: start.oy + (e.clientY - start.y) / PX_PER_MM });
          const styled = elementStyle(layout, el).match(/transform:([^;"]+)/);
          node.style.transform = styled ? styled[1] : "";
          syncLayoutInputs();
        };
        const up = () => { node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); };
        node.addEventListener("pointermove", move);
        node.addEventListener("pointerup", up);
      });
    });
  };
  const updatePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const sample = recipients[0] || { name: "اسم المستلم", title: CERTIFICATE_TEMPLATES[key].sources[0] === "teacher" ? "الأستاذ" : "الطالب", sub: "", average: "" };
      frame.srcdoc = certificatesDocument("معاينة", [certificateMarkup(key, sample, withLayout())]).replace("@media screen", "@media not all");
      frame.onload = async () => {
        scalePreview();
        try { await waitForAssets(frame.contentDocument); frame.contentWindow.fitCertificates?.(frame.contentDocument); enableDrag(frame.contentDocument); } catch { /* المعاينة اختيارية */ }
      };
    }, 200);
  };
  window.addEventListener("resize", scalePreview);

  elSelect.addEventListener("change", () => { selectedEl = elSelect.value; syncLayoutInputs(); highlight(frame.contentDocument); });
  root.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
    const [dx, dy] = b.dataset.move.split(",").map(Number);
    const v = layout[selectedEl] || {};
    setLayoutValue(selectedEl, { x: num(v.x) + dx, y: num(v.y) + dy });
    syncLayoutInputs();
    updatePreview();
  }));
  [xInput, yInput, sizeInput].forEach((input) => input.addEventListener("change", () => {
    setLayoutValue(selectedEl, { x: xInput.value, y: yInput.value, ...(selectedEl === "all" ? {} : { size: sizeInput.value }) });
    syncLayoutInputs();
    updatePreview();
  }));
  root.querySelector("#cert-layout-reset-el").addEventListener("click", () => {
    const { [selectedEl]: _removed, ...rest } = layout;
    layout = rest;
    setDirty(true);
    syncLayoutInputs();
    updatePreview();
  });
  root.querySelector("#cert-layout-reset").addEventListener("click", async () => {
    if (!await confirmDialog("إرجاع كل عناصر هذا القالب لأماكنها الأصلية؟ (تُحفظ بعد «حفظ الأماكن»)")) return;
    layout = {};
    setDirty(true);
    syncLayoutInputs();
    updatePreview();
  });
  root.querySelector("#cert-layout-save").addEventListener("click", async () => {
    try { await saveCertificateLayout(key, layout); setDirty(false); notify("تم حفظ أماكن العناصر لهذا القالب"); }
    catch (error) { notify(error.message || "تعذّر حفظ الأماكن"); }
  });
  root.querySelector("#cert-paper").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { savePaper(key, await shrinkImage(file)); updatePreview(); }
    catch { notify("تعذّر قراءة الصورة"); }
    event.target.value = "";
  });
  root.querySelector("#cert-paper-clear").addEventListener("click", () => { savePaper(key, ""); updatePreview(); });

  const persist = () => { saveSettings(key, settingsFromForm()); updatePreview(); };

  const drawText = (useDefaults = false) => {
    const defaults = templateDefaults(key, dateInput.value);
    const saved = useDefaults ? null : (recordSettings || loadSaved(key));
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
      row.querySelector("[data-print-one]").addEventListener("click", () => printCertificates(key, [recipients[i]], withLayout()));
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

  select.addEventListener("change", async () => {
    if (layoutDirty && !await confirmDialog("فيه تغييرات أماكن غير محفوظة لهذا القالب. تتجاهلها؟")) { select.value = key; return; }
    key = select.value; recipients = []; recordSettings = null; drawTemplate(); loadLayout();
  });
  root.querySelector("#cert-reset").addEventListener("click", () => { clearSaved(key); recordSettings = null; drawText(true); });
  root.querySelector("#cert-back").addEventListener("click", () => onDone?.());
  root.querySelector("#cert-print").addEventListener("click", () => {
    if (!recipients.length) return notify("أضف مستلمًا واحدًا على الأقل");
    printCertificates(key, recipients, withLayout());
  });
  let savedId = record?.id || null;
  let saving = false;
  const saveRecord = async (thenPrint) => {
    if (saving) return;
    let data;
    try {
      data = normalizeCertificateRecord({ templateKey: key, title: root.querySelector("#cert-title").value, date: dateInput.value, settings: settingsFromForm(), recipients }, CERTIFICATE_TEMPLATES);
    } catch (error) { notify(error.message); return; }
    // نافذة الطباعة تُفتح قبل انتظار الحفظ حتى لا يمنعها المتصفح.
    const printing = thenPrint ? printCertificates(key, data.recipients, { ...data.settings, date: data.date, layout }) : null;
    saving = true;
    try {
      const saved = await saveCertificate(savedId, data);
      savedId = saved?.id || savedId;
      notify(thenPrint ? "تم الحفظ في سجل الشهادات" : "تم حفظ الشهادات في السجل");
      if (!thenPrint) onDone?.();
    } catch (error) { notify(error.message || "تعذّر الحفظ"); }
    finally { saving = false; }
    await printing;
  };
  root.querySelector("#cert-save").addEventListener("click", () => saveRecord(false));
  root.querySelector("#cert-save-print").addEventListener("click", () => saveRecord(true));
  drawTemplate();
  await loadLayout();
}
