import { list as listAll, listWhere, listFieldValues, get, save, rpc } from "../../services/cloud-runtime.js?v=2026-09-06-field-values-1";
import { ensureStudentsSeeded } from "../../services/students-source.js";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";

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

export async function updateStudent(id, fields) {
  const current = await getStudent(id);
  if (!current) throw new Error("تعذّر إيجاد بيانات الطالب");
  if (!String(fields.name || current.name || "").trim()) throw new Error("اسم الطالب مطلوب");
  const updated = await save("students", {
    ...current,
    ...fields,
    id: current.id,
    name: String(fields.name ?? current.name).trim(),
    updatedAt: new Date().toISOString(),
  });
  invalidateStudentsCache();
  await logAuditEvent("update_student", { tableName: "students", recordId: String(updated.id) });
  return updated;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

export const STUDENT_LEVEL_ORDER = ["الأول", "الثاني", "الثالث"];
export const STUDENT_TRACK_ORDER = ["الصناعي", "التجاري"];

export function studentTrackGroup(student) {
  if (STUDENT_TRACK_ORDER.includes(student?.track)) return student.track;
  return String(student?.section || "").includes("تجر") ? "التجاري" : "الصناعي";
}

export function buildLevelTrackBreakdown(students) {
  return Object.fromEntries(STUDENT_LEVEL_ORDER.map((level) => [level, {
    الصناعي: students.filter((student) => student.level === level && studentTrackGroup(student) === "الصناعي").length,
    التجاري: students.filter((student) => student.level === level && studentTrackGroup(student) === "التجاري").length,
  }]));
}

export async function getLevelTrackBreakdown() {
  if (!isTestRuntime()) {
    try {
      const pairs = STUDENT_LEVEL_ORDER.flatMap((level) => STUDENT_TRACK_ORDER.map((track) => ({ level, track })));
      const results = await Promise.all(pairs.map(({ level, track }) => rpc("masar_search_students", {
        p_query: "", p_level: level, p_department: null, p_track: track, p_offset: 0, p_limit: 1,
      })));
      const breakdown = Object.fromEntries(STUDENT_LEVEL_ORDER.map((level) => [level, { الصناعي: 0, التجاري: 0 }]));
      pairs.forEach(({ level, track }, index) => { breakdown[level][track] = results[index].length ? Number(results[index][0].total_count) : 0; });
      return breakdown;
    } catch {
      // توافق مع أي قاعدة قديمة لا تحتوي دالة البحث المخففة.
    }
  }
  return buildLevelTrackBreakdown(await listStudents());
}

export function normalizeSectionFilter(value) {
  return String(value || "").trim().replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

export async function getFilterOptions() {
  const students = await listStudents();
  return {
    levels: uniqueSorted(students.map((s) => s.level)),
    departments: uniqueSorted(students.map((s) => s.department)),
    tracks: STUDENT_TRACK_ORDER,
    sections: uniqueSorted(students.map((s) => s.section)),
  };
}

export async function searchStudents({ query = "", level, department, track, section } = {}) {
  const students = await listStudents();
  const q = query.trim().toLowerCase();
  return students.filter((s) => {
    if (level && s.level !== level) return false;
    if (department && s.department !== department) return false;
    if (track && studentTrackGroup(s) !== track) return false;
    if (section && s.section !== normalizeSectionFilter(section)) return false;
    if (q) {
      const hay = `${s.name || ""} ${s.nameEn || ""} ${s.academicId || ""} ${s.civilId || ""} ${s.section || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function searchStudentsPage({ query = "", level, department, track, section, offset = 0, limit = 50 } = {}) {
  if (section) {
    const exactSection = normalizeSectionFilter(section);
    const sectionStudents = exactSection ? await listWhere("students", "section", exactSection) : await listStudents();
    const q = query.trim().toLowerCase();
    const filtered = sectionStudents.filter((student) => {
      if (level && student.level !== level) return false;
      if (department && student.department !== department) return false;
      if (track && studentTrackGroup(student) !== track) return false;
      if (!q) return true;
      return `${student.name || ""} ${student.nameEn || ""} ${student.academicId || ""} ${student.civilId || ""}`.toLowerCase().includes(q);
    });
    return { rows: filtered.slice(offset, offset + limit), total: filtered.length };
  }
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
  const all = await searchStudents({ query, level, department, track, section });
  return { rows: all.slice(offset, offset + limit), total: all.length };
}

export async function listStudentsForSection(section) {
  const exactSection = normalizeSectionFilter(section);
  if (!exactSection) return [];
  const rows = await listWhere("students", "section", exactSection);
  return rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
}

export async function getRosterMeta() {
  if (!isTestRuntime()) {
    try {
      const meta = await rpc("masar_student_roster_meta");
      const sections = Array.isArray(meta.sections) && meta.sections.length
        ? uniqueSorted(meta.sections)
        : uniqueSorted(await listFieldValues("students", "section"));
      return {
        stats: { total: Number(meta.total || 0), byLevel: meta.byLevel || {}, flagged: Number(meta.flagged || 0), unmatched: Number(meta.unmatched || 0) },
        options: { levels: meta.levels || [], departments: meta.departments || [], tracks: STUDENT_TRACK_ORDER, sections },
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
