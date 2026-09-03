import { LOCAL_DASHBOARD_CACHE_KEY, LOCAL_FOLDER_HANDLE_DB } from "../../services/local-security.js";

const HANDLE_DB = LOCAL_FOLDER_HANDLE_DB;
const HANDLE_STORE = "handles";
const HANDLE_KEY = "masar-onedrive-folder";
const CACHE_KEY = LOCAL_DASHBOARD_CACHE_KEY;

function bahrainDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle) {
  const db = await openHandleDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE, "readwrite");
      transaction.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function getHandle() {
  const db = await openHandleDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, "readonly").objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

function needsForBackup(c) {
  const students = c.students || [];
  const flags = c.academicFlags || [];
  const openCases = new Set((c.guidanceCases || []).filter((x) => (x.status || "open") !== "closed").map((x) => String(x.studentId)));
  const activePlans = new Set((c.supportPlans || []).filter((x) => x.status === "active").map((x) => String(x.studentId)));
  const careerStudents = new Set((c.careerSessions || []).map((x) => String(x.studentId)));
  const byStudent = new Map();
  const add = (id, type, reasons) => {
    id = String(id || ""); if (!id) return;
    if (!byStudent.has(id)) byStudent.set(id, []);
    if (!byStudent.get(id).some((n) => n.type === type)) byStudent.get(id).push({ type, reasons });
  };
  for (const f of flags) {
    const reasons = [];
    const pct = Number(f.overallPct);
    const failing = (f.subjects || []).filter((s) => Number(s.pct) < 50).length;
    if (Number.isFinite(pct) && pct < 50) reasons.push(`المعدل العام ${pct}% أقل من 50%`);
    if (failing) reasons.push(`رسوب في ${failing} ${failing === 1 ? "مادة" : "مواد"}`);
    if (Number(f.barredCount) > 0) reasons.push(`محروم في ${f.barredCount} مادة`);
    if (!reasons.length) continue;
    if (!openCases.has(String(f.studentId))) add(f.studentId, "case", reasons);
    if (!activePlans.has(String(f.studentId))) add(f.studentId, "support", reasons);
  }
  for (const s of students) if (s.level === "الثالث" && !careerStudents.has(String(s.id))) add(s.id, "career", ["طالب سنة نهائية بلا جلسة توجيه مهني بعد"]);
  const promoted = new Map();
  for (const row of c.promotedSubjects || []) {
    if (row.cleared) continue;
    const id = String(row.studentId || "");
    if (!promoted.has(id)) promoted.set(id, new Set());
    promoted.get(id).add(String(row.subjectCode || "غير محدد"));
  }
  for (const [id, subjects] of promoted) add(id, "promoted", [`مقررات لم تُجتز بعد: ${[...subjects].join("، ")}`]);
  const studentMap = new Map(students.map((s) => [String(s.id), s]));
  return [...byStudent].map(([studentId, needs]) => ({ studentId, student: studentMap.get(studentId) || null, needs }))
    .sort((a, b) => priorityScore(b.needs) - priorityScore(a.needs));
}

export const NEED_WEIGHTS = { case: 40, support: 35, promoted: 25, career: 15 };
export function priorityScore(needs = []) { return needs.reduce((sum, n) => sum + (NEED_WEIGHTS[n.type] || 0), 0); }
export function priorityLevel(score) { return score >= 60 ? "high" : score >= 30 ? "medium" : "normal"; }

export function buildLocalDashboardSnapshot(backup, now = new Date()) {
  if (!backup || backup.app !== "masar" || !backup.collections) throw new Error("ملف النسخة الاحتياطية غير صالح لمسار");
  const c = backup.collections;
  const today = bahrainDate(now);
  const throughDate = new Date(`${today}T00:00:00+03:00`); throughDate.setDate(throughDate.getDate() + 14);
  const through = bahrainDate(throughDate);
  const progress = new Map((c.actionProgress || []).map((p) => [p.id, p]));
  const actions = (c.departmentPlanProjects || []).flatMap((p) => (p.actions || []).map((a) => ({
    ...a, id: `${p.id}-a${a.no}`, pillar: p.pillar, project_title: p.project_title, program_name: p.program_name,
    status: progress.get(`${p.id}-a${a.no}`)?.status || "not_started",
  })));
  const pending = actions.filter((a) => a.status !== "done");
  const overdue = pending.filter((a) => (a.periodEnd || a.periodStart) && (a.periodEnd || a.periodStart) < today).sort((a,b) => (a.periodEnd || a.periodStart).localeCompare(b.periodEnd || b.periodStart));
  const upcoming = pending.filter((a) => a.periodStart >= today && a.periodStart <= through).sort((a,b) => a.periodStart.localeCompare(b.periodStart));
  const undated = pending.filter((a) => !a.periodStart && !a.periodEnd);
  const attentionRows = needsForBackup(c);
  const studentMap = new Map((c.students || []).map((s) => [String(s.id), s]));
  const attentionBreakdown = { case: 0, support: 0, career: 0, promoted: 0 };
  for (const row of attentionRows) for (const need of row.needs) if (need.type in attentionBreakdown) attentionBreakdown[need.type] += 1;
  const highPriorityCount = attentionRows.filter((row) => priorityLevel(priorityScore(row.needs)) === "high").length;
  const academicWeak = (c.academicFlags || []).map((flag) => {
    const reasons = [];
    const pct = Number(flag.overallPct);
    const failing = (flag.subjects || []).filter((s) => Number(s.pct) < 50).length;
    if (Number.isFinite(pct) && pct < 50) reasons.push(`المعدل العام ${pct}% أقل من 50%`);
    if (failing) reasons.push(`رسوب في ${failing} ${failing === 1 ? "مادة" : "مواد"}`);
    if (Number(flag.barredCount) > 0) reasons.push(`محروم في ${flag.barredCount} مادة`);
    return { studentId: String(flag.studentId), student: studentMap.get(String(flag.studentId)) || null, overallPct: Number.isFinite(pct) ? pct : null, barredCount: Number(flag.barredCount || 0), reasons };
  }).filter((row) => row.reasons.length).sort((a, b) => (a.overallPct ?? 101) - (b.overallPct ?? 101) || b.barredCount - a.barredCount).slice(0, 10);
  const promotedByStudent = new Map();
  for (const row of c.promotedSubjects || []) {
    if (row.cleared) continue;
    const id = String(row.studentId || "");
    if (!promotedByStudent.has(id)) promotedByStudent.set(id, new Set());
    promotedByStudent.get(id).add(String(row.subjectCode || "غير محدد"));
  }
  const promotedTop = [...promotedByStudent].map(([studentId, subjects]) => ({ studentId, student: studentMap.get(studentId) || null, subjects: [...subjects] }))
    .sort((a, b) => b.subjects.length - a.subjects.length || String(a.student?.name || a.studentId).localeCompare(String(b.student?.name || b.studentId), "ar")).slice(0, 10);
  const sessionsByCase = new Map();
  for (const s of c.caseSessions || []) {
    const key = String(s.caseId || "");
    if (!sessionsByCase.has(key) || String(s.date || "") > sessionsByCase.get(key)) sessionsByCase.set(key, String(s.date || ""));
  }
  const staleCutoff = new Date(`${today}T00:00:00+03:00`); staleCutoff.setDate(staleCutoff.getDate() - 14);
  const cutoff = bahrainDate(staleCutoff);
  const staleCases = (c.guidanceCases || []).filter((x) => (x.status || "open") !== "closed")
    .map((x) => ({ ...x, lastActivity: sessionsByCase.get(String(x.id)) || x.openedDate }))
    .filter((x) => x.lastActivity && x.lastActivity < cutoff).sort((a,b) => a.lastActivity.localeCompare(b.lastActivity));
  const planMap = new Map((c.supportPlans || []).map((p) => [String(p.id), p]));
  const overdueSupportActions = (c.supportPlanActions || []).filter((a) => {
    const p = planMap.get(String(a.planId)); return p?.status === "active" && a.status !== "done" && a.dueDate && a.dueDate < today;
  }).map((a) => ({ ...a, plan: planMap.get(String(a.planId)) }));
  const pillarCounts = actions.reduce((acc, action) => { const key = action.pillar || "غير محدد"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  return {
    agenda: { total: actions.length, done: actions.filter((a) => a.status === "done").length, ongoing: actions.filter((a) => a.status === "ongoing").length, notStarted: actions.filter((a) => a.status === "not_started").length },
    attentionRows: attentionRows.slice(0, 50), attentionCount: attentionRows.length, totalStudents: (c.students || []).length,
    attentionBreakdown, highPriorityCount, academicWeak, promotedTop, staleCases, overdueSupportActions,
    planSummary: { projectCount: (c.departmentPlanProjects || []).length, pillarCounts },
    planPriorities: { overdueCount: overdue.length, upcomingCount: upcoming.length, undatedCount: undated.length, overdue: overdue.slice(0, 12), upcoming: upcoming.slice(0, 12), undated: undated.slice(0, 12) },
    source: "onedrive-local", sourceUpdatedAt: backup.exportedAt || null,
  };
}

async function newestBackupFile(handle) {
  const matches = [];
  for await (const entry of handle.values()) {
    if (entry.kind === "file" && /^masar-backup.*\.json$/i.test(entry.name)) matches.push(entry);
  }
  if (!matches.length) throw new Error("لم أجد ملف masar-backup بصيغة JSON في المجلد المحدد");
  const files = await Promise.all(matches.map((entry) => entry.getFile()));
  return files.sort((a,b) => b.lastModified - a.lastModified)[0];
}

async function readAndCache(handle) {
  const file = await newestBackupFile(handle);
  const backup = JSON.parse(await file.text());
  const snapshot = { ...buildLocalDashboardSnapshot(backup), localFileName: file.name, localFileModifiedAt: new Date(file.lastModified).toISOString() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function folderAccessSupported() { return typeof window !== "undefined" && "showDirectoryPicker" in window; }
export function getCachedLocalSnapshot() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; } }

export async function connectMasarFolder() {
  if (!folderAccessSupported()) throw new Error("ربط المجلد يحتاج فتح نسخة مسار المنشورة في Chrome أو Edge");
  const handle = await window.showDirectoryPicker({ mode: "read", id: "masar-onedrive" });
  await saveHandle(handle);
  return readAndCache(handle);
}

export async function refreshMasarFolder({ prompt = false } = {}) {
  const handle = await getHandle();
  if (!handle) return null;
  let permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted" && prompt) permission = await handle.requestPermission({ mode: "read" });
  if (permission !== "granted") return getCachedLocalSnapshot();
  return readAndCache(handle);
}
