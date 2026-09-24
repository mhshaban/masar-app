import { listWhere } from "../../services/cloud-runtime.js";

import { certificateTermOrder } from "./curriculum-results.js?v=2026-09-11-curriculum-import-1";

export function termSortKey(term) {
  return certificateTermOrder(term).slice(0, 3).map(n => String(n).padStart(4, "0")).join("-");
}

export function officialAverage(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100 ? Number(value) : null;
}

export async function getStudentAcademicSummary(student) {
  const ids = [...new Set([student.academicId, student.id].filter(Boolean).map(String))];
  const groups = await Promise.all(ids.map(id => listWhere("academicFlags", "studentId", id)));
  const records = groups.flat().sort((a,b) => String(b.computedAt || "").localeCompare(String(a.computedAt || "")));
  return { subjects: records[0]?.subjects || [], finalCumulativeAverage: officialAverage(records.find(r => officialAverage(r.finalCumulativeAverage) != null)?.finalCumulativeAverage) ?? officialAverage(student.finalCumulativeAverage) };
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

export async function getStudentSubjectSummary(student) {
  const ids = [...new Set([student.academicId, student.id].filter(Boolean).map(String))];
  const groups = await Promise.all(ids.map((id) => listWhere("academicFlags", "studentId", id)));
  const records = groups.flat().sort((a, b) => String(b.computedAt || "").localeCompare(String(a.computedAt || "")));
  return records[0]?.subjects || [];
}
