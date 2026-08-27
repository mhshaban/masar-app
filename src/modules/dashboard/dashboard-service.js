import { getAgendaProgressSummary } from "../agenda/agenda-service.js";
import { listStudentsNeedingAttention } from "./followup-needs-service.js";
import { listStaleOpenCases } from "../cases/guidance-service.js";
import { listOverdueActions } from "../support/support-service.js";

// Used to compose this via one masar_dashboard_snapshot RPC — worthwhile
// back when grade-flags scanned the full raw grades table (22,982+ rows) on
// every dashboard load. Now that grade candidates come from academicFlags
// (one aggregate row per student, see grade-flags-service.js), the plain JS
// composition below is fast on its own; the RPC and its masar_grade_summaries
// dependency were retired accordingly (see the grades-import-to-Cowork
// migration).
export async function loadDashboardSnapshot() {
  const [agenda, attentionRows, staleCases, overdueSupportActions] = await Promise.all([
    getAgendaProgressSummary(),
    listStudentsNeedingAttention(),
    listStaleOpenCases(),
    listOverdueActions(),
  ]);
  return { agenda, attentionRows, staleCases, overdueSupportActions };
}
