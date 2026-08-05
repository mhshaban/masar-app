import { list as listAll } from "../../services/cloud-runtime.js";
import { gradeRowPct } from "./score-conventions.js";
import { subjectKeyForGrade } from "./subject-groups.js";
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

// One row per student who has at least one graded (non-absent/barred) row —
// overall average, official-scale rating, and any subject averaging under
// 50% by name (so a strong-average student with one failing subject still
// surfaces it). Sorted worst-average-first since that's the actionable end.
export async function computeStudentAchievement() {
  const [grades, students] = await Promise.all([listAll("grades"), listStudents()]);
  const studentById = new Map(students.map((s) => [String(s.id), s]));

  const byStudent = new Map();
  for (const g of grades) {
    if (!g.studentId) continue;
    if (!byStudent.has(g.studentId)) byStudent.set(g.studentId, []);
    byStudent.get(g.studentId).push(g);
  }

  const rows = [];
  for (const [studentId, list] of byStudent) {
    const graded = list.filter((g) => g.score != null);
    if (!graded.length) continue;

    const avgPct = Math.round((graded.reduce((sum, g) => sum + gradeRowPct(g), 0) / graded.length) * 100);

    const bySubject = new Map();
    for (const g of graded) {
      const key = subjectKeyForGrade(g);
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push(g);
    }
    const weakSubjects = [...bySubject.entries()]
      .map(([subject, subjectRows]) => ({
        subject,
        pct: Math.round((subjectRows.reduce((sum, g) => sum + gradeRowPct(g), 0) / subjectRows.length) * 100),
      }))
      .filter((s) => s.pct < 50)
      .sort((a, b) => a.pct - b.pct);

    const rating = ratingForPct(avgPct);
    const student = studentById.get(String(studentId));
    rows.push({
      studentId,
      studentName: student ? student.name : null,
      level: student ? student.level : null,
      section: student ? student.section : null,
      avgPct,
      rating: rating.label,
      tier: rating.tier,
      weakSubjects,
      subjectCount: bySubject.size,
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
  const [grades, students] = await Promise.all([listAll("grades"), listStudents()]);
  const studentById = new Map(students.map((s) => [String(s.id), s]));

  const bySubject = new Map();
  for (const g of grades) {
    if (!g.studentId || g.score == null) continue;
    const subject = subjectKeyForGrade(g);
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const byStudent = bySubject.get(subject);
    if (!byStudent.has(g.studentId)) byStudent.set(g.studentId, []);
    byStudent.get(g.studentId).push(g);
  }

  const subjects = [];
  for (const [subject, byStudent] of bySubject) {
    const counts = { high: 0, medium: 0, low: 0 };
    const studentRows = [];
    for (const [studentId, rows] of byStudent) {
      const pct = Math.round((rows.reduce((sum, g) => sum + gradeRowPct(g), 0) / rows.length) * 100);
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
