import { list as listAll } from "../../services/cloud-runtime.js";
import { listStudents } from "../students/students-service.js";

// The rating LABEL comes from Bahrain MOE's own scale, taken verbatim from
// the legend printed on this school's official transcripts. The broader
// TIER grouping (متفوق/متوسط/متدني) is the counselor's own working
// threshold for this classification screen — 90+ / 60-90 / below 60 — and
// is intentionally coarser than (and independent of) the six-band official
// rating a student's certificate carries.
const RATING_BANDS = [
  { min: 90, label: "ممتاز", tier: "high" },
  { min: 80, label: "جيد جدًا", tier: "medium" },
  { min: 70, label: "جيد", tier: "medium" },
  { min: 60, label: "متوسط", tier: "medium" },
  { min: 50, label: "مقبول", tier: "low" },
  { min: 0, label: "راسب", tier: "low" },
];

export function ratingForPct(pct) {
  return RATING_BANDS.find((b) => pct >= b.min) || RATING_BANDS[RATING_BANDS.length - 1];
}

export const TIER_LABELS = { high: "متفوقون", medium: "متوسطو التحصيل", low: "متدنو التحصيل" };

// academicFlags holds one aggregate row per student (overallPct + a
// per-subject pct list, already averaged and subject-name-resolved by
// Cowork outside Masar — see grade-flags-service.js for the full data-flow
// note). This classification screen only applies the counselor's own
// rating scale to those precomputed numbers; it never sees a raw score row.
export async function computeStudentAchievement() {
  const [flags, students] = await Promise.all([listAll("academicFlags"), listStudents()]);
  const studentById = new Map(students.map((s) => [String(s.id), s]));

  const rows = [];
  for (const f of flags) {
    if (!f.studentId || f.overallPct == null) continue;
    const avgPct = Math.round(Number(f.overallPct));
    const subjects = f.subjects || [];
    const weakSubjects = subjects
      .filter((s) => s.pct != null && Math.round(Number(s.pct)) < 50)
      .map((s) => ({ subject: s.subject, pct: Math.round(Number(s.pct)) }))
      .sort((a, b) => a.pct - b.pct);

    const rating = ratingForPct(avgPct);
    const student = studentById.get(String(f.studentId));
    rows.push({
      studentId: f.studentId,
      studentName: student ? student.name : null,
      level: student ? student.level : null,
      section: student ? student.section : null,
      avgPct,
      rating: rating.label,
      tier: rating.tier,
      weakSubjects,
      subjectCount: subjects.length,
    });
  }

  return rows.sort((a, b) => a.avgPct - b.avgPct);
}

// Same classification, but per SUBJECT rather than overall average — a
// student can be an overall "متفوق" and still be "متدني التحصيل" in one
// specific subject, which the overall view alone can't surface as its own
// list. One entry per subject name, each holding every student's rating in
// that subject only.
export async function computeSubjectAchievement() {
  const [flags, students] = await Promise.all([listAll("academicFlags"), listStudents()]);
  const studentById = new Map(students.map((s) => [String(s.id), s]));

  const bySubject = new Map();
  for (const f of flags) {
    if (!f.studentId) continue;
    for (const s of f.subjects || []) {
      if (s.pct == null) continue;
      if (!bySubject.has(s.subject)) bySubject.set(s.subject, []);
      bySubject.get(s.subject).push({ studentId: f.studentId, pct: Math.round(Number(s.pct)) });
    }
  }

  const subjects = [];
  for (const [subject, rows] of bySubject) {
    const counts = { high: 0, medium: 0, low: 0 };
    const studentRows = [];
    for (const { studentId, pct } of rows) {
      const rating = ratingForPct(pct);
      counts[rating.tier] += 1;
      const student = studentById.get(String(studentId));
      studentRows.push({
        studentId,
        studentName: student ? student.name : null,
        level: student ? student.level : null,
        section: student ? student.section : null,
        pct,
        rating: rating.label,
        tier: rating.tier,
      });
    }
    subjects.push({ subject, counts, students: studentRows.sort((a, b) => a.pct - b.pct) });
  }

  return subjects.sort((a, b) => a.subject.localeCompare(b.subject, "ar"));
}
