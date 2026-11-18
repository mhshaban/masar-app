// رسالة بريد جاهزة (.eml) فيها التقرير مرفقًا. رابط mailto لا يقدر يرفق
// ملفات، لذا نبني الرسالة كاملة بصيغة MIME مع X-Unsent: 1 — فتح الملف في
// Outlook يعرضها كمسودة جديدة (المستلم والعنوان والنص والمرفق جاهزة) وما
// يبقى إلا زر «إرسال». لا إرسال تلقائي.
const CRLF = "\r\n";

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const utf8 = (text) => new TextEncoder().encode(text);
const wrap76 = (b64) => b64.replace(/.{1,76}/g, (m) => m + CRLF).replace(/\r\n$/, "");
// ترويسة بحروف عربية: RFC 2047 مقسّمة لكلمات قصيرة حتى لا تتجاوز حد السطر.
function encodeHeaderWord(text) {
  const chars = [...String(text)];
  const words = [];
  let chunk = "";
  for (const ch of chars) {
    if (utf8(chunk + ch).length > 42) { words.push(chunk); chunk = ""; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${bytesToBase64(utf8(w))}?=`).join(`${CRLF} `);
}
const encodeParam = (name) => `UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
const escHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function buildEml({ to, subject, text, attachment, date = new Date() }) {
  const boundary = `masar-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const alt = `${boundary}-alt`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.8;text-align:right;">${escHtml(text).replace(/\n/g, "<br>")}</div>`;
  const lines = [
    `To: ${to}`,
    `Subject: ${encodeHeaderWord(subject)}`,
    `Date: ${date.toUTCString().replace("GMT", "+0000")}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(bytesToBase64(utf8(text))),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(bytesToBase64(utf8(html))),
    `--${alt}--`,
  ];
  if (attachment) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${attachment.type || "application/pdf"}; name="${encodeHeaderWord(attachment.name)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename*=${encodeParam(attachment.name)}`,
      "",
      wrap76(bytesToBase64(attachment.bytes)),
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join(CRLF);
}
