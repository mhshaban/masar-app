// الإرسال الجماعي لتقارير التحصيل: مسار يجهّز حزمة ZIP (تقرير كل طالب HTML
// يُدمج في نص البريد + قائمة الإيميلات + سكربت PowerShell للويندوز وسكربت للماك)، والسكربت على جهاز المرشد يرسلها كلها من
// Outlook بعد تأكيده هو. لا يرسل مسار أي بريد بنفسه. بعد الإرسال يُرفع ملف
// النتيجة إلى مسار فيُعلَّم الطلاب «أُرسل».
import { get, save } from "../../services/cloud-runtime.js";
import { buildStudentReport, downloadBlob } from "./checkpoint-send.js?v=2026-11-20-embed-1";
import { emailSubject, emailHtml } from "./checkpoint-report.js?v=2026-11-20-embed-1";
import { COLLECTION } from "./checkpoint-service.js?v=2026-11-20-embed-1";
import { createZip } from "./zip-writer.js?v=2026-11-20-embed-1";
import { WINDOWS_SCRIPT, MAC_SCRIPT } from "./send-scripts.js?v=2026-11-20-embed-1";

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function manifestCsv(rows) {
  const header = ["academicId", "name", "email", "subject", "htmlFile"];
  const lines = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// يقرأ ملف النتيجة (CSV من السكربت): academicId,status,at,error
export function parseResultCsv(text) {
  const clean = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let field = "", row = [], quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((c) => c !== "")) rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const README = `إرسال تقارير التحصيل الأكاديمي من Outlook
==========================================
فك ضغط هذا الملف أولًا في أي مجلد.

ويندوز:
1) افتح المجلد واضغط مرتين على SEND.bat
2) تظهر رسالة فيها عدد الرسائل وأول اسمين: «نعم» للإرسال أو «لا» للإلغاء.

ماك:
1) افتح المجلد، اضغط زر يمين على SEND-MAC.command ثم «فتح» (Open)، وأكّد «فتح» إذا سألك.
   (إذا رفض الماك: افتح Terminal واكتب bash ثم مسافة، واسحب الملف SEND-MAC.command للنافذة واضغط Enter.)
2) أول مرة يطلب الماك السماح للتحكم في Microsoft Outlook: اضغط «سماح» (OK).
3) تظهر رسالة فيها عدد الرسائل وأول اسمين: «إرسال» أو «إلغاء».
   ملاحظة: Outlook الجديد على الماك ما يدعم الإرسال الآلي. إذا وقف السكربت عند أول رسالة،
   من قائمة Outlook اختر «Legacy Outlook» وشغّل السكربت مرة ثانية.

في الجهازين: يُرسل لكل طالب تقريره مدمجًا في نص البريد من بريدك في Outlook، وفي النهاية يُحفظ
ملف result.csv في نفس المجلد: ارفعه في مسار من «رفع نتيجة الإرسال» ليُعلَّم الطلاب «أُرسل».
`;

const MAC_LAUNCHER = `#!/bin/bash
cd "$(dirname "$0")" || exit 1
osascript -l JavaScript send-reports-mac.js "$PWD"
`;

// rows: [{ student, records }]؛ onProgress(i, n, name)
export async function buildBulkPackage(rows, term, onProgress = () => {}) {
  const files = [];
  const manifest = [];
  const failed = [];
  for (let i = 0; i < rows.length; i++) {
    const { student, records } = rows[i];
    onProgress(i + 1, rows.length, student.name);
    try {
      if (!student.email) throw new Error("لا يوجد بريد إلكتروني");
      const { comparison, html } = await buildStudentReport(student, term, records);
      if (!comparison.first && !comparison.second) throw new Error("لا توجد درجات");
      const id = String(student.academicId || student.id);
      const htmlName = `reports/${id}.html`;
      files.push({ name: htmlName, bytes: emailHtml(student, comparison, html) });
      manifest.push({ academicId: id, name: student.name || "", email: student.email, subject: emailSubject(student, comparison), htmlFile: htmlName.replace("/", "\\") });
    } catch (err) {
      failed.push({ name: student.name, error: err.message });
    }
  }
  if (!manifest.length) throw new Error("ما تجهّز ولا تقرير.");
  files.push({ name: "manifest.csv", bytes: manifestCsv(manifest) });
  files.push({ name: "send-reports.ps1", bytes: "\uFEFF" + WINDOWS_SCRIPT });
  files.push({ name: "SEND.bat", bytes: '@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0send-reports.ps1"\r\n' });
  files.push({ name: "send-reports-mac.js", bytes: MAC_SCRIPT });
  files.push({ name: "SEND-MAC.command", bytes: MAC_LAUNCHER, mode: 0o755 });
  files.push({ name: "README.txt", bytes: "\uFEFF" + README.replace(/\n/g, "\r\n") });
  const zip = createZip(files);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  downloadBlob(new Blob([zip], { type: "application/zip" }), `إرسال تقارير التحصيل - ${manifest.length} طالب - ${stamp}.zip`);
  return { count: manifest.length, failed };
}

// يعلّم الطلاب المرسَلين حسب ملف النتيجة. records: كل سجلات الوقفات.
export async function applyBulkResult(text, records, term) {
  const rows = parseResultCsv(text);
  if (!rows.length || !("academicId" in rows[0])) throw new Error("هذا مو ملف نتيجة الإرسال (result.csv).");
  const sent = rows.filter((r) => r.status === "sent");
  let marked = 0;
  for (const r of sent) {
    const at = r.at ? new Date(r.at).toISOString() : new Date().toISOString();
    for (const rec of records.filter((x) => String(x.studentId) === r.academicId && x.term === term)) {
      const current = await get(COLLECTION, rec.id);
      if (!current) continue;
      await save(COLLECTION, { ...current, reportSentAt: at, reportSentVia: "outlook-bulk" });
      marked++;
    }
  }
  return { sent: sent.length, failed: rows.length - sent.length, marked };
}
