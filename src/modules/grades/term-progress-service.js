import { listWhere } from "../../services/cloud-runtime.js";

// Term labels are free text (extracted verbatim from the certificate's own
// line by Cowork's analysis, mirroring how the counselor read them before),
// so there's no reliable field to sort on directly. This scans for a
// 4-digit year and an "الأول/الثاني/الثالث" ordinal anywhere in the
// string — it doesn't assume word order, only that both appear somewhere.
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
  const officialTerms = await listWhere("termAverages", "studentId", studentId);
  return officialTerms
    .map((t) => ({ term: t.term, sortKey: termSortKey(t.term), averagePct: t.averagePct, rating: t.rating }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}
