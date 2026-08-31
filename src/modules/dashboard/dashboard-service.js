import { getAgendaProgressSummary, listAgendaEntries } from "../agenda/agenda-service.js";
import { listStudentsNeedingAttention } from "./followup-needs-service.js";
import { listStaleOpenCases } from "../cases/guidance-service.js";
import { listOverdueActions } from "../support/support-service.js";
import { rpc } from "../../services/cloud-runtime.js?v=2026-08-31-egress-1";

function bahrainIsoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function classifyPlanPriorities(entries, now = new Date()) {
  const today = bahrainIsoDate(now);
  const limit = new Date(`${today}T00:00:00+03:00`);
  limit.setDate(limit.getDate() + 14);
  const through = bahrainIsoDate(limit);
  const pending = entries.filter((entry) => entry.progress?.status !== "done");
  const overdue = pending.filter((entry) => {
    const due = entry.periodEnd || entry.periodStart;
    return due && due < today;
  }).sort((a, b) => (a.periodEnd || a.periodStart).localeCompare(b.periodEnd || b.periodStart));
  const upcoming = pending.filter((entry) => entry.periodStart && entry.periodStart >= today && entry.periodStart <= through)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const undated = pending.filter((entry) => !entry.periodStart && !entry.periodEnd);
  return { today, through, overdue, upcoming, undated };
}

// Used to compose this via one masar_dashboard_snapshot RPC — worthwhile
// back when grade-flags scanned the full raw grades table (22,982+ rows) on
// every dashboard load. Now that grade candidates come from academicFlags
// (one aggregate row per student, see grade-flags-service.js), the plain JS
// composition below is fast on its own; the RPC and its masar_grade_summaries
// dependency were retired accordingly (see the grades-import-to-Cowork
// migration).
export async function loadDashboardSnapshot() {
  if (!globalThis.__MASAR_TEST_BACKEND__) {
    try {
      const [snapshot, planEntries] = await Promise.all([
        rpc("masar_dashboard_snapshot_v2", { p_stale_days: 14, p_attention_limit: 20 }),
        listAgendaEntries(),
      ]);
      return {
        agenda: snapshot.agenda || { total: 0, done: 0, ongoing: 0, notStarted: 0 },
        attentionRows: snapshot.attentionRows || [],
        attentionCount: Number(snapshot.attentionCount || 0),
        staleCases: snapshot.staleCases || [],
        overdueSupportActions: snapshot.overdueSupportActions || [],
        planPriorities: classifyPlanPriorities(planEntries),
      };
    } catch (error) {
      console.warn("تعذر استخدام لقطة الرئيسية المخفّضة؛ سيُستخدم المسار التوافقي", error);
    }
  }
  const [agenda, attentionRows, staleCases, overdueSupportActions, planEntries] = await Promise.all([
    getAgendaProgressSummary(),
    listStudentsNeedingAttention(),
    listStaleOpenCases(),
    listOverdueActions(),
    listAgendaEntries(),
  ]);
  return { agenda, attentionRows, attentionCount: attentionRows.length, staleCases, overdueSupportActions, planPriorities: classifyPlanPriorities(planEntries) };
}
