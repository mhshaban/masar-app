// منقول حرفيًا من src/modules/grades/certificate-parser.js (قبل نقل استيراد
// الدرجات لـCowork) — مُختبَر سابقًا على كامل أرشيف الشهادات الحقيقي
// المتاح (894 من 894 ملفًا، صفر أخطاء قراءة). قالب مبني تحديدًا على شكل
// شهادات "سجل الطالب الدراسي" الرسمية لهذه المدرسة؛ أي نظام مصدر مختلف
// الشكل يحتاج مُحلِّلًا جديدًا.
import { isEncodedAbsenceScore } from "./score-conventions.mjs";
import { normalizeKey } from "../../src/services/text-normalize.js";

const TATWEEL = /ـ/g;
const SUBJECT_CODE_RE = /^[؀-ۿ]{2,4}\d{3}$/;

function clean(cells) {
  return cells.map((c) => normalizeKey(c.replace(TATWEEL, "")));
}

const SCORE_STATUS_LABELS = {
  "غائب": "absent",
  "محروم": "barred",
};

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

// Parses one certificate's already-row-grouped text (from pdf-rows.mjs) into
// student header fields plus a list of terms, each with its subject rows.
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
