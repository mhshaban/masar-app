import { list as listAll } from "../../services/cloud-runtime.js";
import { gradeRowPct } from "./score-conventions.js";

// A student below this general average, or failing/barred in any subject,
// is surfaced as a candidate for a guidance case or a support plan — this
// is the single place both domains read grades through, so a school-specific
// passing threshold only needs updating here.
const FAIL_THRESHOLD_PCT = 50;

// Summarizes each student's grades into a flag with human-readable reasons,
// for the "candidates" panel on the guidance-cases and support-plan screens.
// Students with no grades imported yet, or with nothing below threshold,
// are simply absent from the result — this is a suggestion list, not a roster.
export async function computeStudentGradeSummaries() {
  const grades = await listAll("grades");
  const byStudent = new Map();
  for (const g of grades) {
    if (!g.studentId) continue;
    if (!byStudent.has(g.studentId)) byStudent.set(g.studentId, []);
    byStudent.get(g.studentId).push(g);
  }

  const summaries = [];
  for (const [studentId, rows] of byStudent) {
    const graded = rows.filter((g) => g.score != null);
    const failingSubjects = graded.filter((g) => Math.round(gradeRowPct(g) * 100) < FAIL_THRESHOLD_PCT);
    const barredCount = rows.filter((g) => g.scoreStatus === "barred").length;
    const absentCount = rows.filter((g) => g.scoreStatus === "absent").length;
    const avgPct = graded.length
      ? Math.round((graded.reduce((sum, g) => sum + gradeRowPct(g), 0) / graded.length) * 100)
      : null;

    const reasons = [];
    if (avgPct != null && avgPct < FAIL_THRESHOLD_PCT) reasons.push(`المعدل العام ${avgPct}% أقل من ${FAIL_THRESHOLD_PCT}%`);
    if (failingSubjects.length) reasons.push(`رسوب في ${failingSubjects.length} ${failingSubjects.length === 1 ? "مادة" : "مواد"}`);
    if (barredCount) reasons.push(`محروم في ${barredCount} ${barredCount === 1 ? "مادة" : "مواد"}`);
    if (!reasons.length) continue;

    summaries.push({
      studentId,
      avgPct,
      failingSubjectCodes: failingSubjects.map((g) => g.subjectCode),
      absentCount,
      barredCount,
      reasons,
    });
  }
  return summaries.sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0));
}
