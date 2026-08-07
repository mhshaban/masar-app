#!/usr/bin/env node
// سكربت استيراد دفعي لشهادات PDF (سجل الطالب الدراسي) مباشرة إلى Supabase —
// بديل عن رفعها دفعات صغيرة عبر المتصفح (اللي ممكن يعلّق أو يتحطم مع مئات
// الملفات دفعة وحدة، لأن قراءة PDF كلها تصير بذاكرة تبويب المتصفح).
//
// يعيد استخدام نفس منطق التطبيق الحقيقي بلا أي تكرار أو اختلاف:
//   - src/modules/grades/certificate-parser.js (parseCertificateRows) — نفس
//     الملف المُختبَر آليًا ومُتحقَّق منه على 894 شهادة حقيقية.
//   - نفس منطق المطابقة والحفظ الموجود في grades-import-service.js
//     (parseCertificateFiles + commitImportBatch)، بحيث الأثر بقاعدة
//     البيانات مطابق تمامًا لو رفعتها عبر شاشة التطبيق.
//
// الاختلاف الوحيد: قراءة الـ PDF نفسها تصير بـ Node (عبر pdfjs-dist) بدل
// متصفح — بلا حدود ذاكرة تبويب، وأسرع لدفعات كبيرة.
//
// الاستخدام:
//   npm install   (مرة واحدة — يجلب pdfjs-dist كمان)
//   node scripts/import-certificates.mjs /path/to/pdf-folder
//
// بيطلب منك اسم المستخدم/الإيميل وكلمة المرور تفاعليًا (ما تُكتب لأي ملف
// ولا تُرسل لأي مكان غير Supabase مباشرة لتسجيل الدخول).

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import { parseCertificateRows } from "../src/modules/grades/certificate-parser.js";
import { SB_URL, SB_KEY } from "../src/services/supabase-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFJS_DIST = path.join(__dirname, "..", "node_modules", "pdfjs-dist");
const CHUNK_SIZE = 500;

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

// إخفاء كلمة المرور أثناء الكتابة بالطرفية (نفس الحيلة القياسية بـ Node —
// readline ما يدعم إخفاء مباشر).
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      char = char.toString();
      if (["\n", "\r", ""].includes(char)) return;
      readline.moveCursor(process.stdout, -1, 0);
      process.stdout.write("*");
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

// نفس خوارزمية src/services/pdf-parser.js's extractPdfRows بالضبط (تجميع
// النصوص بصفوف حسب إحداثي Y، ثم ترتيب كل صف يمين-لشمال حسب X) — منقولة
// لـ Node عبر pdfjs-dist بدل window.pdfjsLib المتصفح. standardFontDataUrl/
// cMapUrl ضروريان هنا (بخلاف المتصفح) وإلا النص العربي يطلع تالفًا بصمت.
async function extractPdfRows(buf) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: path.join(PDFJS_DIST, "standard_fonts") + path.sep,
    cMapUrl: path.join(PDFJS_DIST, "cmaps") + path.sep,
    cMapPacked: true,
  }).promise;
  const allRows = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items
      .map((it) => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }))
      .filter((it) => it.text);
    items.sort((a, b) => b.y - a.y);
    const rows = [];
    for (const item of items) {
      const row = rows.find((r) => Math.abs(r.y - item.y) < 3);
      if (row) row.items.push(item);
      else rows.push({ y: item.y, items: [item] });
    }
    for (const row of rows) {
      row.items.sort((a, b) => b.x - a.x);
      allRows.push(row.items.map((i) => i.text));
    }
  }
  return allRows;
}

async function resolveIdentifier(identifier) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/masar_resolve_login_identifier`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({ p_identifier: identifier }),
  });
  if (!res.ok) throw new Error("تعذّر التحقق من اسم المستخدم.");
  return res.json();
}

async function login(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة.");
  const data = await res.json();
  return data.access_token;
}

async function fetchStudents(token) {
  const res = await fetch(`${SB_URL}/rest/v1/students?select=id,data`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("تعذّر تحميل سجل الطلبة من Supabase: " + (await res.text()));
  const rows = await res.json();
  return rows.map((r) => ({ ...r.data, id: r.id }));
}

async function bulkPut(token, collection, records) {
  if (!records.length) return;
  const rows = records.map((r) => ({ id: r.id, data: r }));
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const res = await fetch(`${SB_URL}/rest/v1/${collection}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows.slice(i, i + CHUNK_SIZE)),
    });
    if (!res.ok) throw new Error(`فشل الحفظ بمجموعة ${collection}: ` + (await res.text()));
  }
}

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error("الاستخدام: node scripts/import-certificates.mjs <مجلد-ملفات-PDF>");
    process.exit(1);
  }

  const allFiles = await readdir(folder);
  const files = allFiles.filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  if (!files.length) {
    console.error("ما لقيت أي ملف PDF داخل هذا المجلد.");
    process.exit(1);
  }
  console.log(`لقيت ${files.length} ملف PDF بمجلد "${folder}".`);

  const identifier = await prompt("اسم المستخدم أو الإيميل: ");
  const password = await promptHidden("كلمة المرور: ");

  console.log("جارٍ تسجيل الدخول...");
  const email = (await resolveIdentifier(identifier)) || identifier;
  const token = await login(email, password);
  console.log("تم تسجيل الدخول بنجاح.\n");

  console.log("جارٍ تحميل سجل الطلبة من Supabase للمطابقة...");
  const students = await fetchStudents(token);
  const byAcademicId = new Map(students.map((s) => [String(s.academicId), s]));
  console.log(`${students.length} طالبًا بالسجل.\n`);

  const rows = [];
  const termSummaries = [];
  const fileSummaries = [];

  for (const [i, fileName] of files.entries()) {
    process.stdout.write(`[${i + 1}/${files.length}] ${fileName} ... `);
    try {
      const buf = await readFile(path.join(folder, fileName));
      const rawRows = await extractPdfRows(buf);
      const cert = parseCertificateRows(rawRows);
      if (!cert.academicId) {
        console.log("⚠ تعذّر إيجاد رقم الطالب داخل الملف.");
        fileSummaries.push({ fileName, ok: false, error: "تعذّر إيجاد رقم الطالب داخل الملف." });
        continue;
      }
      const student = byAcademicId.get(cert.academicId);
      const matchStatus = student ? "matched" : "unmatched";
      let subjectCount = 0;
      for (const term of cert.terms) {
        for (const subject of term.subjects) {
          subjectCount += 1;
          rows.push({
            studentId: cert.academicId,
            matchStatus,
            subjectCode: subject.code,
            subjectName: subject.name,
            hours: subject.hours,
            score: subject.score,
            scoreStatus: subject.scoreStatus,
            notes: subject.notes,
            term: term.label,
          });
        }
        if (term.average != null) {
          termSummaries.push({
            studentId: cert.academicId,
            matchStatus,
            term: term.label,
            averagePct: term.average,
            rating: term.rating || null,
          });
        }
      }
      fileSummaries.push({ fileName, ok: true, academicId: cert.academicId, studentName: cert.studentName, subjectCount, matchStatus });
      console.log(matchStatus === "matched" ? `✓ ${cert.studentName} (${subjectCount} مقرر)` : `⚠ غير مطابق لأي طالب بالسجل (${cert.academicId})`);
    } catch (err) {
      console.log("✗ خطأ: " + err.message);
      fileSummaries.push({ fileName, ok: false, error: err.message });
    }
  }

  const matched = rows.filter((r) => r.matchStatus === "matched");
  const batchId = `gradebatch-${Date.now().toString(36)}`;
  const gradeRecords = matched.map((r, i) => ({
    id: `${batchId}-g${i}`,
    studentId: r.studentId,
    subjectCode: r.subjectCode,
    subjectName: r.subjectName ?? null,
    hours: r.hours ?? null,
    score: r.score,
    scoreStatus: r.scoreStatus ?? null,
    notes: r.notes ?? null,
    term: r.term,
    sourceBatchId: batchId,
  }));

  console.log(`\nجارٍ حفظ ${gradeRecords.length} صف درجة على Supabase...`);
  await bulkPut(token, "grades", gradeRecords);

  const matchedTerms = termSummaries.filter((t) => t.matchStatus === "matched");
  if (matchedTerms.length) {
    const termRecords = matchedTerms.map((t, i) => ({
      id: `${batchId}-t${i}`,
      studentId: t.studentId,
      term: t.term,
      averagePct: t.averagePct,
      rating: t.rating,
      sourceBatchId: batchId,
    }));
    console.log(`جارٍ حفظ ${termRecords.length} معدّل فصلي رسمي...`);
    await bulkPut(token, "termAverages", termRecords);
  }

  const batch = {
    id: batchId,
    fileName: `استيراد PDF عبر سكربت import-certificates.mjs (${files.length} ملف)`,
    term: null,
    importedAt: new Date().toISOString(),
    totalRows: rows.length,
    matchedCount: matched.length,
    unmatchedCount: rows.length - matched.length,
    status: "Committed",
  };
  await bulkPut(token, "importBatches", [batch]);

  const unmatchedFiles = fileSummaries.filter((f) => f.ok && f.matchStatus === "unmatched");
  const errorFiles = fileSummaries.filter((f) => !f.ok);

  console.log("\n=== النتيجة ===");
  console.log(`ملفات قُرئت بنجاح: ${fileSummaries.filter((f) => f.ok).length} من ${files.length}`);
  console.log(`صفوف درجات محفوظة: ${gradeRecords.length}`);
  console.log(`معدلات فصلية رسمية محفوظة: ${matchedTerms.length}`);

  if (unmatchedFiles.length) {
    console.log(`\nملفات غير مطابقة لأي طالب بسجل الطلبة (${unmatchedFiles.length}) — تأكد سجل الطلبة مستورَد ومحدَّث:`);
    unmatchedFiles.forEach((f) => console.log(`  - ${f.fileName} (رقم أكاديمي: ${f.academicId})`));
  }
  if (errorFiles.length) {
    console.log(`\nملفات فيها خطأ أثناء القراءة (${errorFiles.length}):`);
    errorFiles.forEach((f) => console.log(`  - ${f.fileName}: ${f.error}`));
  }

  console.log(`\nتم. راجع "سجل الاستيراد" بشاشة الدرجات والتحليلات بالتطبيق (رقم الدفعة: ${batchId}) — تقدر تتراجع عنها بالكامل من هناك لو احتجت.`);
}

main().catch((err) => {
  console.error("\nخطأ فادح:", err.message);
  process.exit(1);
});
