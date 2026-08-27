#!/usr/bin/env node
// سكربت تحليل الدرجات والشهادات لصالح Cowork — يقرأ مجلد OneDrive المزامَن
// محليًا (ملفات إكسل درجات الوقفة التقويمية + شهادات PDF "سجل الطالب
// الدراسي")، يحسب بيانات أكاديمية مجمَّعة فقط (معدل عام + معدل لكل مقرر لكل
// طالب)، ويكتبها لمسار عبر Supabase REST — بلا تخزين أي صف درجة فردي
// بقاعدة بيانات مسار (راجع README، قسم "استيراد الدرجات والشهادات: مسار
// يصغّر، Cowork يحلل" للتصميم الكامل).
//
// **استبدال كامل، لا تراكم**: شغّله دائمًا على المجلد الكامل (كل الشهادات
// + كل ملفات الوقفة التقويمية)، لا فقط الملفات الجديدة — كل تشغيلة تمسح
// academicFlags/termAverages بالكامل وتكتبهما من الصفر من كل الملفات
// الموجودة بالمجلد وقت التشغيل.
//
// طبقات المنطق منقولة حرفيًا (لا إعادة اختراع) من الكود اللي كان بالتطبيق
// قبل نقل الاستيراد هنا — راجع scripts/lib/*.mjs.
//
// الاستخدام:
//   npm install   (مرة واحدة — يجلب pdfjs-dist وxlsx كمان)
//   node scripts/cowork-analyze-grades.mjs /path/to/onedrive-folder [--dry-run]
//
// --dry-run: يشغّل كل شيء (قراءة، تحليل، مطابقة، تسجيل دخول لجلب سجل
// الطلبة) بلا الخطوة الأخيرة (مسح وكتابة academicFlags/termAverages) —
// لمراجعة الملخص قبل أي تعديل فعلي على قاعدة البيانات.
//
// تسمية ملفات الإكسل: كل ملف "درجات وقفة تقويمية" يُعامَل كفترة مستقلة،
// واسم الفترة المحفوظ هو اسم الملف نفسه (بدون الامتداد) — سمِّ كل ملف
// بوضوح، مثال: "الوقفة الأولى - الفصل الأول 2025-2026.xlsx".

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { extractPdfRows } from "./lib/pdf-rows.mjs";
import { parseCertificateRows } from "./lib/certificate-parser.mjs";
import { parseCheckpointWorkbook } from "./lib/checkpoint-xlsx-parser.mjs";
import { subjectKeyForGrade } from "./lib/subject-groups.mjs";
import { gradeRowPct } from "./lib/score-conventions.mjs";
import { loginInteractive, fetchStudents, clearCollection, bulkPut } from "./lib/supabase-client.mjs";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function isPdf(file) {
  return file.toLowerCase().endsWith(".pdf");
}
function isXlsx(file) {
  const lower = file.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

// صف درجة موحّد (سواء من إكسل وقفة تقويمية أو شهادة PDF) — نفس الشكل
// اللي كان يُخزَّن بجدول grades سابقًا، لكن هنا مؤقت بالذاكرة فقط لحساب
// academicFlags، لا يُكتب لقاعدة البيانات صفًا صفًا أبدًا.
function unifiedRow({ studentId, subjectCode, subjectName, score, scoreStatus, maxScore, percentage, term }) {
  return { studentId, subjectCode, subjectName, score, scoreStatus, maxScore: maxScore ?? null, percentage: percentage ?? null, term };
}

async function collectFromXlsx(files) {
  const allRows = [];
  const skipped = [];
  for (const file of files) {
    const term = path.basename(file).replace(/\.(xlsx|xls)$/i, "");
    try {
      const buf = await readFile(file);
      const parsed = parseCheckpointWorkbook(buf);
      if (!parsed) {
        skipped.push({ file, reason: "تعذّر التعرّف على أعمدة 'رقم الطالب'/'الدرجة' — تجاهلته." });
        continue;
      }
      for (const r of parsed.rows) {
        allRows.push(unifiedRow({ ...r, term }));
      }
      console.log(`  ✓ ${path.basename(file)}: ${parsed.rows.length} صفًا (الفترة: ${term})`);
    } catch (err) {
      skipped.push({ file, reason: err.message });
    }
  }
  return { rows: allRows, skipped };
}

async function collectFromPdfs(files) {
  const allRows = [];
  const termSummaries = [];
  const errors = [];
  let ok = 0;
  for (const [i, file] of files.entries()) {
    process.stdout.write(`  [${i + 1}/${files.length}] ${path.basename(file)} ... `);
    try {
      const buf = await readFile(file);
      const rawRows = await extractPdfRows(buf);
      const cert = parseCertificateRows(rawRows);
      if (!cert.academicId) {
        console.log("⚠ تعذّر إيجاد رقم الطالب داخل الملف.");
        errors.push({ file, reason: "تعذّر إيجاد رقم الطالب داخل الملف." });
        continue;
      }
      let subjectCount = 0;
      for (const term of cert.terms) {
        for (const subject of term.subjects) {
          subjectCount += 1;
          allRows.push(unifiedRow({
            studentId: cert.academicId,
            subjectCode: subject.code,
            subjectName: subject.name,
            score: subject.score,
            scoreStatus: subject.scoreStatus,
            term: term.label,
          }));
        }
        if (term.average != null) {
          termSummaries.push({ studentId: cert.academicId, term: term.label, averagePct: term.average, rating: term.rating || null });
        }
      }
      ok += 1;
      console.log(`✓ ${cert.studentName || cert.academicId} (${subjectCount} مقرر)`);
    } catch (err) {
      console.log("✗ خطأ: " + err.message);
      errors.push({ file, reason: err.message });
    }
  }
  return { rows: allRows, termSummaries, errors, ok };
}

// نفس منطق achievement-service.js/grade-flags-service.js القديم بالضبط —
// معدل عام (متوسط كل الصفوف المُدرَّجة)، ومعدل لكل مقرر (subjectKeyForGrade
// يوحّد اسم المقرر عبر الرموز المختلفة)، وعدّاد غياب/حرمان. لا يخرج من هنا
// أي درجة مقرر فردية — فقط أرقام مجمَّعة لكل طالب.
function aggregateStudent(studentId, rows) {
  const graded = rows.filter((r) => r.score != null);
  const overallPct = graded.length
    ? Math.round((graded.reduce((sum, r) => sum + gradeRowPct(r), 0) / graded.length) * 100)
    : null;

  const bySubject = new Map();
  for (const r of graded) {
    const key = subjectKeyForGrade(r);
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(r);
  }
  const subjects = [...bySubject.entries()].map(([subject, subjectRows]) => ({
    subject,
    pct: Math.round((subjectRows.reduce((sum, r) => sum + gradeRowPct(r), 0) / subjectRows.length) * 100),
  }));

  const absentCount = rows.filter((r) => r.scoreStatus === "absent").length;
  const barredCount = rows.filter((r) => r.scoreStatus === "barred").length;

  return {
    id: studentId,
    studentId,
    overallPct,
    subjects,
    absentCount,
    barredCount,
    computedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const folder = args.find((a) => !a.startsWith("--"));
  if (!folder) {
    console.error("الاستخدام: node scripts/cowork-analyze-grades.mjs <مجلد-OneDrive> [--dry-run]");
    process.exit(1);
  }

  console.log(`جارٍ فحص المجلد: ${folder}${dryRun ? " (وضع المعاينة --dry-run — بلا كتابة فعلية)" : ""}\n`);
  const allFiles = await walk(folder);
  const pdfFiles = allFiles.filter(isPdf).sort();
  const xlsxFiles = allFiles.filter(isXlsx).sort();
  console.log(`لقيت ${pdfFiles.length} ملف شهادة PDF و${xlsxFiles.length} ملف إكسل وقفة تقويمية.\n`);
  if (!pdfFiles.length && !xlsxFiles.length) {
    console.error("ما لقيت أي ملف PDF أو إكسل داخل هذا المجلد (بما فيها المجلدات الفرعية).");
    process.exit(1);
  }

  console.log("جارٍ قراءة ملفات الإكسل (الوقفة التقويمية)...");
  const { rows: xlsxRows, skipped: xlsxSkipped } = xlsxFiles.length
    ? await collectFromXlsx(xlsxFiles)
    : { rows: [], skipped: [] };

  console.log("\nجارٍ قراءة ملفات الشهادات (PDF)...");
  const { rows: pdfRows, termSummaries, errors: pdfErrors, ok: pdfOk } = pdfFiles.length
    ? await collectFromPdfs(pdfFiles)
    : { rows: [], termSummaries: [], errors: [], ok: 0 };

  const token = await loginInteractive();

  console.log("جارٍ تحميل سجل الطلبة من Supabase للمطابقة...");
  const students = await fetchStudents(token);
  const byAcademicId = new Map(students.filter((s) => s.academicId).map((s) => [String(s.academicId), s]));
  console.log(`${students.length} طالبًا بالسجل.\n`);

  const allRows = [...xlsxRows, ...pdfRows];
  const matchedRows = allRows.filter((r) => byAcademicId.has(String(r.studentId)));
  const unmatchedIds = new Set(allRows.filter((r) => !byAcademicId.has(String(r.studentId))).map((r) => r.studentId));
  const matchedTerms = termSummaries.filter((t) => byAcademicId.has(String(t.studentId)));
  const unmatchedTermIds = new Set(termSummaries.filter((t) => !byAcademicId.has(String(t.studentId))).map((t) => t.studentId));

  const rowsByStudent = new Map();
  for (const r of matchedRows) {
    const id = String(r.studentId);
    if (!rowsByStudent.has(id)) rowsByStudent.set(id, []);
    rowsByStudent.get(id).push(r);
  }

  const academicFlagsRecords = [...rowsByStudent.entries()].map(([studentId, rows]) => aggregateStudent(studentId, rows));

  const termAveragesRecords = matchedTerms.map((t, i) => ({
    id: `${t.studentId}--t${i}`,
    studentId: String(t.studentId),
    term: t.term,
    averagePct: t.averagePct,
    rating: t.rating,
  }));

  console.log("=== الملخص ===");
  console.log(`ملفات شهادات PDF قُرئت بنجاح: ${pdfOk} من ${pdfFiles.length}`);
  if (pdfErrors.length) {
    console.log(`ملفات PDF فيها خطأ (${pdfErrors.length}):`);
    pdfErrors.forEach((e) => console.log(`  - ${path.basename(e.file)}: ${e.reason}`));
  }
  if (xlsxSkipped.length) {
    console.log(`ملفات إكسل تم تجاهلها (${xlsxSkipped.length}):`);
    xlsxSkipped.forEach((s) => console.log(`  - ${path.basename(s.file)}: ${s.reason}`));
  }
  console.log(`صفوف درجات (إكسل + PDF) قبل المطابقة: ${allRows.length}`);
  console.log(`صفوف مطابقة لطالب بالسجل: ${matchedRows.length}`);
  if (unmatchedIds.size) {
    console.log(`أرقام أكاديمية غير مطابقة لأي طالب بالسجل (${unmatchedIds.size}): ${[...unmatchedIds].join("، ")}`);
  }
  if (unmatchedTermIds.size) {
    console.log(`معدلات فصلية رسمية غير مطابقة (${unmatchedTermIds.size}): ${[...unmatchedTermIds].join("، ")}`);
  }
  console.log(`\nسيُكتب: ${academicFlagsRecords.length} صف academicFlags، ${termAveragesRecords.length} صف termAverages.`);

  if (dryRun) {
    console.log("\n(وضع المعاينة --dry-run — لم يُكتب أو يُحذف أي شيء بقاعدة البيانات.)");
    return;
  }

  console.log("\nجارٍ مسح البيانات القديمة (استبدال كامل)...");
  const clearedFlags = await clearCollection(token, "academicFlags");
  const clearedTerms = await clearCollection(token, "termAverages");
  console.log(`تم حذف ${clearedFlags} صفًا قديمًا من academicFlags و${clearedTerms} صفًا من termAverages.`);

  console.log("جارٍ كتابة البيانات الجديدة...");
  await bulkPut(token, "academicFlags", academicFlagsRecords);
  await bulkPut(token, "termAverages", termAveragesRecords);

  console.log(`\nتم بنجاح — ${academicFlagsRecords.length} طالبًا لديهم بيانات أكاديمية محدَّثة، ${termAveragesRecords.length} معدّل فصلي رسمي.`);
}

main().catch((err) => {
  console.error("\nخطأ فادح:", err.message);
  process.exit(1);
});
