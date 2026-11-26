import { ratingForPct, RATING_LABELS } from "./achievement-service.js?v=2026-11-03-exact-tiers-1";
import { studentTrackGroup } from "../students/students-service.js?v=2026-08-31-record-edit-1";

// تحليل طلبة السنة الأولى حسب المدرسة الرافدة (الإعدادية التي جاء منها الطالب).
// المصدر: students.prepSchoolResults (المدرسة + درجات المواد الأربع + المعدل)
// المستوردة من كشف نتائج الإعدادية، مع متوسط الوقفات التقويمية للمقارنة.
// الطلبة غير المسجلين بسجل الطلبة لا يدخلون أصلًا (التحليل يبدأ من السجل).

export const FIRST_LEVEL = "الأول";

export const PREP_SUBJECTS = [
  { key: "arabic", label: "اللغة العربية" },
  { key: "english", label: "اللغة الإنجليزية" },
  { key: "math", label: "الرياضيات" },
  { key: "science", label: "العلوم" },
];

// اسم مختصر للعرض: بلا «مدرسة» في أوله ولا «للبنين» في آخره.
export function shortSchoolName(name) {
  return String(name || "").trim().replace(/^مدرسة\s+/, "").replace(/\s+للبنين$/, "").trim() || "غير محدد";
}

// أقصر اسم مفهوم: بلا «الابتدائية الإعدادية» / «الإعدادية» أيضًا، إلا إذا
// تشابه مع اسم مدرسة ثانية (مثل مدينة عيسى الإعدادية والابتدائية الإعدادية).
export function compactSchoolNames(names) {
  const base = (n) => shortSchoolName(n).replace(/\s+(الابتدائية\s+)?الإعدادية$/, "").trim() || shortSchoolName(n);
  const counts = new Map();
  for (const n of names) counts.set(base(n), (counts.get(base(n)) || 0) + 1);
  return new Map(names.map((n) => [n, counts.get(base(n)) > 1 ? shortSchoolName(n) : base(n)]));
}

const num = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const mean = (values) => {
  const list = values.filter((v) => v != null);
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
};

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// متوسط كل وقفة لكل طالب (أحدث فصل فقط) — مفتاحه الرقم الأكاديمي أو المعرّف.
export function checkpointAveragesByStudent(records = []) {
  const terms = [...new Set(records.map((r) => r.term).filter(Boolean))].sort();
  const term = terms[terms.length - 1] || null;
  const out = new Map();
  const checkpoints = new Set();
  for (const r of records) {
    if (term && r.term !== term) continue;
    if (r.averagePct == null) continue;
    const cp = Number(r.checkpoint);
    checkpoints.add(cp);
    const key = String(r.studentId);
    if (!out.has(key)) out.set(key, {});
    out.get(key)[cp] = Number(r.averagePct);
  }
  return { term, checkpoints: [...checkpoints].sort((a, b) => a - b), byStudent: out };
}

function summarize(students, checkpointInfo) {
  const avgs = students.map((s) => num(s.prepSchoolResults?.average)).filter((v) => v != null);
  const ratings = Object.fromEntries(RATING_LABELS.map((label) => [label, 0]));
  for (const v of avgs) ratings[ratingForPct(v).label] += 1;
  const subjects = Object.fromEntries(PREP_SUBJECTS.map(({ key }) => [key, round1(mean(students.map((s) => num(s.prepSchoolResults?.[key]))))]));
  const checkpoints = {};
  for (const cp of checkpointInfo.checkpoints) {
    const values = students.map((s) => checkpointInfo.byStudent.get(String(s.academicId || s.id))?.[cp] ?? checkpointInfo.byStudent.get(String(s.id))?.[cp]).filter((v) => v != null);
    checkpoints[cp] = { avg: round1(mean(values)), count: values.length };
  }
  const ranked = PREP_SUBJECTS.filter(({ key }) => subjects[key] != null).sort((a, b) => subjects[a.key] - subjects[b.key]);
  return {
    count: students.length,
    avg: round1(mean(avgs)),
    min: avgs.length ? Math.min(...avgs) : null,
    max: avgs.length ? Math.max(...avgs) : null,
    ratings,
    excellent: ratings[RATING_LABELS[0]],
    below70: avgs.filter((v) => v < 70).length,
    subjects,
    weakestSubject: ranked[0]?.key || null,
    strongestSubject: ranked[ranked.length - 1]?.key || null,
    checkpoints,
  };
}

// students: سجل الطلبة كاملًا؛ checkpointRecords: سجلات checkpointGrades (اختياري).
// track: "" للكل أو «الصناعي» / «التجاري».
export function buildFeederSchoolAnalysis(students = [], checkpointRecords = [], { track = "" } = {}) {
  const level1 = students.filter((s) => s.level === FIRST_LEVEL && (!track || studentTrackGroup(s) === track));
  const withPrep = level1.filter((s) => s.prepSchoolResults && num(s.prepSchoolResults.average) != null);
  const withoutPrep = level1.filter((s) => !withPrep.includes(s));
  const checkpointInfo = checkpointAveragesByStudent(checkpointRecords);

  const groups = new Map();
  for (const s of withPrep) {
    const school = String(s.prepSchoolResults.school || "").trim() || "غير محدد";
    if (!groups.has(school)) groups.set(school, []);
    groups.get(school).push(s);
  }
  const overall = summarize(withPrep, checkpointInfo);
  const names = compactSchoolNames([...groups.keys()]);
  const schools = [...groups.entries()].map(([school, list]) => {
    const summary = summarize(list, checkpointInfo);
    return {
      school,
      shortName: names.get(school),
      share: withPrep.length ? Math.round((list.length / withPrep.length) * 1000) / 10 : 0,
      ...summary,
      students: list
        .map((s) => ({
          id: s.id,
          name: s.name || "",
          section: s.section || "",
          average: num(s.prepSchoolResults.average),
          rating: ratingForPct(num(s.prepSchoolResults.average)).label,
          subjects: Object.fromEntries(PREP_SUBJECTS.map(({ key }) => [key, num(s.prepSchoolResults[key])])),
          checkpoints: checkpointInfo.byStudent.get(String(s.academicId || s.id)) || checkpointInfo.byStudent.get(String(s.id)) || {},
        }))
        .sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name, "ar")),
    };
  }).sort((a, b) => b.count - a.count || (b.avg ?? 0) - (a.avg ?? 0) || a.shortName.localeCompare(b.shortName, "ar"));

  return {
    level1Count: level1.length,
    withPrepCount: withPrep.length,
    withoutPrepCount: withoutPrep.length,
    schoolCount: schools.length,
    checkpointTerm: checkpointInfo.term,
    checkpoints: checkpointInfo.checkpoints,
    overall,
    schools,
  };
}
