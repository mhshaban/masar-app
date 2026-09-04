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

export function downloadAsWordDoc(title, bodyHtml, filename) {
  const defaultApproval = bodyHtml.includes('class="document-approval"') ? "" : '<div class="document-approval"><strong>الإجراء والتوثيق</strong><table><tr><td>المسؤول: ................................</td><td>التاريخ: ........ / ........ / ................</td><td>التوقيع: ................................</td></tr></table></div>';
  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escTitle(title)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  html, body { width: 100%; }
  body { font-family: "Cairo", "Arial", sans-serif; direction: rtl; font-size: 10pt; line-height: 1.35; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: right; font-size: 9pt; page-break-inside: avoid; }
  th { background: #1A2744; color: #fff; }
  h1 { font-size: 16pt; color: #1A2744; margin: 0 0 8px; }
  h2 { font-size: 12pt; color: #1A2744; margin: 12px 0 5px; page-break-after: avoid; }
  h3 { font-size: 10pt; color: #1A2744; page-break-after: avoid; }
  .meta { color: #666; font-size: 8.5pt; }
  p, tr, .card { page-break-inside: avoid; }
  .document-header { padding-bottom: 7px; margin-bottom: 12px; border-bottom: 1.5px solid #c8923a; color: #1A2744; font-size: 11pt; font-weight: 700; }
  .document-approval { margin-top: 18px; padding-top: 9px; border-top: 1px solid #999; page-break-inside: avoid; }
  .document-approval strong { display: block; margin-bottom: 12px; color: #1A2744; }
  .document-approval p { margin: 0 0 10px; }
  .document-approval table { margin: 0; }
  .document-approval td { width: 33.333%; border: 0; padding: 5px 0; }
</style>
</head>
<body dir="rtl"><div class="document-header">قسم الإرشاد الأكاديمي والتوجيه المهني</div>${bodyHtml}${defaultApproval}</body>
</html>`;

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
