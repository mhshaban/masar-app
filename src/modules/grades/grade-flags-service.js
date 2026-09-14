import { list as listAll } from "../../services/cloud-runtime.js";
import { listStudents } from "../students/students-service.js?v=2026-08-31-record-edit-1";

// A student below this general average, or failing/barred in any subject,
// is surfaced as a candidate for a guidance case or a support plan — this
// is the single place both domains read academic data through, so a
// school-specific passing threshold only needs updating here.
const FAIL_THRESHOLD_PCT = 50;

// academicFlags holds one aggregate row per student (overallPct, per-subject
// pct, absent/barred counts) computed outside Masar — Cowork reads the raw
// Excel/PDF grade files from OneDrive and writes this collection wholesale
// after each analysis run. Masar never stores a per-subject-per-term score
// row itself anymore; it only applies the threshold above to the numbers
// Cowork already computed. See README for the full data-flow design.
//
// Students with no academicFlags row yet, or with nothing below threshold,
// are simply absent from the result — this is a suggestion list, not a
// roster.
//
// The overall average used below is finalCumulativeAverage (the official
// transcript-printed cumulative average) first, falling back to overallPct
// only when it's missing — see the same note in achievement-service.js for
// why overallPct alone can be badly skewed for a student whose certificate
// only had a handful of subject rows matched.
export async function computeStudentGradeSummaries() {
  const [flags, students] = await Promise.all([listAll("academicFlags"), listStudents()]);
  const currentStudentIds = new Set(students.map((student) => String(student.id)));

  const summaries = [];
  for (const f of flags) {
    if (!f.studentId) continue;
    if (!currentStudentIds.has(String(f.studentId))) continue;
    const overallSource = f.finalCumulativeAverage ?? f.overallPct;
    const overallPct = overallSource == null ? null : Number(overallSource);
    const failingSubjects = (f.subjects || []).filter((s) => s.pct != null && Math.round(Number(s.pct)) < FAIL_THRESHOLD_PCT);
    const barredCount = Number(f.barredCount) || 0;
    const absentCount = Number(f.absentCount) || 0;

    const reasons = [];
    if (overallPct != null && overallPct < FAIL_THRESHOLD_PCT) reasons.push(`المعدل العام ${overallPct}% أقل من ${FAIL_THRESHOLD_PCT}%`);
    if (failingSubjects.length) reasons.push(`رسوب في ${failingSubjects.length} ${failingSubjects.length === 1 ? "مادة" : "مواد"}`);
    if (barredCount) reasons.push(`محروم في ${barredCount} ${barredCount === 1 ? "مادة" : "مواد"}`);
    if (!reasons.length) continue;

    summaries.push({
      studentId: f.studentId,
      avgPct: overallPct,
      failingSubjects: failingSubjects.map((s) => s.subject),
      absentCount,
      barredCount,
      reasons,
    });
  }
  return summaries.sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0));
}
