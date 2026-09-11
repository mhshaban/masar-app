// تحديث معدلات الطلبة (academicFlags/termAverages) مباشرة من داخل التطبيق —
// يمسح مجلد "مسار" المحلي (نفس مجلد صور/شهادات الطلبة، File System Access
// API، كروم/إيدج فقط) بحثًا عن شهادات PDF، يحلّلها بمتصفح المستخدم نفسه
// (pdf.js المُضمَّن أصلًا بالتطبيق)، ويكتب النتيجة لـSupabase مباشرة —
// بديل داخل التطبيق لسكربت scripts/cowork-analyze-grades.mjs الذي يحتاج
// Node.js/Terminal على جهاز منفصل. بنفس المنطق بالضبط (استبدال كامل لا
// تراكم، مصدر واحد فقط شهادات PDF الرسمية، بلا اعتماد على درجات الوقفة
// التقويمية) — راجع README قسم "استيراد الدرجات والشهادات" للخلفية الكاملة.
import { getMasarFolderHandle } from "../modules/dashboard/dashboard-local-folder.js?v=2026-09-06-student-photos-1";
import { extractPdfTextRows } from "./pdf-text-rows.js?v=2026-09-11-academic-averages-1";
import { parseCertificateRows } from "../../scripts/lib/certificate-parser.mjs";
import { looksLikeScheduleDocument, MAX_PLAUSIBLE_SUBJECTS_PER_TERM } from "../../scripts/lib/document-classifier.mjs";
import { subjectKeyForGrade } from "../../scripts/lib/subject-groups.mjs";
import { gradeRowPct } from "../../scripts/lib/score-conventions.mjs";
import { list, bulkPut, remove } from "./cloud-runtime.js";
import { logAuditEvent } from "../modules/audit/audit-service.js?v=2026-09-11-academic-averages-1";

export function folderScanSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function walkPdfFiles(directory, prefix = "", depth = 0) {
  if (depth > 6) return [];
  const files = [];
  for await (const entry of directory.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file" && /\.pdf$/i.test(entry.name)) files.push({ name: entry.name, path, handle: entry });
    if (entry.kind === "directory") files.push(...await walkPdfFiles(entry, path, depth + 1));
  }
  return files;
}

// نافذة اختيار المجلد تظهر فقط أول مرة (أو لو أُلغيت الصلاحية) — نفس مجلد
// "مسار" المستخدَم أصلًا لصور/جداول/شهادات الطلبة، فلا يُطلب اختياره مرتين.
export async function scanCertificatesFolder() {
  const folder = await getMasarFolderHandle({ prompt: true });
  if (!folder) return null;
  return walkPdfFiles(folder);
}

// صف درجة موحّد مؤقت بالذاكرة فقط لحساب academicFlags — لا يُكتب لقاعدة
// البيانات صفًا صفًا أبدًا (بلا اختلاف عن scripts/cowork-analyze-grades.mjs).
function unifiedRow({ studentId, subjectCode, subjectName, score, scoreStatus, term, sourceFile }) {
  return { studentId, subjectCode, subjectName, score, scoreStatus, term, sourceFile };
}

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

  return {
    id: studentId,
    studentId,
    overallPct,
    subjects,
    absentCount: rows.filter((r) => r.scoreStatus === "absent").length,
    barredCount: rows.filter((r) => r.scoreStatus === "barred").length,
    computedAt: new Date().toISOString(),
  };
}

// يقرأ شهادة PDF واحدة ويصنّفها: جدول حصص متجاهَل، رقم أكاديمي غير موجود
// بالملف، عدد مقررات غير منطقي بفصل واحد (تطابق رقم بالصدفة)، أو شهادة
// صالحة. لا يرمي أبدًا — كل حالة فشل تُرجَع كوصف بدل استثناء، حتى لا يوقف
// ملف واحد فاسد مسح باقي المجلد.
export async function readCertificateFile(file) {
  const rawRows = await extractPdfTextRows(file);
  if (looksLikeScheduleDocument(rawRows)) return { kind: "schedule" };
  const cert = parseCertificateRows(rawRows);
  if (!cert.academicId) return { kind: "error", reason: "تعذّر إيجاد رقم الطالب داخل الملف." };
  const maxSubjectsInAnyTerm = Math.max(0, ...cert.terms.map((t) => t.subjects.length));
  if (maxSubjectsInAnyTerm > MAX_PLAUSIBLE_SUBJECTS_PER_TERM) {
    return { kind: "suspicious", academicId: cert.academicId, subjectCount: maxSubjectsInAnyTerm };
  }
  return { kind: "certificate", cert };
}

// نفس منطق aggregateStudent/تعارضات termAverages بـscripts/cowork-analyze-grades.mjs
// بالضبط، لكن يأخذ نتائج شهادات مُحلَّلة مسبقًا (بدل قراءة ملفات) — قابل
// للاختبار بلا أي واجهة متصفح أو pdf.js حقيقي.
export function buildAcademicAverages(certResults, students) {
  const byAcademicId = new Map(students.filter((s) => s.academicId).map((s) => [String(s.academicId), s]));

  const allRows = [];
  const termSummaries = [];
  const finalCumulativeSummaries = [];
  let scheduleSkipped = 0;
  const errors = [];
  const suspicious = [];
  let ok = 0;

  for (const result of certResults) {
    if (result.kind === "schedule") { scheduleSkipped += 1; continue; }
    if (result.kind === "error") { errors.push(result.reason); continue; }
    if (result.kind === "suspicious") { suspicious.push(result); continue; }
    const cert = result.cert;
    ok += 1;
    for (const term of cert.terms) {
      for (const subject of term.subjects) {
        allRows.push(unifiedRow({
          studentId: cert.academicId,
          subjectCode: subject.code,
          subjectName: subject.name,
          score: subject.score,
          scoreStatus: subject.scoreStatus,
          term: term.label,
          sourceFile: result.sourceFile,
        }));
      }
      if (term.average != null) termSummaries.push({ studentId: cert.academicId, term: term.label, averagePct: term.average, rating: term.rating || null });
    }
    if (cert.finalCumulativeAverage != null) finalCumulativeSummaries.push({ studentId: cert.academicId, finalCumulativeAverage: cert.finalCumulativeAverage });
  }

  const matchedRows = allRows.filter((r) => byAcademicId.has(String(r.studentId)));
  const unmatchedIds = new Set(allRows.filter((r) => !byAcademicId.has(String(r.studentId))).map((r) => r.studentId));
  const matchedTerms = termSummaries.filter((t) => byAcademicId.has(String(t.studentId)));
  const matchedFinalCumulative = finalCumulativeSummaries.filter((t) => byAcademicId.has(String(t.studentId)));

  const rowsByStudent = new Map();
  for (const r of matchedRows) {
    const id = String(r.studentId);
    if (!rowsByStudent.has(id)) rowsByStudent.set(id, []);
    rowsByStudent.get(id).push(r);
  }

  const finalCumulativeByStudent = new Map();
  for (const item of matchedFinalCumulative) finalCumulativeByStudent.set(String(item.studentId), item);

  const academicFlagsRecords = [...rowsByStudent.entries()].map(([studentId, rows]) => ({
    ...aggregateStudent(studentId, rows),
    finalCumulativeAverage: finalCumulativeByStudent.get(String(studentId))?.finalCumulativeAverage ?? null,
  }));

  const termAveragesByKey = new Map();
  const termConflicts = [];
  for (const t of matchedTerms) {
    const key = `${t.studentId}::${t.term}`;
    const existing = termAveragesByKey.get(key);
    if (existing && existing.averagePct !== t.averagePct) termConflicts.push({ studentId: t.studentId, term: t.term });
    termAveragesByKey.set(key, t);
  }
  const termAveragesRecords = [...termAveragesByKey.values()].map((t) => ({
    id: `${t.studentId}--${t.term}`,
    studentId: String(t.studentId),
    term: t.term,
    averagePct: t.averagePct,
    rating: t.rating,
  }));

  return {
    academicFlagsRecords,
    termAveragesRecords,
    summary: {
      certificatesRead: ok,
      scheduleSkipped,
      suspiciousCount: suspicious.length,
      errorsCount: errors.length,
      unmatchedCount: unmatchedIds.size,
      termConflictsCount: termConflicts.length,
    },
  };
}

// يمسح كل ملفات PDF بالمجلد المختار ويبني النتيجة النهائية — طبقة رقيقة
// فوق readCertificateFile/buildAcademicAverages، بلا منطق تجميع هنا. onFile
// اختياري: يُستدعى بعد كل ملف لعرض تقدّم حي بالواجهة.
export async function analyzeCertificateFiles(files, students, onFile) {
  const results = [];
  for (const file of files) {
    let result;
    try {
      const blob = await file.handle.getFile();
      result = await readCertificateFile(blob);
      result.sourceFile = file.name;
    } catch (err) {
      result = { kind: "error", reason: err.message, sourceFile: file.name };
    }
    results.push(result);
    if (onFile) onFile(results.length, files.length, result);
  }
  return buildAcademicAverages(results, students);
}

// استبدال كامل لا تراكم — بنفس الترتيب الآمن المستخدم بالسكربت: يكتب
// الجديد أولًا (upsert بـid ثابت يستبدل القديم تلقائيًا)، ثم يحذف فقط ما
// لم يعد له مصدر بهذه التشغيلة.
export async function commitAcademicAverages({ academicFlagsRecords, termAveragesRecords }) {
  const [existingFlags, existingTerms] = await Promise.all([list("academicFlags"), list("termAverages")]);

  await bulkPut("academicFlags", academicFlagsRecords);
  await bulkPut("termAverages", termAveragesRecords);

  const newFlagIds = new Set(academicFlagsRecords.map((r) => r.id));
  const newTermIds = new Set(termAveragesRecords.map((r) => r.id));
  const staleFlags = existingFlags.filter((r) => !newFlagIds.has(r.id));
  const staleTerms = existingTerms.filter((r) => !newTermIds.has(r.id));
  await Promise.all([...staleFlags.map((r) => remove("academicFlags", r.id)), ...staleTerms.map((r) => remove("termAverages", r.id))]);

  await logAuditEvent("import_academic_averages", { tableName: "academicFlags", count: academicFlagsRecords.length });

  return {
    academicFlagsCount: academicFlagsRecords.length,
    termAveragesCount: termAveragesRecords.length,
    removedFlagsCount: staleFlags.length,
    removedTermsCount: staleTerms.length,
  };
}
