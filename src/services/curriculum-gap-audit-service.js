// تدقيق قالب المقررات (curriculumTemplates) مقابل درجات الطلبة الفعلية —
// يقرأ مجموعة courseGrades (صفوف درجة خام، من نفس استيراد "تحديث المعدلات"
// بملف كشف الطلاب — راجع academic-averages-workbook-import-service.js)
// ويجمع كل رمز مقرر ظهر **بدرجة ناجحة فقط** (يتجاهل غائب/محروم/دون 50٪)
// ولم يكن موجودًا بقالب أي من المسارين (الصناعي/التجاري) — تدقيق للقراءة
// فقط، لا يكتب أي شيء لـSupabase ولا يُحدّث القالب تلقائيًا. لا يمسح أي
// مجلد محلي ولا يقرأ PDF — كل بياناته مستوردة أصلًا.
//
// **"الفصل" لكل رمز مكتشَف تخمين لا تأكيد**: يُشتق من ترتيب فصول نفس الطالب
// زمنيًا (أول فصل يظهر له بين صفوفه = الفصل١، وهكذا) — يحتاج مراجعة المرشد
// قبل اعتماده بالقالب.
import { certificateTermOrder, codeKey, splitCodes } from "../modules/grades/curriculum-results.js?v=2026-09-11-curriculum-import-1";
import { list } from "./cloud-runtime.js";
import { loadCurriculumTemplates } from "./curriculum-template-service.js?v=2026-09-11-curriculum-import-1";
import { ensureXlsx } from "./vendor-loader.js?v=2026-09-07-academic-fix-1";

const PASS_THRESHOLD = 50;
export const TRACKS = ["الصناعي", "التجاري"];

function isPassingSubject(row) {
  return !row.scoreStatus && row.score != null && Number.isFinite(Number(row.score)) && Number(row.score) >= PASS_THRESHOLD;
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

// ترتيب فصول نفس الطالب زمنيًا من عناوينها النصية وحدها (بلا فهرس مصفوفة
// جاهز كما كان بشهادة PDF واحدة) — يرجع خريطة عنوان الفصل → رقمه الترتيبي.
function studentTermNumbers(rows) {
  const labels = [...new Set(rows.map((r) => r.term))];
  const ordered = labels
    .map((label, index) => ({ label, order: certificateTermOrder(label, index) }))
    .sort((a, b) => {
      for (let i = 0; i < a.order.length; i++) if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i];
      return 0;
    });
  return new Map(ordered.map((t, i) => [t.label, i + 1]));
}

// يأخذ صفوف courseGrades مُحلَّلة مسبقًا (نفس شكل مجموعة courseGrades) —
// بلا أي اعتماد على متصفح حقيقي أو Supabase، قابل للاختبار مباشرة.
export function analyzeCurriculumGaps(courseGrades, students, templates) {
  const known = knownCodeSet(templates);
  const studentByAcademicId = new Map(students.filter((s) => s.academicId).map((s) => [String(s.academicId), s]));

  const byStudent = new Map();
  for (const row of courseGrades) {
    const id = String(row.studentId);
    if (!byStudent.has(id)) byStudent.set(id, []);
    byStudent.get(id).push(row);
  }

  const missing = new Map();
  for (const [studentId, rows] of byStudent) {
    const student = studentByAcademicId.get(studentId);
    const termNumberByLabel = studentTermNumbers(rows);
    for (const row of rows) {
      if (!isPassingSubject(row)) continue;
      const key = codeKey(row.subjectCode);
      if (!key || known.has(key)) continue;
      if (!missing.has(key)) missing.set(key, { code: row.subjectCode, name: row.subjectName, observations: [] });
      missing.get(key).observations.push({
        term: row.term, termNumber: termNumberByLabel.get(row.term) || null,
        department: student?.department || null,
        track: student?.track || null,
        studentId, studentName: student?.name || null,
      });
    }
  }

  const rows = [...missing.values()].sort((a, b) => a.code.localeCompare(b.code, "ar"));
  return { rows, studentsRead: byStudent.size };
}

export async function scanCurriculumGaps() {
  const [courseGrades, students, templates] = await Promise.all([
    list("courseGrades"), list("students"), loadCurriculumTemplates(),
  ]);
  return analyzeCurriculumGaps(courseGrades, students, templates);
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
