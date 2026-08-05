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
  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escTitle(title)}</title>
<style>
  body { font-family: "Arial", "Cairo", sans-serif; direction: rtl; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: right; font-size: 12px; }
  th { background: #1A2744; color: #fff; }
  h1 { font-size: 18px; color: #1A2744; }
  h2 { font-size: 15px; color: #1A2744; margin-top: 20px; }
  h3 { font-size: 13px; color: #1A2744; }
  .meta { color: #666; font-size: 11px; }
</style>
</head>
<body dir="rtl">${bodyHtml}</body>
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
}
