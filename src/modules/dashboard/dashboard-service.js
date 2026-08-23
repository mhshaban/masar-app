import { rpc } from "../../services/cloud-runtime.js";
import { getAgendaProgressSummary } from "../agenda/agenda-service.js";
import { listStudentsNeedingAttention } from "./followup-needs-service.js";
import { listStaleOpenCases } from "../cases/guidance-service.js";
import { listOverdueActions } from "../support/support-service.js";

export async function loadDashboardSnapshot() {
  if (!globalThis.__MASAR_TEST_BACKEND__) {
    try {
      const snapshot = await rpc("masar_dashboard_snapshot", { p_stale_days: 14 });
      if (snapshot?.agenda && Array.isArray(snapshot.attentionRows)) return snapshot;
    } catch {
      // توافق مؤقت مع مشروع Supabase قبل تطبيق migration الجديدة.
    }
  }

  const [agenda, attentionRows, staleCases, overdueSupportActions] = await Promise.all([
    getAgendaProgressSummary(),
    listStudentsNeedingAttention(),
    listStaleOpenCases(),
    listOverdueActions(),
  ]);
  return { agenda, attentionRows, staleCases, overdueSupportActions };
}
