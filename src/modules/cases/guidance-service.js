import { list as listAll, get, save, remove } from "../../services/cloud-runtime.js";
import { computeStudentGradeSummaries } from "../grades/grade-flags-service.js";

export const CASE_CATEGORIES = ["أكاديمية", "سلوكية", "اجتماعية", "نفسية"];

export async function listCases() {
  const cases = await listAll("guidanceCases");
  return cases.sort((a, b) => (b.openedDate || "").localeCompare(a.openedDate || ""));
}

export async function getCase(id) {
  return get("guidanceCases", id);
}

export async function createCase({ studentId, studentName, category, title, notes, source }) {
  if (!studentId) throw new Error("يجب اختيار الطالب أولًا");
  return save("guidanceCases", {
    studentId: String(studentId),
    studentName: studentName || null,
    category: category || CASE_CATEGORIES[0],
    title: (title || "").trim(),
    status: "open",
    openedDate: new Date().toISOString().slice(0, 10),
    closedDate: null,
    notes: notes || "",
    source: source || "manual",
  });
}

export async function updateCase(id, patch) {
  const current = await get("guidanceCases", id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await save("guidanceCases", next);
  return next;
}

export async function closeCase(id) {
  return updateCase(id, { status: "closed", closedDate: new Date().toISOString().slice(0, 10) });
}

export async function reopenCase(id) {
  return updateCase(id, { status: "open", closedDate: null });
}

export async function removeCase(id) {
  const sessions = await listAll("caseSessions");
  for (const s of sessions.filter((s) => s.caseId === id)) {
    await remove("caseSessions", s.id);
  }
  return remove("guidanceCases", id);
}

export async function listSessions(caseId) {
  const sessions = await listAll("caseSessions");
  return sessions.filter((s) => s.caseId === caseId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export async function addSession(caseId, { date, note, nextStep }) {
  if (!note || !note.trim()) throw new Error("ملاحظة الجلسة مطلوبة");
  return save("caseSessions", {
    caseId,
    date: date || new Date().toISOString().slice(0, 10),
    note: note.trim(),
    nextStep: nextStep ? nextStep.trim() : null,
  });
}

export async function removeSession(id) {
  return remove("caseSessions", id);
}

export async function listCaseStudentIds() {
  const cases = await listAll("guidanceCases");
  return new Set(cases.filter((c) => c.status !== "closed").map((c) => c.studentId));
}

// Students flagged by their grades who don't already have an open case —
// the whole point of connecting grades to guidance is that this list needs
// no separate data entry, it falls out of grades already imported.
export async function listCandidates() {
  const [summaries, openIds] = await Promise.all([computeStudentGradeSummaries(), listCaseStudentIds()]);
  return summaries.filter((s) => !openIds.has(s.studentId));
}
