// استيراد صور الطلاب دفعة واحدة من مجلد صور مسمّاة بالرقم الأكاديمي — يطابق
// كل ملف باسمه لسجل الطالب صاحب نفس الرقم، بدل رفع صورة صورة يدويًا من صفحة
// كل طالب على حِدة.
import { list as listAll, bulkPut } from "./cloud-runtime.js";
import { normalizeArabicIndicDigits } from "./text-normalize.js";

// اسم الملف عادة الرقم الأكاديمي وحده ("20254220.jpg")، لكن قد يحمل زوائد
// حقيقية (بادئة كاميرا "IMG_"، اسم الطالب بجانبه، أرقام عربية-هندية). نطبّع
// الأرقام أولًا ثم نأخذ أطول تتابع أرقام بالاسم (٤ خانات فأكثر) — الرقم
// الأكاديمي غالبًا أطول رقم بالاسم مقارنة بأي بادئة/تسلسل عرضي؛ عند تعادل
// الطول نأخذ آخر تتابع (الأرقام الوصفية عادة تُكتب قبل الرقم الأكاديمي لا بعده).
export function academicIdFromFilename(filename) {
  const base = String(filename || "").replace(/\.[^./\\]+$/, "");
  const normalized = normalizeArabicIndicDigits(base);
  const matches = [...normalized.matchAll(/\d{4,}/g)];
  if (!matches.length) return null;
  const maxLen = Math.max(...matches.map((m) => m[0].length));
  const longest = matches.filter((m) => m[0].length === maxLen);
  return longest[longest.length - 1][0];
}

// يطابق كل ملف بسجل الطالب صاحب نفس الرقم الأكاديمي دون أي كتابة فعلية —
// الواجهة تعرض هذا التقرير أولًا قبل الحفظ، فأخطاء التسمية (رقم مو موجود
// بالسجل، رقم مكرر بأكثر من ملف) تنكشف قبل ما تصير كتابة نهائية.
export async function matchPhotoFiles(files) {
  const students = await listAll("students");
  const byAcademicId = new Map(students.filter((s) => s.academicId).map((s) => [String(s.academicId), s]));

  const matched = [];
  const unmatched = [];
  const duplicateOf = new Map();

  for (const file of files) {
    const academicId = academicIdFromFilename(file.name);
    const student = academicId ? byAcademicId.get(academicId) : null;
    if (!student) {
      unmatched.push({ file, academicId });
      continue;
    }
    if (duplicateOf.has(student.id)) {
      duplicateOf.get(student.id).push(file);
      continue;
    }
    duplicateOf.set(student.id, []);
    matched.push({ file, student });
  }

  const duplicates = matched
    .filter((m) => duplicateOf.get(m.student.id).length > 0)
    .map((m) => ({ student: m.student, files: [m.file, ...duplicateOf.get(m.student.id)] }));

  return { matched, unmatched, duplicates };
}

// يكتب دفعة واحدة (bulkPut مجزّأة داخليًا) بدل استدعاء حفظ منفصل لكل طالب —
// أسرع بكثير مع مئات/آلاف الصور وأقل عرضة لتعليق المتصفح.
export async function commitPhotoMatches(resolved) {
  const records = resolved.map(({ student, dataUrl }) => ({ ...student, photo: dataUrl }));
  if (records.length) await bulkPut("students", records);
  return records.length;
}
