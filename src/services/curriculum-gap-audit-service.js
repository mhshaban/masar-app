// تدقيق قالب المقررات (curriculumTemplates) مقابل شهادات الطلبة الفعلية —
// يمسح نفس مجلد "مسار" المستخدَم بتحديث المعدلات، ويجمع كل رمز مقرر ظهر
// بدرجة **ناجحة فقط** (يتجاهل غائب/محروم/دون 50٪) بشهادة طالب ولم يكن
// موجودًا بقالب أي من المسارين (الصناعي/التجاري) — تدقيق للقراءة فقط، لا
// يكتب أي شيء لـSupabase ولا يُحدّث القالب تلقائيًا.
//
// **"الفصل" لكل رمز مكتشَف تخمين لا تأكيد**: يُشتق من ترتيب فصول شهادات
// نفس الطالب زمنيًا (أول فصل يظهر له بين شهاداته المقروءة = الفصل١،
// وهكذا) — الشهادات نفسها لا تنص دائمًا صراحة على "المستوى"، فهذا أفضل
// تقريب متاح بلا بيانات إضافية؛ يحتاج مراجعة المرشد قبل اعتماده بالقالب.
import { scanCertificatesFolder, readCertificateFile } from "./academic-averages-import-service.js?v=2026-09-11-academic-averages-1";
import { certificateTermOrder, codeKey, splitCodes } from "../modules/grades/curriculum-results.js?v=2026-09-11-curriculum-import-1";
import { list } from "./cloud-runtime.js";
import { loadCurriculumTemplates } from "./curriculum-template-service.js?v=2026-09-11-curriculum-import-1";
import { ensureXlsx } from "./vendor-loader.js?v=2026-09-07-academic-fix-1";

const PASS_THRESHOLD = 50;
export const TRACKS = ["الصناعي", "التجاري"];

function isPassingSubject(subject) {
  return !subject.scoreStatus && subject.score != null && Number.isFinite(Number(subject.score)) && Number(subject.score) >= PASS_THRESHOLD;
}

function knownCodeSet(templates) {
  const set = new Set();
  for (const track of TRACKS) {
    for (const row of templates[track] || []) {
      for (const cell of row.codes || []) {
        for (const code of splitCodes(cell)) {
          const key = codeKey(code);
          if (key) set.add(key);
        }
      }
    }
  }
  return set;
}

function chronologicalTerms(cert) {
  return cert.terms
    .map((term, index) => ({ term, order: certificateTermOrder(term.label, index) }))
    .sort((a, b) => {
      for (let i = 0; i < a.order.length; i++) if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i];
      return 0;
    });
}

// يأخذ نتائج شهادات مُحلَّلة مسبقًا (نفس شكل نتائج readCertificateFile) —
// بلا أي اعتماد على متصفح حقيقي، قابل للاختبار مباشرة.
export function analyzeCurriculumGaps(certResults, students, templates) {
  const known = knownCodeSet(templates);
  const studentByAcademicId = new Map(students.filter((s) => s.academicId).map((s) => [String(s.academicId), s]));

  const missing = new Map();
  let certificatesRead = 0;

  for (const result of certResults) {
    if (result.kind !== "certificate") continue;
    certificatesRead += 1;
    const cert = result.cert;
    if (!cert.academicId) continue;
    const student = studentByAcademicId.get(String(cert.academicId));

    chronologicalTerms(cert).forEach(({ term }, position) => {
      const termNumber = position + 1;
      for (const subject of term.subjects) {
        if (!isPassingSubject(subject)) continue;
        const key = codeKey(subject.code);
        if (!key || known.has(key)) continue;
        if (!missing.has(key)) missing.set(key, { code: subject.code, name: subject.name, observations: [] });
        missing.get(key).observations.push({
          term: term.label, termNumber,
          department: student?.department || null,
          track: student?.track || null,
          studentId: cert.academicId, studentName: cert.studentName || student?.name || null,
        });
      }
    });
  }

  const rows = [...missing.values()].sort((a, b) => a.code.localeCompare(b.code, "ar"));
  return { rows, certificatesRead };
}

export async function scanCurriculumGaps(onFile) {
  const files = await scanCertificatesFolder();
  if (!files) return null;
  const [students, templates] = await Promise.all([list("students"), loadCurriculumTemplates()]);
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
    if (onFile) onFile(results.length, files.length);
  }
  const { rows, certificatesRead } = analyzeCurriculumGaps(results, students, templates);
  return { rows, certificatesRead, filesScanned: files.length };
}

function mode(values) {
  const counts = new Map();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null, bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

// ورقة "تفاصيل الفجوات" (قائمة قابلة للفرز/الفلترة) + ورقة مقترَحة لكل
// مسار بنفس شكل جدول القالب (القسم | نوع المقرر | الفصل١..٦) — القسم
// والفصل بكل صف تخمين (الأكثر تكرارًا بين الملاحظات)، لا قيمة مؤكَّدة.
export async function downloadCurriculumGapsWorkbook(rows) {
  const XLSX = await ensureXlsx();
  const detailHeader = ["رمز المقرر", "اسم المقرر", "عدد الطلاب", "الأقسام", "المسارات", "الفصل الأكثر تكرارًا", "كل الفصول الملاحظة", "مثال طالب"];
  const detailRows = rows.map((m) => {
    const departments = [...new Set(m.observations.map((o) => o.department).filter(Boolean))];
    const tracks = [...new Set(m.observations.map((o) => o.track).filter(Boolean))];
    const termNumbers = m.observations.map((o) => o.termNumber);
    const dominantTerm = mode(termNumbers);
    const sample = m.observations[0];
    return [
      m.code, m.name || "", new Set(m.observations.map((o) => o.studentId)).size,
      departments.join("، "), tracks.join("، "),
      dominantTerm ? `الفصل ${dominantTerm}` : "—",
      [...new Set(termNumbers)].sort((a, b) => a - b).map((n) => `الفصل ${n}`).join("، "),
      sample ? `${sample.studentName || ""} (${sample.studentId})` : "",
    ];
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]), "تفاصيل الفجوات");

  for (const track of TRACKS) {
    const trackMissing = rows.filter((m) => m.observations.some((o) => o.track === track));
    const header = ["القسم", "نوع المقرر", "الفصل ١", "الفصل ٢", "الفصل ٣", "الفصل ٤", "الفصل ٥", "الفصل ٦"];
    const gridRows = trackMissing.map((m) => {
      const relevant = m.observations.filter((o) => o.track === track);
      const department = mode(relevant.map((o) => o.department)) || "غير محدد";
      const termNumber = mode(relevant.map((o) => o.termNumber));
      const row = [department, "", "", "", "", "", "", ""];
      if (termNumber >= 1 && termNumber <= 6) row[1 + termNumber] = m.code;
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...gridRows]), track);
  }

  XLSX.writeFile(wb, `فجوات-قالب-المقررات-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}
