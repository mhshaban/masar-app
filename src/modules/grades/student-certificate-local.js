import { getMasarFolderHandle } from "../dashboard/dashboard-local-folder.js?v=2026-09-06-student-photos-1";
import { normalizeKey } from "../../services/text-normalize.js";
import { extractPdfTextRows } from "../../services/pdf-text-rows.js?v=2026-09-11-academic-averages-1";
import { parseCertificateRows } from "../../../scripts/lib/certificate-parser.mjs";
import { looksLikeScheduleDocument, MAX_PLAUSIBLE_SUBJECTS_PER_TERM } from "../../../scripts/lib/document-classifier.mjs";

const fileKey = (value) => normalizeKey(value).replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N}]/gu, "");
export function certificateFileMatches(name, student) {
  const id = normalizeKey(student.academicId || student.id);
  const numbers = normalizeKey(name).match(/\d+/g) || [];
  return (!!id && numbers.includes(id)) || (!!student.name && fileKey(name) === fileKey(student.name));
}

let cachedFolder = null;
let cachedFiles = null;
async function scan(directory, prefix = "", depth = 0) {
  if (depth > 6) return [];
  const files = [];
  for await (const entry of directory.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file" && /\.pdf$/i.test(entry.name)) files.push({ name: entry.name, path, handle: entry });
    if (entry.kind === "directory") files.push(...await scan(entry, path, depth + 1));
  }
  return files;
}

export async function findStudentCertificates(student, { prompt = false, refresh = false } = {}) {
  const folder = await getMasarFolderHandle({ prompt });
  if (!folder) return { connected: false, files: [] };
  const same = cachedFolder && await folder.isSameEntry(cachedFolder);
  if (!cachedFiles || !same || refresh) {
    cachedFiles = await scan(folder);
    cachedFolder = folder;
  }
  return { connected: true, files: cachedFiles.filter((file) => certificateFileMatches(file.name, student)) };
}

export function validatedCertificate(rows, student) {
  if (looksLikeScheduleDocument(rows)) throw new Error("الملف جدول حصص وليس شهادة طالب.");
  const certificate = parseCertificateRows(rows);
  if (!certificate.academicId || normalizeKey(certificate.academicId) !== normalizeKey(student.academicId || student.id)) {
    throw new Error("الرقم الأكاديمي داخل الشهادة لا يطابق هذا الطالب؛ لم تُعرض بيانات الملف.");
  }
  if (!certificate.terms.some((term) => term.subjects.length)) throw new Error("لم تُقرأ درجات من هذا الملف؛ اختر شهادة نصية واضحة.");
  if (certificate.terms.some((term) => term.subjects.length > MAX_PLAUSIBLE_SUBJECTS_PER_TERM)) throw new Error("تعذّر التحقق من تنسيق درجات الشهادة.");
  return certificate;
}

export async function readStudentCertificate(file, student) {
  const rows = await extractPdfTextRows(file);
  return validatedCertificate(rows, student);
}
