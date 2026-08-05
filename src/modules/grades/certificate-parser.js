import { isEncodedAbsenceScore } from "./score-conventions.js";
import { normalizeKey } from "../../services/text-normalize.js";

const TATWEEL = /ـ/g;
const SUBJECT_CODE_RE = /^[\u0600-\u06ff]{2,4}\d{3}$/;

// Normalizes away invisible bidi marks and Arabic-Indic digits before
// anything else runs — a code like "دين807" with a trailing RLM mark or
// Arabic-Indic digits looks identical on screen but fails SUBJECT_CODE_RE
// and, further downstream, the code→subject table's exact-match lookup.
function clean(cells) {
  return cells.map((c) => normalizeKey(c.replace(TATWEEL, "")));
}

// Known non-numeric values the "الدرجة" (score) column can hold, beyond a
// plain number — every other non-numeric value found there is still kept
// (as scoreStatus, raw) rather than discarded, so an unanticipated status
// word surfaces for review instead of silently becoming a NaN score.
const SCORE_STATUS_LABELS = {
  "غائب": "absent",
  "محروم": "barred",
};

// The text layer occasionally leaves a stray trailing "." with no digits
// after it (e.g. "5." instead of "5") — strip it before validating/parsing.
function stripStrayTrailingDot(s) {
  return /^\d+\.$/.test(s) ? s.slice(0, -1) : s;
}

function isScoreLike(s) {
  return /^\d+(\.\d+)?$/.test(s) || Object.prototype.hasOwnProperty.call(SCORE_STATUS_LABELS, s);
}

function parseSubjectRow(cells) {
  const code = cells[0];
  const rest = cells.slice(1);
  let notes = null;
  if (rest.length && !isScoreLike(stripStrayTrailingDot(rest[rest.length - 1]))) {
    notes = rest.pop();
  }
  const scoreRaw = stripStrayTrailingDot(rest.pop());
  const hoursRaw = rest.pop();
  const name = rest.join(" ").trim();
  const isNumericScore = /^\d+(\.\d+)?$/.test(scoreRaw ?? "");
  const isEncodedAbsence = isNumericScore && isEncodedAbsenceScore(scoreRaw);
  return {
    code,
    name,
    hours: hoursRaw != null ? Number(hoursRaw) : null,
    score: isNumericScore && !isEncodedAbsence ? Number(scoreRaw) : null,
    scoreStatus: isEncodedAbsence ? "absent" : (isNumericScore ? null : (SCORE_STATUS_LABELS[scoreRaw] || scoreRaw || null)),
    notes,
  };
}

// Parses one certificate's already-row-grouped text (from pdf-parser.js) into
// student header fields plus a list of terms, each with its subject rows.
// Built against the Bahrain MOE "سجل الطالب الدراسي" transcript template —
// a different source system would need its own parser (per ARCHITECTURE.md's
// "قالب تقرير مسجل مسبقًا" design).
export function parseCertificateRows(rawRows) {
  const rows = rawRows.map(clean);
  const wholeText = rows.map((r) => r.join(" ")).join("\n");

  const nameMatch = wholeText.match(/اسم الطالب\s*:?\s*(.+?)\s*رقم الطالب/);
  const idMatch = wholeText.match(/\(\s*(\d{4})\s+(\d+)\s*\)/);
  const civilMatch = wholeText.match(/الرقم الشخصي\s*:?\s*(\d+)/);

  let track = null;
  for (const row of rows) {
    const m = row.join(" ").match(/المسار\s*:?\s*(.+)$/);
    if (m) {
      track = m[1].trim();
      break;
    }
  }

  const terms = [];
  let current = null;
  for (const row of rows) {
    const line = row.join(" ");
    if (SUBJECT_CODE_RE.test(row[0] || "")) {
      if (current) current.subjects.push(parseSubjectRow(row));
    } else if (line.includes("الفصل الدراس")) {
      current = { label: line, subjects: [], average: null, rating: null };
      terms.push(current);
    } else if (line.includes("المعدل الفصلي") && current) {
      const m = line.match(/([\d.]+)%.*?التقدير\s*:?\s*(\S+)/);
      if (m) {
        current.average = Number(m[1]);
        current.rating = m[2];
      }
    }
  }

  return {
    studentName: nameMatch ? nameMatch[1].trim() : null,
    academicId: idMatch ? `${idMatch[1]}${idMatch[2]}` : null,
    civilId: civilMatch ? civilMatch[1] : null,
    track,
    terms,
  };
}
