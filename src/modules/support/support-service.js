import { list as listAll, get, save, remove } from "../../services/storage-runtime.js";
import { computeStudentGradeSummaries } from "../grades/grade-flags-service.js";

const NEXT_STATUS = { not_started: "ongoing", ongoing: "done", done: "not_started" };

export async function listPlans() {
  const plans = await listAll("supportPlans");
  return plans.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return (b.startDate || "").localeCompare(a.startDate || "");
  });
}

export async function getPlan(id) {
  return get("supportPlans", id);
}

export async function createPlan({ studentId, studentName, domain, goal, notes }) {
  if (!studentId) throw new Error("يجب اختيار الطالب أولًا");
  return save("supportPlans", {
    studentId: String(studentId),
    studentName: studentName || null,
    domain: (domain || "").trim(),
    goal: (goal || "").trim(),
    status: "active",
    startDate: new Date().toISOString().slice(0, 10),
    completedDate: null,
    notes: notes || "",
  });
}

export async function updatePlan(id, patch) {
  const current = await get("supportPlans", id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await save("supportPlans", next);
  return next;
}

export async function completePlan(id) {
  return updatePlan(id, { status: "completed", completedDate: new Date().toISOString().slice(0, 10) });
}

export async function cancelPlan(id) {
  return updatePlan(id, { status: "cancelled", completedDate: new Date().toISOString().slice(0, 10) });
}

export async function reactivatePlan(id) {
  return updatePlan(id, { status: "active", completedDate: null });
}

export async function removePlan(id) {
  const actions = await listAll("supportPlanActions");
  for (const a of actions.filter((a) => a.planId === id)) {
    await remove("supportPlanActions", a.id);
  }
  return remove("supportPlans", id);
}

export async function listActions(planId) {
  const actions = await listAll("supportPlanActions");
  return actions.filter((a) => a.planId === planId);
}

export async function addAction(planId, { action, dueDate }) {
  if (!action || !action.trim()) throw new Error("نص الإجراء مطلوب");
  return save("supportPlanActions", {
    planId,
    action: action.trim(),
    status: "not_started",
    dueDate: dueDate || null,
  });
}

export async function cycleActionStatus(id) {
  const actions = await listAll("supportPlanActions");
  const current = actions.find((a) => a.id === id);
  if (!current) return null;
  const next = { ...current, status: NEXT_STATUS[current.status] || "not_started" };
  await save("supportPlanActions", next);
  return next;
}

export async function removeAction(id) {
  return remove("supportPlanActions", id);
}

export async function listActivePlanStudentIds() {
  const plans = await listAll("supportPlans");
  return new Set(plans.filter((p) => p.status === "active").map((p) => p.studentId));
}

// Students flagged by their grades who don't already have an active support
// plan — the same underlying grade summaries the guidance-cases screen uses,
// filtered against this domain's own existing records.
export async function listCandidates() {
  const [summaries, activeIds] = await Promise.all([computeStudentGradeSummaries(), listActivePlanStudentIds()]);
  return summaries.filter((s) => !activeIds.has(s.studentId));
}

// إجراء له تاريخ استحقاق فات ولسا ما أُنجز، ضمن خطة نشطة (خطة مكتملة/ملغاة
// لا تحتاج تنبيهًا). التاريخ حقل حقيقي هنا (dueDate)، بخلاف "فترة التنفيذ"
// النصية الحرة بخطة القسم اللي ما تسمح بحساب مماثل.
export async function listOverdueActions() {
  const [plans, actions] = await Promise.all([listAll("supportPlans"), listAll("supportPlanActions")]);
  const planById = new Map(plans.map((p) => [p.id, p]));
  const today = new Date().toISOString().slice(0, 10);

  return actions
    .filter((a) => a.status !== "done" && a.dueDate && a.dueDate < today && planById.get(a.planId)?.status === "active")
    .map((a) => ({ ...a, plan: planById.get(a.planId) }))
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
}
