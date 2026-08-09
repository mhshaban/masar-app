import { SUBJECT_GROUPS } from "../../services/subject-groups-seed.js";
import { normalizeKey } from "../../services/text-normalize.js";

// Flattened once: every code variant across all six terms maps to its one
// canonical subject name (e.g. كيم801/كيم802/فيز803/فيز804/فيز805/فيز806 all
// resolve to "العلوم") — confirmed no code appears under two different
// subjects in the source table. Keys are normalized the same way lookups
// are (see subjectKeyForGrade below) so a code that visually matches the
// table but carries a stray bidi mark or Arabic-Indic digit still resolves.
const CODE_TO_SUBJECT = new Map();
for (const group of SUBJECT_GROUPS) {
  for (const code of group.codes) {
    if (code) CODE_TO_SUBJECT.set(normalizeKey(code), group.subject);
  }
}

// Subject → السجل الرسمي's category (تخصصية/ثقافة عامة/مساندة), for screens
// that group or order subjects by category rather than alphabetically.
const SUBJECT_TO_TYPE = new Map(SUBJECT_GROUPS.map((g) => [g.subject, g.type]));

// ترتيب العرض اللي طلبه المرشد: المواد العامة أول القائمة، والتخصصية
// والمساندة معًا بآخرها (بدل ترتيب أبجدي بحت يخلط الكل). مادة مو موجودة
// بالجدول الرسمي إطلاقًا (نادر — راجع subjectKeyForGrade) تُعامل كعامة
// افتراضيًا، أأمن من دفعها لآخر القائمة بالغلط.
export function subjectSortRank(subjectName) {
  const type = SUBJECT_TO_TYPE.get(subjectName);
  return type === "تخصصية" || type === "مساندة" ? 1 : 0;
}

// A real student's grade record can carry a code the six-term table doesn't
// list at all (e.g. "دين812", "رسم816", "ريض352" — retake/extra terms,
// older cohorts, etc.), confirmed against real data. The counselor's own
// instruction: rely on the code's letter prefix ("ريض هو الرياضيات", "رسم
// .. هو الرسم التخصصي والتقني", "دراسات في العقيدة، دين، كلهم قسم واحد") —
// every code for one subject shares the same leading Arabic-letter prefix,
// so an unlisted code still resolves through its prefix. Built once from
// SUBJECT_GROUPS and only kept where a prefix is unambiguous: "انج" alone
// covers three genuinely different English subjects (القراءة الشاملة /
// المهارات الاكاديمية / العامة) that differ only by their numeric suffix,
// so that prefix is deliberately excluded rather than guessed.
const CODE_PREFIX_RE = /^[\u0600-\u06ff]+/;
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
// code family with the official table at all, so a code-prefix match can't
// catch them — plural/singular spelling ("تقنية" vs "تقنيات"), a subject
// referred to by its topic instead of its department name ("الطاقة" is
// taught under العلوم), a level-3 course renamed on paper ("أساسيات
// التفاضل والتكامل" is still الرياضيات), and one drawing/creed subject each
// printed under two different names on real certificates.
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
// terms — the foundational (تأسيسي) year before students pick a
// specialization isn't in it at all, and its certificates print a trailing
// level number for what is still one subject across terms (e.g. "التربية
// الإسلامية 4", plain "التربية الإسلامية", "التربية الإسلامية 9" — the same
// pattern the specialized-track table already collapses via its codes).
// Confirmed against a real duplication report: stripping a trailing
// " <digits>" merges them the same way.
function stripTrailingLevelNumber(name) {
  return normalizeKey(name).replace(/\s+\d+\s*$/, "").trim();
}

// The one place a grade row's subject identity is decided, so the academic
// path, the weak-subjects list, and the per-subject classification can never
// disagree on what "المادة" means for the same row. Prefers an exact code
// match, then the code's subject prefix, then a known name alias, then the
// certificate's own printed subject name (with a trailing level number
// stripped), then the raw code — never silently drops a row for lacking a
// match.
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
