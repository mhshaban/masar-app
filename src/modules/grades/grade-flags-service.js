import { list as listAll, rpc } from "../../services/cloud-runtime.js";
import { gradeRowPct } from "./score-conventions.js";

function testBackend() {
  return typeof globalThis !== "undefined" ? globalThis.__MASAR_TEST_BACKEND__ : null;
}

// A student below this general average, or failing/barred in any subject,
// is surfaced as a candidate for a guidance case or a support plan — this
// is the single place both domains read grades through, so a school-specific
// passing threshold only needs updating here.
const FAIL_THRESHOLD_PCT = 50;

// The dashboard's "طلاب يحتاجون متابعة" widget calls the guidance-cases and
// support-plan candidate lists together (Promise.all in
// followup-needs-service.js), and each of those independently calls this
// function — without sharing, that meant TWO full, separately-paginated
// scans of the entire grades collection running concurrently on every
// dashboard load (confirmed live: 22,982+ rows, ~23 sequential paginated
// requests each). Sharing one in-flight computation across concurrent
// callers halves that. The shared promise is cleared the instant it settles
// (not cached on a timer) — a later call, even a second afterward, always
// re-fetches fresh, so a just-imported batch of grades is never served
// stale data.
let inFlight = null;

// Summarizes each student's grades into a flag with human-readable reasons,
// for the "candidates" panel on the guidance-cases and support-plan screens.
// Students with no grades imported yet, or with nothing below threshold,
// are simply absent from the result — this is a suggestion list, not a roster.
export async function computeStudentGradeSummaries() {
  if (inFlight) return inFlight;
  inFlight = computeFresh();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// مسار الإنتاج يفضّل حساب Postgres نفسه (masar_grade_summaries — راجع
// supabase/migrations/20260821_masar_grade_summaries.sql): أجزاء من
// الثانية بغض النظر عن حجم الجدول، بدل عشرات الطلبات المقسّمة صفحات لتنزيل
// كل صفوف الدرجات للمتصفح. لو الدالة غير مطبَّقة بعد بمشروع Supabase
// (الهجرة تحتاج تشغيلًا يدويًا من لوحة التحكم، رفعها لـ GitHub وحده لا
// يكفي) أو صار خطأ شبكة عابر، نرجع تلقائيًا لنفس الحساب بجافاسكربت القديم
// بدل ما تنكسر الشاشة كليًا لحد ما تُشغَّل الهجرة.
async function computeFresh() {
  if (!testBackend()) {
    try {
      const rows = await rpc("masar_grade_summaries", { p_fail_threshold_pct: FAIL_THRESHOLD_PCT });
      return rows.map((r) => ({
        studentId: r.student_id,
        avgPct: r.avg_pct == null ? null : Number(r.avg_pct),
        failingSubjectCodes: r.failing_subject_codes || [],
        absentCount: r.absent_count,
        barredCount: r.barred_count,
        reasons: r.reasons || [],
      }));
    } catch {
      // يتابع بالحساب المحلي أدناه.
    }
  }

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
