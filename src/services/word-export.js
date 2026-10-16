import { logAuditEvent } from "../modules/audit/audit-service.js?v=2026-09-04-audit-1";

// Downloads an HTML fragment as a .doc file — Word opens HTML content when
// given a .doc extension + application/msword MIME type (the standard
// "Office HTML" trick), so this needs no bundled document-generation
// library. Good enough for a structured report; not a real .docx.
function escTitle(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Real Microsoft Word's HTML/MHTML import filter ignores the plain CSS3
// `@page { size: A4 landscape }` on its own (confirmed: a first attempt at
// this shipped with only that rule and still opened portrait in Word) — it
// only honors its own `mso-page-orientation` descriptor on a *named* page
// section (`@page Section1`), with the page's physical `size` given in
// points and pre-swapped for landscape, applied to content via
// `div.Section1 { page: Section1; }`. The plain `@page` rule is kept
// alongside it for browsers/print-preview, which ignore the unfamiliar
// `Section1`/`mso-*` rule but do understand the CSS3 one.
const A4_PORTRAIT_PT = "595.3pt 841.9pt";
const A4_LANDSCAPE_PT = "841.9pt 595.3pt";

// قالب مسار الموحّد (نفس قالب الطباعة) بأسلوب يلتزم به Word: أنماط مضمَّنة
// (style=) على كل خلية بدل الاعتماد على محدِّدات CSS، لأن مستورد HTML في
// Word (وLibreOffice) يتجاهل كثيرًا منها. كل جدول يُميَّز هنا: صف عناوين
// أعمدة (th فقط) كحلي، عنوان صف بجانب قيمة (th بجانب td) فاتح، وصفوف بيانات
// جداول الأعمدة تتناوب تظليلًا.
const MARK = '<span style="color:#C8923A;font-size:8pt">&#9632;</span>&nbsp;';
const CELL = "border:none;border-bottom:.5pt solid #E4E8EF;padding:3.5pt 7pt;text-align:right;vertical-align:top;font-size:9pt";
const HEAD_CELL = "background:#1A2744;color:#FFFFFF;font-weight:bold;border:none;padding:3.5pt 7pt;text-align:right;font-size:9pt";
const LABEL_CELL = "background:#F1F4F9;color:#2C3E6B;font-weight:bold;border:none;border-bottom:.5pt solid #FFFFFF;padding:3.5pt 7pt;text-align:right;font-size:9pt";
const ZEBRA = "background:#F8F9FC;";

const withStyle = (tag, style) => (attrs) => (/style="/.test(attrs) ? `<${tag}${attrs}>` : `<${tag} align="right" style="${style}"${attrs}>`);

export function styleWordBody(bodyHtml) {
  const styled = bodyHtml.replace(/<table([^>]*)>([\s\S]*?)<\/table>/g, (whole, attrs, inner) => {
    let dataIndex = 0;
    let columnTable = null;
    const rows = inner.replace(/<tr([^>]*)>([\s\S]*?)<\/tr>/g, (row, trAttrs, cells) => {
      const hasTd = /<td[\s>]/.test(cells);
      if (columnTable === null) columnTable = !hasTd;
      if (!hasTd) return `<tr${trAttrs}>${cells.replace(/<th([^>]*)>/g, (m, a) => withStyle("th", HEAD_CELL)(a))}</tr>`;
      const zebra = columnTable && dataIndex++ % 2 === 1;
      const out = cells
        .replace(/<th([^>]*)>/g, (m, a) => withStyle("th", LABEL_CELL)(a))
        .replace(/<td([^>]*)>/g, (m, a) => withStyle("td", `${zebra ? ZEBRA : ""}${CELL}`)(a));
      return `<tr${trAttrs}>${out}</tr>`;
    });
    return `<table width="100%" cellspacing="0" cellpadding="0"${attrs}>${rows}</table>`;
  });
  return styled
    .replace(/<h2([^>]*)>/g, `<h2$1>${MARK}`)
    .replace(/<div class="document-approval"><strong>/g, `<div class="document-approval"><strong>${MARK}`);
}

export function buildWordDocumentHtml(title, bodyHtml, { orientation = "portrait" } = {}) {
  const landscape = orientation === "landscape";
  const defaultApproval = bodyHtml.includes('class="document-approval"') ? "" : '<div class="document-approval"><strong>الإجراء والتوثيق</strong><table><tr><td>المسؤول: ................................</td><td>التاريخ: ........ / ........ / ................</td><td>التوقيع: ................................</td></tr></table></div>';
  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escTitle(title)}</title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
  @page Section1 { size: ${landscape ? A4_LANDSCAPE_PT : A4_PORTRAIT_PT}; mso-page-orientation: ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
  div.Section1 { page: Section1; }
  html, body { width: 100%; }
  body { font-family: "Cairo", "Arial", sans-serif; direction: rtl; font-size: 10pt; line-height: 1.35; color: #111111; }
  h1, h2, h3, p, div { text-align: right; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 12pt; border: .75pt solid #D5DBE6; }
  th, td { border: none; border-bottom: .5pt solid #E4E8EF; padding: 3.5pt 7pt; text-align: right; font-size: 9pt; page-break-inside: avoid; }
  th { font-weight: bold; }
  h1 { font-size: 16pt; color: #1A2744; margin: 0 0 3pt; padding-right: 6pt; border-right: 4.5pt solid #C8923A; }
  h2 { font-size: 11pt; color: #1A2744; margin: 12pt 0 0; padding: 3pt 7pt; background: #F1F4F9; border: .75pt solid #D5DBE6; border-bottom: none; page-break-after: avoid; }
  h3 { font-size: 10pt; color: #1A2744; page-break-after: avoid; }
  ul.followup-points { margin: 0; padding-right: 14pt; }
  ul.followup-points li { margin: 0 0 3pt; }
  .meta { color: #5B6680; font-size: 8.5pt; margin: 0 0 8pt; padding-right: 10pt; }
  p, tr, .card { page-break-inside: avoid; }
  .document-header { padding-bottom: 5pt; margin-bottom: 12pt; border-bottom: 2.25pt solid #C8923A; color: #1A2744; font-size: 12pt; font-weight: bold; }
  .document-approval { margin-top: 14pt; padding: 6pt 8pt; border: .75pt solid #D5DBE6; background: #FFFFFF; page-break-inside: avoid; }
  .document-approval strong { display: block; margin-bottom: 8pt; color: #1A2744; font-size: 11pt; }
  .document-approval p { margin: 0 0 8pt; color: #2C3E6B; }
  .document-approval table { margin: 0; border: none; }
  .document-approval td { width: 33.333%; border: none !important; padding: 5pt 0 !important; background: none !important; }
  .document-entry-footer { margin-top: 9pt; padding-top: 5pt; border-top: .5pt solid #E4E8EF; color: #5B6680; font-size: 7.5pt; page-break-inside: avoid; }
  .document-entry-footer span { display: block; margin-top: 2px; }
</style>
</head>
<body dir="rtl"><div class="Section1"><div class="document-header">قسم الإرشاد الأكاديمي والتوجيه المهني</div>${styleWordBody(bodyHtml + defaultApproval)}</div></body>
</html>`;

  return html;
}

export function downloadAsWordDoc(title, bodyHtml, filename, options = {}) {
  const html = buildWordDocumentHtml(title, bodyHtml, options);
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".doc") ? filename : `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  void logAuditEvent("export_word", { tableName: "reports", recordId: a.download });
}
