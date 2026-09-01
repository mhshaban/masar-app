const STORAGE_KEY = "masar-daily-priority-decisions-v1";

function todayBahrain(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function readAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

function writeAll(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function getPriorityDecision(key) {
  return readAll()[key] || null;
}

export function markPriorityReviewed(key, now = new Date()) {
  const all = readAll();
  all[key] = { status: "reviewed", reviewedAt: now.toISOString(), reviewedDate: todayBahrain(now) };
  writeAll(all);
  return all[key];
}

export function snoozePriority(key, until, reason, now = new Date()) {
  if (!until) throw new Error("تاريخ التأجيل مطلوب");
  if (!String(reason || "").trim()) throw new Error("سبب التأجيل مطلوب");
  const all = readAll();
  all[key] = { status: "snoozed", snoozedUntil: until, reason: String(reason).trim(), updatedAt: now.toISOString() };
  writeAll(all);
  return all[key];
}

export function clearPriorityDecision(key) {
  const all = readAll();
  delete all[key];
  writeAll(all);
}

export function priorityDecisionState(key, now = new Date()) {
  const decision = getPriorityDecision(key);
  if (!decision) return { hidden: false, decision: null };
  const today = todayBahrain(now);
  if (decision.status === "reviewed" && decision.reviewedDate === today) return { hidden: true, decision };
  if (decision.status === "snoozed" && decision.snoozedUntil >= today) return { hidden: true, decision };
  return { hidden: false, decision };
}

export function listPriorityDecisions() {
  return readAll();
}
