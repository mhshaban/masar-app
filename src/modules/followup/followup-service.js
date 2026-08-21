import { list as listAll } from "../../services/cloud-runtime.js";
import { listAgendaEntries } from "../agenda/agenda-service.js";

function aggregateStatus(entries) {
  if (!entries.length) return "not_started";
  const statuses = entries.map((e) => e.progress.status);
  if (statuses.every((s) => s === "done")) return "done";
  if (statuses.some((s) => s === "done" || s === "ongoing")) return "ongoing";
  return "not_started";
}

export async function listFollowUpItems() {
  return listAll("followUpItems");
}

// كل بند يُحسب حصريًا من الإجراءات الحية المرتبطة به بخطة القسم — لا يوجد
// أي إدخال يدوي منفصل ولا اعتماد على الحالة التاريخية المستوردة
// (importedStatus من dd784016.docx) بعد الآن؛ خطة القسم هي المصدر الوحيد.
// بند بلا أي إجراء مرتبط يظهر "لم يبدأ" — وهذا يكشف فجوة حقيقية (بند رسمي
// ما له نظير بالخطة بعد) بدل إخفائها برقم قديم أو تقدير يدوي منفصل.
function toRow(item, linked) {
  const status = aggregateStatus(linked);
  const totalParticipants = linked.reduce((sum, e) => sum + (Number(e.progress.participantsCount) || 0), 0);
  const summary = linked.length ? linked.map((e) => e.progress.proofNote || e.action).join(" · ") : null;
  return { ...item, linkedActions: linked, status, totalParticipants, summary };
}

export async function getFollowUpReport() {
  const [rawItems, entries] = await Promise.all([listFollowUpItems(), listAgendaEntries()]);
  const items = [...rawItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const bySection = new Map();
  for (const item of items) {
    const linked = entries.filter((e) => e.progress.followUpItemId === item.id);
    const row = toRow(item, linked);
    const key = item.section || "عام";
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(row);
  }
  return bySection;
}

export async function getStatsSummary() {
  const bySection = await getFollowUpReport();
  const sections = [];
  let totalItems = 0;
  let doneItems = 0;
  let totalParticipants = 0;
  let actionsExecuted = 0;

  for (const [section, rows] of bySection) {
    let sectionDone = 0;
    let sectionParticipants = 0;
    for (const row of rows) {
      totalItems += 1;
      if (row.status === "done") {
        doneItems += 1;
        sectionDone += 1;
      }
      sectionParticipants += row.totalParticipants;
      actionsExecuted += row.linkedActions.filter((a) => a.progress.status === "done").length;
    }
    totalParticipants += sectionParticipants;
    sections.push({
      section,
      total: rows.length,
      done: sectionDone,
      participants: sectionParticipants,
      completionPct: rows.length ? Math.round((sectionDone / rows.length) * 100) : 0,
    });
  }

  return {
    sections,
    totalItems,
    doneItems,
    totalParticipants,
    actionsExecuted,
    completionPct: totalItems ? Math.round((doneItems / totalItems) * 100) : 0,
  };
}

export async function listUnlinkedActions() {
  const entries = await listAgendaEntries();
  return entries.filter((e) => !e.progress.followUpItemId);
}
