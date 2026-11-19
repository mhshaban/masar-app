// درجات الوقفات التقويمية (وقفتان بكل فصل) — سجل واحد لكل طالب لكل وقفة
// بجدول checkpointGrades: { studentId (الرقم الأكاديمي), checkpoint (1|2),
// term, subjects: [{ code, name, score, maxScore, pct, status }], averagePct }.
// القراءة والمقارنة هنا دوال نقية قابلة للاختبار؛ الاستيراد يقرأ ملف Excel
// المصدَّر من النظام (صف لكل طالب × مقرر، أو صف لكل طالب بأعمدة المقررات).
import { listWhere, list as listAll, bulkPut, removeMany } from "../../services/cloud-runtime.js";
import { normalizeKey } from "../../services/text-normalize.js";

export const COLLECTION = "checkpointGrades";
export const CHECKPOINT_LABELS = { 1: "الوقفة التقويمية الأولى", 2: "الوقفة التقويمية الثانية" };
export const DEFAULT_TERM = "الفصل الأول 2026-2027";
// فرق أقل من نقطتين مئويتين يُعد ثباتًا لا تحسّنًا أو تراجعًا.
export const STEADY_BAND = 2;

const HEADER_ALIASES = {
  studentId: ["رقم الطالب", "الرقم الاكاديمي", "الرقم الأكاديمي", "رقم الطالب الأكاديمي"],
  studentName: ["اسم الطالب", "الاسم"],
  subjectCode: ["رمز المقرر", "رمز المادة"],
  subjectName: ["اسم المقرر", "المقرر", "المادة", "اسم المادة"],
  score: ["الدرجة", "درجة الطالب", "الدرجة المستحقة"],
  maxScore: ["الدرجة النهائية", "الدرجة العظمى", "من"],
  percentage: ["النسبة", "النسبة المئوية"],
};

const clean = (cell) => String(cell ?? "").replace(/[‎‏‪-‮]/g, "").replace(/\s+/g, " ").trim();
const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(normalizeKey(String(value)).replace(/[٫,]/g, "."));
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

function detectColumns(row) {
  const map = {};
  row.forEach((cell, idx) => {
    const text = clean(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(text)) map[field] = idx;
    }
  });
  return map;
}

function scoreEntry({ code, name, score, maxScore, percentage }) {
  // ملفات الوقفة (من المعلمين) لا ترمّز الغياب بـ0.5 كالشهادات: 0.5 هنا
  // نصف درجة فعلية، و«1/2» كذلك. الغياب يُقرأ من النص فقط (غ/غائب/محروم).
  const rawScore = /^\s*1\s*\/\s*2\s*$/.test(String(score ?? "")) ? 0.5 : num(score);
  const text = clean(score);
  if (rawScore == null && /^غ$|غائب|غياب/.test(text)) return { code, name, score: null, maxScore: num(maxScore), pct: null, status: "absent" };
  if (rawScore == null && /محروم/.test(text)) return { code, name, score: null, maxScore: num(maxScore), pct: null, status: "barred" };
  if (rawScore == null) return null;
  const max = num(maxScore);
  // قاعدة القسم (19/11): الصفر في الوقفة = غياب، لا تُرصد له درجة.
  if (rawScore === 0) return { code, name, score: null, maxScore: max, pct: null, status: "absent", fromZero: true };
  let pct = num(percentage);
  if (pct != null && pct <= 1 && (max == null || rawScore > 1)) pct *= 100;
  if (pct == null) pct = max ? (rawScore / max) * 100 : rawScore;
  return { code, name, score: rawScore, maxScore: max, pct: round2(pct), status: null };
}

// rows: مصفوفة صفوف (header: 1) من شيت واحد. يرجع Map: الرقم الأكاديمي →
// { studentName, subjects[] }.
export function parseCheckpointRows(rows) {
  const headerIndex = rows.slice(0, 15).findIndex((row) => {
    const cols = detectColumns(row || []);
    return cols.studentId !== undefined;
  });
  if (headerIndex < 0) throw new Error("لم أجد عمود «الرقم الأكاديمي» أو «رقم الطالب» في أول الملف.");
  const header = rows[headerIndex];
  const cols = detectColumns(header);
  const students = new Map();
  const add = (id, studentName, entry) => {
    if (!entry) return;
    if (!students.has(id)) students.set(id, { studentName, subjects: [] });
    const target = students.get(id);
    if (!target.studentName && studentName) target.studentName = studentName;
    const key = entry.code || entry.name;
    const existing = target.subjects.findIndex((s) => (s.code || s.name) === key);
    if (existing >= 0) target.subjects[existing] = entry; else target.subjects.push(entry);
  };
  const longFormat = cols.score !== undefined && (cols.subjectCode !== undefined || cols.subjectName !== undefined);
  // الشكل العريض: كل عمود غير معروف بعد عمودي الطالب = مقرر، ورأسه اسمه.
  const knownIdx = new Set(Object.values(cols));
  const subjectCols = longFormat ? [] : header.map((cell, idx) => ({ idx, name: clean(cell) })).filter((c) => c.name && !knownIdx.has(c.idx) && !/^(م|الشعبة|الصف|المستوى|المعدل|المجموع|التقدير|ملاحظات)$/.test(c.name));
  if (!longFormat && !subjectCols.length) throw new Error("لم أتعرّف على أعمدة الدرجات (رمز/اسم المقرر والدرجة).");
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row) continue;
    const id = normalizeKey(clean(row[cols.studentId]));
    if (!id || !/\d/.test(id)) continue;
    const studentName = cols.studentName !== undefined ? clean(row[cols.studentName]) : "";
    if (longFormat) {
      add(id, studentName, scoreEntry({
        code: cols.subjectCode !== undefined ? clean(row[cols.subjectCode]) : "",
        name: cols.subjectName !== undefined ? clean(row[cols.subjectName]) : "",
        score: row[cols.score],
        maxScore: cols.maxScore !== undefined ? row[cols.maxScore] : null,
        percentage: cols.percentage !== undefined ? row[cols.percentage] : null,
      }));
    } else {
      for (const c of subjectCols) add(id, studentName, scoreEntry({ code: "", name: c.name, score: row[c.idx], maxScore: null, percentage: null }));
    }
  }
  return students;
}

export function averageOf(subjects) {
  const pcts = subjects.map((s) => s.pct).filter((p) => p != null);
  return pcts.length ? round2(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
}

export const checkpointRecordId = (term, checkpoint, studentId) => `cp-${normalizeKey(term).replace(/[^\p{L}\p{N}]+/gu, "_")}-${checkpoint}-${studentId}`;

// يطابق الطلاب بسجل الطلبة الحالي فقط؛ غير المسجلين يُستبعدون (قاعدة القسم).
export function buildCheckpointRecords(parsed, students, { checkpoint, term = DEFAULT_TERM, sourceFile = "" }) {
  const byId = new Map();
  for (const s of students) {
    if (s.academicId) byId.set(normalizeKey(String(s.academicId)), s);
    byId.set(normalizeKey(String(s.id)), s);
  }
  const records = [];
  const unmatched = [];
  const importedAt = new Date().toISOString();
  for (const [id, entry] of parsed) {
    const student = byId.get(id);
    if (!student) { unmatched.push({ studentId: id, studentName: entry.studentName }); continue; }
    const studentId = String(student.academicId || student.id);
    records.push({
      id: checkpointRecordId(term, checkpoint, studentId),
      studentId,
      studentName: student.name || entry.studentName,
      level: student.level || "",
      section: student.section || "",
      checkpoint: Number(checkpoint),
      term,
      subjects: entry.subjects,
      averagePct: averageOf(entry.subjects),
      sourceFile,
      importedAt,
    });
  }
  return { records, unmatched };
}

// استبدال وقفة كاملة لنفس الفصل: سجلات الوقفة القديمة لطلاب غير موجودين
// بالملف الجديد تُحذف حتى لا تبقى أرقام قديمة.
export async function commitCheckpointRecords(records, { checkpoint, term = DEFAULT_TERM }) {
  const existing = (await listAll(COLLECTION)).filter((r) => r.term === term && Number(r.checkpoint) === Number(checkpoint));
  const keep = new Set(records.map((r) => r.id));
  const stale = existing.filter((r) => !keep.has(r.id)).map((r) => r.id);
  await bulkPut(COLLECTION, records);
  if (stale.length) await removeMany(COLLECTION, stale);
  return { saved: records.length, removed: stale.length };
}

export async function listCheckpoints() {
  return listAll(COLLECTION);
}

export async function getStudentCheckpoints(student) {
  const ids = [...new Set([student.academicId, student.id].filter(Boolean).map(String))];
  const groups = await Promise.all(ids.map((id) => listWhere(COLLECTION, "studentId", id)));
  const seen = new Set();
  return groups.flat().filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
}

export function trendOf(delta) {
  if (delta == null) return null;
  if (delta >= STEADY_BAND) return "up";
  if (delta <= -STEADY_BAND) return "down";
  return "steady";
}
export const TREND_LABELS = { up: "تحسّن", down: "تراجع", steady: "ثابت" };

// مقارنة الوقفتين لفصل واحد: صف لكل مقرر ظهر بأي منهما.
export function compareCheckpoints(records, term) {
  const forTerm = records.filter((r) => !term || r.term === term);
  const first = forTerm.find((r) => Number(r.checkpoint) === 1) || null;
  const second = forTerm.find((r) => Number(r.checkpoint) === 2) || null;
  const keyOf = (s) => normalizeKey(s.code || s.name);
  const rows = new Map();
  for (const [slot, rec] of [["first", first], ["second", second]]) {
    for (const s of rec?.subjects || []) {
      const key = keyOf(s);
      if (!rows.has(key)) rows.set(key, { code: s.code, name: s.name, first: null, second: null });
      const row = rows.get(key);
      if (!row.name && s.name) row.name = s.name;
      row[slot] = s;
    }
  }
  const subjects = [...rows.values()].map((row) => {
    const a = row.first?.pct, b = row.second?.pct;
    const delta = a != null && b != null ? round2(b - a) : null;
    return { ...row, delta, trend: trendOf(delta) };
  });
  const firstAvg = first?.averagePct ?? null;
  const secondAvg = second?.averagePct ?? null;
  const delta = firstAvg != null && secondAvg != null ? round2(secondAvg - firstAvg) : null;
  return {
    term: term || first?.term || second?.term || DEFAULT_TERM,
    first, second, subjects,
    firstAvg, secondAvg, delta, trend: trendOf(delta),
    weakFirst: subjects.filter((s) => s.first?.pct != null && s.first.pct < 50).length,
    weakSecond: subjects.filter((s) => s.second?.pct != null && s.second.pct < 50).length,
  };
}

export function termsOf(records) {
  return [...new Set(records.map((r) => r.term))].sort();
}

// ── مراجعة الأصفار ─────────────────────────────────────────────────────────
// الصفر في ملفات الوقفة كثيرًا ما يعني «لم يُرصد بعد»، لذا يُعرض للقسم ليؤكده
// (zeroConfirmed) أو يصحح الدرجة أو يسجله غيابًا.
export const departmentOf = (subject) => {
  const name = String(subject?.name || subject?.code || "");
  return name.startsWith("المواد التجارية") ? "المواد التجارية" : name;
};
const isOpenZero = (s) => s && s.score === 0 && !s.zeroConfirmed && !s.status;
export const subjectKey = (s) => normalizeKey(s?.code || s?.name || "");

// مقررات الشعبة اللي ما رُصد فيها شي للطالب (غاب عن الوقفة فيها): مقرر الشعبة
// = مرصود لنصف طلاب الشعبة فأكثر في نفس الفصل والوقفة.
export function missingSectionCourses(allRecords, record) {
  if (!record?.section) return [];
  const peers = allRecords.filter((r) => r.section === record.section && r.term === record.term && Number(r.checkpoint) === Number(record.checkpoint));
  // نفس المقرر برمز آخر (انج 801 / انج 811، المواد التجارية بأنواعها) لا يُعدّ غيابًا.
  const baseName = (s) => normalizeKey(String(s?.name || "").replace(/\(.*?\)/g, "")).trim();
  const own = new Set((record.subjects || []).map(subjectKey));
  const ownNames = new Set((record.subjects || []).map(baseName).filter(Boolean));
  const counts = new Map();
  for (const peer of peers) for (const s of peer.subjects || []) {
    const key = subjectKey(s);
    if (!key || own.has(key) || ownNames.has(baseName(s))) continue;
    const entry = counts.get(key) || { code: s.code || "", name: s.name || s.code, maxScore: null, n: 0 };
    entry.n += 1;
    if (s.maxScore) entry.maxScore = s.maxScore;
    counts.set(key, entry);
  }
  return [...counts.values()].filter((c) => c.n * 2 >= peers.length).map(({ code, name, maxScore }) => ({ code, name, maxScore }));
}

export function listZeroEntries(records, { term = null, checkpoint = null, includeConfirmed = false } = {}) {
  const out = [];
  for (const r of records) {
    if (term && r.term !== term) continue;
    if (checkpoint && Number(r.checkpoint) !== Number(checkpoint)) continue;
    for (const s of r.subjects || []) {
      if (!(isOpenZero(s) || (includeConfirmed && s.score === 0 && s.zeroConfirmed))) continue;
      out.push({ recordId: r.id, studentId: r.studentId, studentName: r.studentName, level: r.level, section: r.section, checkpoint: Number(r.checkpoint), department: departmentOf(s), subject: s, key: subjectKey(s), confirmed: !!s.zeroConfirmed });
    }
  }
  const order = { "الأول": 1, "الثاني": 2, "الثالث": 3 };
  return out.sort((a, b) => a.department.localeCompare(b.department, "ar") || (order[a.level] || 9) - (order[b.level] || 9)
    || String(a.section).localeCompare(String(b.section), "ar") || String(a.studentName).localeCompare(String(b.studentName), "ar"));
}

// قائمة «الغياب وعدم الرصد»: كل مقرر مسجَّل غيابًا، وكل مقرر من مقررات الشعبة
// ما رُصد فيه شي للطالب (kind: "missing"). منها تُدخَل الدرجة إذا اختبر الطالب.
export function listAbsentEntries(records, { term = null, checkpoint = null } = {}) {
  const out = [];
  const scope = records.filter((r) => (!term || r.term === term) && (!checkpoint || Number(r.checkpoint) === Number(checkpoint)));
  for (const r of scope) {
    const base = { recordId: r.id, studentId: r.studentId, studentName: r.studentName, level: r.level, section: r.section, checkpoint: Number(r.checkpoint) };
    for (const s of r.subjects || []) {
      if (s.status !== "absent" && !(s.score === 0 && s.zeroConfirmed)) continue;
      out.push({ ...base, kind: "absent", department: departmentOf(s), subject: s, key: subjectKey(s) });
    }
    for (const m of missingSectionCourses(scope, r)) out.push({ ...base, kind: "missing", department: departmentOf(m), subject: { ...m, status: "absent" }, key: subjectKey(m) });
  }
  const order = { "الأول": 1, "الثاني": 2, "الثالث": 3 };
  return out.sort((a, b) => a.department.localeCompare(b.department, "ar") || (order[a.level] || 9) - (order[b.level] || 9)
    || String(a.section).localeCompare(String(b.section), "ar") || String(a.studentName).localeCompare(String(b.studentName), "ar"));
}

// يرصد درجة لطالب كان غائبًا (أو مقرر لم يُرصد له): يحدّث المقرر أو يضيفه.
export function setAbsentScore(record, entry, rawScore, { by = "", at = new Date().toISOString() } = {}) {
  const score = num(rawScore);
  const max = entry.subject.maxScore;
  if (score == null || score < 0 || (max && score > max)) throw new Error(`الدرجة غير صحيحة${max ? ` (من 0 إلى ${max})` : ""}.`);
  const pct = max ? round2((score / max) * 100) : score;
  const audit = { absentResolvedAt: at, absentResolvedBy: by };
  let subjects = record.subjects || [];
  const idx = subjects.findIndex((s) => subjectKey(s) === entry.key);
  if (idx >= 0) {
    subjects = subjects.map((s, i) => (i === idx ? { ...s, score, maxScore: max ?? s.maxScore, pct, status: null, wasAbsent: true, ...audit } : s));
  } else {
    if (entry.kind !== "missing") throw new Error("لم أجد هذا المقرر في السجل (ربما عُدّل).");
    subjects = [...subjects, { code: entry.subject.code || "", name: entry.subject.name, score, maxScore: max, pct, status: null, wasAbsent: true, ...audit }];
  }
  return { ...record, subjects, averagePct: averageOf(subjects) };
}

// action: { type: "score", score } | { type: "confirm" } | { type: "absent" }
export function resolveZero(record, key, action, { by = "", at = new Date().toISOString() } = {}) {
  let found = false;
  const subjects = (record.subjects || []).map((s) => {
    if (found || subjectKey(s) !== key || s.score !== 0) return s;
    found = true;
    const audit = { zeroReviewedAt: at, zeroReviewedBy: by };
    if (action.type === "confirm") return { ...s, zeroConfirmed: true, ...audit };
    if (action.type === "absent") return { ...s, score: null, pct: null, status: "absent", ...audit };
    const score = num(action.score);
    if (score == null || score < 0 || (s.maxScore && score > s.maxScore)) throw new Error(`الدرجة غير صحيحة${s.maxScore ? ` (من 0 إلى ${s.maxScore})` : ""}.`);
    if (score === 0) return { ...s, zeroConfirmed: true, ...audit };
    return { ...s, score, pct: s.maxScore ? round2((score / s.maxScore) * 100) : score, zeroCorrectedFrom: 0, ...audit };
  });
  if (!found) throw new Error("لم أجد هذه الدرجة الصفرية في السجل (ربما عُدّلت).");
  return { ...record, subjects, averagePct: averageOf(subjects) };
}
