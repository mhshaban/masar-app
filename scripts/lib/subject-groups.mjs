// منقول حرفيًا من src/modules/grades/subject-groups.js (قبل نقل استيراد
// الدرجات لـCowork) — يعيد استخدام جدول "المقررات" الرسمي المرجعي الباقي
// بالمستودع (src/services/subject-groups-seed.js) ونفس normalizeKey
// المشترك بالتطبيق (src/services/text-normalize.js)، فلا يوجد نسخ ولا
// اختلاف عن المنطق المُختبَر سابقًا داخل التطبيق نفسه.
import { SUBJECT_GROUPS } from "../../src/services/subject-groups-seed.js";
import { normalizeKey } from "../../src/services/text-normalize.js";

const CODE_TO_SUBJECT = new Map();
for (const group of SUBJECT_GROUPS) {
  for (const code of group.codes) {
    if (code) CODE_TO_SUBJECT.set(normalizeKey(code), group.subject);
  }
}

const SUBJECT_TO_TYPE = new Map(SUBJECT_GROUPS.map((g) => [g.subject, g.type]));

export function subjectSortRank(subjectName) {
  const type = SUBJECT_TO_TYPE.get(subjectName);
  return type === "تخصصية" || type === "مساندة" ? 1 : 0;
}

// A real student's grade record can carry a code the six-term table doesn't
// list at all (e.g. "دين812", "رسم816", "ريض352" — retake/extra terms,
// older cohorts, etc.), confirmed against real data. The counselor's own
// instruction: rely on the code's letter prefix — every code for one
// subject shares the same leading Arabic-letter prefix, so an unlisted
// code still resolves through its prefix. "انج" alone covers three
// genuinely different English subjects that differ only by their numeric
// suffix, so that prefix is deliberately excluded rather than guessed.
const CODE_PREFIX_RE = /^[؀-ۿ]+/;
const CODE_PREFIX_TO_SUBJECT = (() => {
  const bySubjects = new Map();
  for (const group of SUBJECT_GROUPS) {
    for (const code of group.codes) {
      if (!code) continue;
      const m = normalizeKey(code).match(CODE_PREFIX_RE);
      if (!m) continue;
      const prefix = m[0];
      if (!bySubjects.has(prefix)) bySubjects.set(prefix, new Set());
      bySubjects.get(prefix).add(group.subject);
    }
  }
  const map = new Map();
  for (const [prefix, subjects] of bySubjects) {
    if (subjects.size === 1) map.set(prefix, [...subjects][0]);
  }
  return map;
})();

// Institutional naming variants confirmed by the counselor that share no
// code family with the official table at all.
const NAME_ALIASES = new Map([
  ["الطاقة", "العلوم"],
  ["دراسات في العقيدة الإسلامية", "التربية الإسلامية"],
  ["دراسات في العقيدة", "التربية الإسلامية"],
  ["التربية إسلامية", "التربية الإسلامية"],
  ["الرسم التخصصي", "الرسم التقني"],
  ["تقنية وصيانة الحاسوب", "تقنيات وصيانة الحاسوب"],
  ["صيانة الحاسوب", "تقنيات وصيانة الحاسوب"],
  ["أساسيات التفاضل والتكامل", "الرياضيات"],
].map(([name, subject]) => [normalizeKey(name), subject]));

// The school's own "المقررات" table only covers the specialized track's six
// terms — the foundational (تأسيسي) year isn't in it at all, and its
// certificates print a trailing level number for what is still one subject
// across terms (e.g. "التربية الإسلامية 4" ثم بلا رقم ثم "التربية الإسلامية 9").
function stripTrailingLevelNumber(name) {
  return normalizeKey(name).replace(/\s+\d+\s*$/, "").trim();
}

// The one place a grade row's subject identity is decided. Prefers an
// exact code match, then the code's subject prefix, then a known name
// alias, then the certificate's own printed subject name (with a trailing
// level number stripped), then the raw code — never silently drops a row.
export function subjectKeyForGrade(g) {
  const code = g.subjectCode ? normalizeKey(g.subjectCode) : null;
  const byCode = code ? CODE_TO_SUBJECT.get(code) : null;
  if (byCode) return byCode;

  const prefixMatch = code ? code.match(CODE_PREFIX_RE) : null;
  const byPrefix = prefixMatch ? CODE_PREFIX_TO_SUBJECT.get(prefixMatch[0]) : null;
  if (byPrefix) return byPrefix;

  const name = g.subjectName ? normalizeKey(g.subjectName) : null;
  const byAlias = name ? NAME_ALIASES.get(name) : null;
  if (byAlias) return byAlias;

  if (name) return stripTrailingLevelNumber(name) || name;

  return g.subjectCode || "غير محدد";
}
