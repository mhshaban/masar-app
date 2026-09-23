// أدوات قراءة شهادات PDF من مجلد "مسار" المحلي (File System Access API،
// كروم/إيدج فقط)، زائد commitAcademicAverages العام لكتابة
// academicFlags/termAverages لـSupabase. تحديث معدلات الطلبة نفسه (شاشة
// "تحديث المعدلات") صار يقرأ من شيتات ملف كشف الطلاب مباشرة بدل شهادات
// PDF — راجع academic-averages-workbook-import-service.js. الدوال هنا
// باقية لأن "تدقيق قالب المقررات" (curriculum-gap-audit-service.js) لا
// يزال يمسح نفس مجلد الشهادات مباشرة لغرض مختلف (اكتشاف رموز مقررات غير
// مدرجة بالقالب) — راجع README قسم "استيراد الدرجات والشهادات" للخلفية
// الكاملة.
import { getMasarFolderHandle } from "../modules/dashboard/dashboard-local-folder.js?v=2026-09-06-student-photos-1";
import { extractPdfTextRows } from "./pdf-text-rows.js?v=2026-09-11-academic-averages-1";
import { parseCertificateRows } from "../../scripts/lib/certificate-parser.mjs";
import { looksLikeScheduleDocument, MAX_PLAUSIBLE_SUBJECTS_PER_TERM } from "../../scripts/lib/document-classifier.mjs";
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
// "مسار" المستخدَم أصلًا لصور الطلبة والمعلمين وجداول/شهادات الطلبة، فلا
// يُطلب اختياره مرتين.
export async function scanCertificatesFolder() {
  const folder = await getMasarFolderHandle({ prompt: true });
  if (!folder) return null;
  return walkPdfFiles(folder);
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
