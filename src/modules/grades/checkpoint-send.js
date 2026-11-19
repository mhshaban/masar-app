// تجهيز تقرير التحصيل الأكاديمي PDF وإرساله عبر Outlook: الزر ينزّل رسالة
// جاهزة (.eml) فيها إيميل الطالب والعنوان والنص والتقرير مرفقًا؛ فتحها في
// Outlook يعرضها كمسودة وما يبقى إلا «إرسال». لا إرسال تلقائي إطلاقًا.
import { ensureHtml2Pdf } from "../../services/vendor-loader.js?v=2026-11-18-checkpoints-1";
import { get, save, list as listAll } from "../../services/cloud-runtime.js";
import { getStudentAcademicSummary } from "./term-progress-service.js?v=2026-09-24-no-synthetic-terms-1";
import { COLLECTION, compareCheckpoints, getStudentCheckpoints } from "./checkpoint-service.js?v=2026-11-18-zeros-1";
import { buildAchievementReportHtml, emailSubject, emailBody, reportFileName } from "./checkpoint-report.js?v=2026-11-19-order-1";
import { buildEml } from "./checkpoint-eml.js?v=2026-11-18-eml-1";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";

export async function buildStudentReport(student, term, records = null) {
  const own = records || await getStudentCheckpoints(student);
  const comparison = compareCheckpoints(own, term);
  let cumulative = null;
  try { cumulative = (await getStudentAcademicSummary(student)).finalCumulativeAverage; } catch { cumulative = null; }
  const html = buildAchievementReportHtml(student, comparison, { cumulative });
  return { comparison, html, fileName: reportFileName(student, comparison) };
}

// خط Cairo مضمَّن (base64) داخل صورة SVG: الصور لا تحمّل خطوطًا خارجية،
// وبدونه يُرسم التقرير بخط النظام. فشل التحميل لا يوقف التقرير.
let fontCssPromise = null;
async function toDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
}
function embeddedFontCss() {
  fontCssPromise ||= (async () => {
    try {
      let css = await (await fetch("https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap")).text();
      const blocks = css.split("}").filter((b) => /arabic|latin(?!-ext)/.test(b) || !/\/\*/.test(b));
      css = blocks.join("}") + "}";
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
      const data = await Promise.all(urls.map(toDataUrl));
      urls.forEach((u, i) => { css = css.split(u).join(data[i]); });
      return css;
    } catch { return ""; }
  })();
  return fontCssPromise;
}

// يرسم المتصفح التقرير بنفسه (SVG foreignObject) ثم يُحوَّل إلى PDF. أدقّ من
// html2canvas للنص العربي: html2canvas يعيد ترتيب الكلمات والأرقام خطأً.
async function renderReportCanvas(html, width = 760, scale = 2) {
  const fontCss = await embeddedFontCss();
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;visibility:hidden;pointer-events:none;z-index:-1;`;
  host.innerHTML = `<div style="padding:18px;background:#fff;width:${width}px;box-sizing:border-box;">${html}</div>`;
  document.body.appendChild(host);
  const node = host.firstElementChild;
  const height = Math.ceil(node.getBoundingClientRect().height);
  const markup = new XMLSerializer().serializeToString(node);
  host.remove();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${fontCss}</style>${markup}</div></foreignObject></svg>`;
  const img = new Image();
  img.decoding = "sync";
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("تعذّر تجهيز صورة التقرير.")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  try { canvas.toDataURL("image/jpeg", 0.1); } catch {
    throw new Error("هذا المتصفح لا يدعم تجهيز ملف PDF للتقرير؛ استخدم Chrome أو Edge.");
  }
  return canvas;
}

export async function reportPdfBlob(html) {
  const [html2pdf, canvas] = await Promise.all([ensureHtml2Pdf(), renderReportCanvas(html)]);
  return html2pdf().set({
    margin: [6, 6, 6, 6],
    image: { type: "jpeg", quality: 0.96 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  }).from(canvas, "canvas").outputPdf("blob");
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function markSent(comparison) {
  const at = new Date().toISOString();
  for (const rec of [comparison.first, comparison.second].filter(Boolean)) {
    const current = await get(COLLECTION, rec.id);
    if (current) await save(COLLECTION, { ...current, reportSentAt: at });
  }
  return at;
}

// يُستدعى من نقرة المستخدم مباشرة (المتصفح يمنع التنزيل/فتح البريد بدونها).
export async function sendStudentReport(student, term, { records = null } = {}) {
  if (!student.email) throw new Error(`لا يوجد بريد إلكتروني مسجَّل للطالب ${student.name || ""}.`);
  const { comparison, html, fileName } = await buildStudentReport(student, term, records);
  if (!comparison.first && !comparison.second) throw new Error("لا توجد درجات وقفات تقويمية لهذا الطالب.");
  const pdf = new Uint8Array(await (await reportPdfBlob(html)).arrayBuffer());
  const eml = buildEml({
    to: student.email,
    subject: emailSubject(student, comparison),
    text: emailBody(student, comparison),
    attachment: { name: fileName, bytes: pdf, type: "application/pdf" },
  });
  const emlName = fileName.replace(/\.pdf$/i, ".eml");
  downloadBlob(new Blob([eml], { type: "message/rfc822" }), emlName);
  const sentAt = await markSent(comparison);
  await logAuditEvent("checkpoint_report_email", { tableName: COLLECTION, recordId: String(student.academicId || student.id) });
  return { sentAt, fileName: emlName };
}

export async function downloadStudentReport(student, term) {
  const { comparison, html, fileName } = await buildStudentReport(student, term);
  if (!comparison.first && !comparison.second) throw new Error("لا توجد درجات وقفات تقويمية لهذا الطالب.");
  downloadBlob(await reportPdfBlob(html), fileName);
}

export async function allCheckpointRecords() {
  return listAll(COLLECTION);
}
