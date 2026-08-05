import { list as listAll } from "../../services/cloud-runtime.js";
import { gradeRowPct } from "./score-conventions.js";
import { subjectKeyForGrade } from "./subject-groups.js";

// Term labels are free text (typed by the counselor for Excel imports, or
// extracted verbatim from the certificate's own line for PDF imports), so
// there's no reliable field to sort on directly. This scans for a 4-digit
// year and an "الأول/الثاني/الثالث" ordinal anywhere in the string — it
// doesn't assume word order, only that both appear somewhere in the label.
function extractYear(term) {
  const text = String(term || "");
  const ranged = text.match(/(\d{4})\s*\/\s*\d{2,4}/);
  if (ranged) return ranged[1];
  const bare = text.match(/\b(\d{4})\b/);
  return bare ? bare[1] : null;
}

function extractTermNumber(term) {
  // This school's real certificates spell "الثاني" as "الثانى" (alef maksura
  // instead of yeh) — normalize that before matching, or the second term
  // silently sorts as "unrecognized" (0) and lands before the first.
  const text = String(term || "").replace(/ى/g, "ي");
  if (/الثالث/.test(text)) return 3;
  if (/الثاني/.test(text)) return 2;
  if (/الأول/.test(text)) return 1;
  return 0;
}

export function termSortKey(term) {
  const year = extractYear(term) || "0000";
  return `${year}-${extractTermNumber(term)}`;
}

// One point per term for the line chart — the certificate's own stated
// average only (hours-weighted, official). Deliberately does NOT fall back
// to averaging checkpoint-grade (الوقفة التقويمية) rows when no certificate
// covers a term: a checkpoint is a partial, mid-term snapshot, not the term
// result, and plotting it on the same line as official term averages would
// misrepresent the student's actual per-term trend.
export async function getStudentTermTimeline(studentId) {
  const officialTerms = await listAll("termAverages");
  return officialTerms
    .filter((t) => t.studentId === studentId)
    .map((t) => ({ term: t.term, sortKey: termSortKey(t.term), averagePct: t.averagePct, rating: t.rating }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

// Grouped via subjectKeyForGrade — the school's official "المقررات" table
// maps every code variant a subject uses across its six terms to one
// canonical name (e.g. كيم801/كيم802/فيز803.../فيز806 all resolve to
// "العلوم"), so subjects that visibly split across levels under a plain
// code or name comparison land in one row here instead.
export async function getStudentSubjectTimeline(studentId) {
  const grades = await listAll("grades");
  const bySubject = new Map();
  for (const g of grades) {
    if (g.studentId !== studentId) continue;
    const key = subjectKeyForGrade(g);
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(g);
  }

  const subjects = [...bySubject.entries()].map(([subject, rows]) => {
    const points = rows
      .map((g) => ({
        term: g.term,
        sortKey: termSortKey(g.term),
        score: g.score,
        scoreStatus: g.scoreStatus,
        pct: g.score != null ? Math.round(gradeRowPct(g) * 100) : null,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return { subject, points };
  });

  return subjects.sort((a, b) => a.subject.localeCompare(b.subject, "ar"));
}

// Chronologically-ordered distinct term labels across this student's grade
// rows — used as the pivot table's columns.
export async function getStudentTermColumns(studentId) {
  const subjects = await getStudentSubjectTimeline(studentId);
  const sortKeyByTerm = new Map();
  for (const s of subjects) {
    for (const p of s.points) {
      if (!sortKeyByTerm.has(p.term)) sortKeyByTerm.set(p.term, p.sortKey);
    }
  }
  return [...sortKeyByTerm.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([term]) => term);
}
