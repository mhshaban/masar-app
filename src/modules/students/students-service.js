import { list as listAll, get, rpc } from "../../services/storage-runtime.js";
import { ensureStudentsSeeded } from "../../services/students-source.js";

const ROSTER_CACHE_MS = 15_000;
let rosterCache = null;
let rosterCacheUntil = 0;
let rosterInFlight = null;

function isTestRuntime() {
  return typeof globalThis !== "undefined" && !!globalThis.__MASAR_TEST_BACKEND__;
}

export function invalidateStudentsCache() {
  rosterCache = null;
  rosterCacheUntil = 0;
  rosterInFlight = null;
}

export async function getRosterStatus() {
  return ensureStudentsSeeded();
}

export async function listStudents() {
  if (!isTestRuntime() && rosterCache && Date.now() < rosterCacheUntil) return rosterCache;
  if (!isTestRuntime() && rosterInFlight) return rosterInFlight;
  const load = (async () => {
    await ensureStudentsSeeded();
    const students = await listAll("students");
    if (!isTestRuntime()) {
      rosterCache = students;
      rosterCacheUntil = Date.now() + ROSTER_CACHE_MS;
    }
    return students;
  })();
  if (!isTestRuntime()) rosterInFlight = load;
  try {
    return await load;
  } finally {
    if (rosterInFlight === load) rosterInFlight = null;
  }
}

export async function getStudent(id) {
  await ensureStudentsSeeded();
  if (!isTestRuntime() && rosterCache && Date.now() < rosterCacheUntil) {
    return rosterCache.find((student) => String(student.id) === String(id)) || null;
  }
  return get("students", id);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

export async function getFilterOptions() {
  const students = await listStudents();
  return {
    levels: uniqueSorted(students.map((s) => s.level)),
    departments: uniqueSorted(students.map((s) => s.department)),
    tracks: uniqueSorted(students.map((s) => s.track)),
  };
}

export async function searchStudents({ query = "", level, department, track } = {}) {
  const students = await listStudents();
  const q = query.trim().toLowerCase();
  return students.filter((s) => {
    if (level && s.level !== level) return false;
    if (department && s.department !== department) return false;
    if (track && s.track !== track) return false;
    if (q) {
      const hay = `${s.name || ""} ${s.nameEn || ""} ${s.academicId || ""} ${s.civilId || ""} ${s.section || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function searchStudentsPage({ query = "", level, department, track, offset = 0, limit = 50 } = {}) {
  if (!isTestRuntime()) {
    try {
      const rows = await rpc("masar_search_students", {
        p_query: query,
        p_level: level || null,
        p_department: department || null,
        p_track: track || null,
        p_offset: offset,
        p_limit: limit,
      });
      return {
        rows: rows.map((row) => ({ ...row.data, id: row.id })),
        total: rows.length ? Number(rows[0].total_count) : 0,
      };
    } catch {
      // قاعدة لم تُطبَّق عليها migration بعد — نُبقي التوافق المؤقت.
    }
  }
  const all = await searchStudents({ query, level, department, track });
  return { rows: all.slice(offset, offset + limit), total: all.length };
}

export async function getRosterMeta() {
  if (!isTestRuntime()) {
    try {
      const meta = await rpc("masar_student_roster_meta");
      return {
        stats: { total: Number(meta.total || 0), byLevel: meta.byLevel || {}, flagged: Number(meta.flagged || 0), unmatched: Number(meta.unmatched || 0) },
        options: { levels: meta.levels || [], departments: meta.departments || [], tracks: meta.tracks || [] },
      };
    } catch {
      // توافق مع قواعد البيانات قبل migration.
    }
  }
  const [stats, options] = await Promise.all([getRosterStats(), getFilterOptions()]);
  return { stats, options };
}

export async function getRosterStats() {
  const students = await listStudents();
  const byLevel = {};
  for (const s of students) {
    const key = s.level || "غير محدد";
    byLevel[key] = (byLevel[key] || 0) + 1;
  }
  const flagged = students.filter((s) => s.supportNeeded || s.socialGuidance).length;
  const unmatched = students.filter((s) => !s.academicId || !s.level).length;
  return { total: students.length, byLevel, flagged, unmatched };
}
