import { CURRICULUM_TEMPLATES } from "./curriculum-template.js?v=2026-09-07-review-1";
import { normalizeKey } from "../../services/text-normalize.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const codeKey = value => normalizeKey(value).replace(/\s|ـ/g, "");
const cleanTerm = value => normalizeKey(value).replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");

export function certificateTermOrder(label, index = 0) {
  const text = cleanTerm(label);
  const years = text.match(/(?:19|20)\d{2}/g) || [];
  const year = years.length ? Math.min(...years.map(Number)) : 0;
  const ordinal = text.match(/الفصل\s+(?:الدراسي\s+)?(الاول|الثاني|الثالث|الصيفي)/)?.[1];
  const semester = { الاول: 1, الثاني: 2, الثالث: 3, الصيفي: 3 }[ordinal] || 0;
  const level = text.match(/المستوي\s+(الاول|الثاني|الثالث)/)?.[1];
  return [year, ({ الاول: 1, الثاني: 2, الثالث: 3 }[level] || 0), semester, index];
}

export function latestCourseResults(certificates) {
  const byCode = new Map();
  for (const certificate of certificates) {
    certificate.terms.forEach((term, index) => {
      for (const subject of term.subjects) {
        if (subject.score == null && !subject.scoreStatus) continue;
        const code = codeKey(subject.code);
        if (!code) continue;
        if (!byCode.has(code)) byCode.set(code, new Map());
        const attempts = byCode.get(code);
        // The same term repeated in multiple PDF copies is one attempt.
        const key = `${cleanTerm(term.label)}::${normalizeKey(subject.notes)}`;
        const attempt = { ...subject, term: term.label, order: certificateTermOrder(term.label, index), modified: Number(certificate.lastModified || 0), source: certificate.sourceName || "" };
        const previous = attempts.get(key);
        if (!previous || attempt.modified >= previous.modified) attempts.set(key, attempt);
      }
    });
  }
  return new Map([...byCode].map(([code, attempts]) => {
    const rows = [...attempts.values()].sort((a, b) => {
      for (let i = 0; i < a.order.length; i++) if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i];
      const retake = value => /دور\s*(?:ثان|ثاني)|إعاد|اعاد/.test(value.notes || "") ? 1 : 0;
      return retake(a) - retake(b) || a.modified - b.modified;
    });
    return [code, { ...rows.at(-1), repeated: rows.length > 1, attempts: rows }];
  }));
}

export function curriculumTrack(student, certificates = []) {
  const text = `${student.track || ""} ${certificates.map(c => c.track || "").join(" ")}`;
  return /تجاري|تجار/.test(text) ? "التجاري" : /صناع/.test(text) ? "الصناعي" : "";
}

export function renderCurriculumResults(certificates, track) {
  const template = CURRICULUM_TEMPLATES[track];
  if (!template) return '<p class="hint">اختر المسار لعرض المقررات.</p>';
  const latest = latestCourseResults(certificates);
  const shown = new Set(template.flatMap(row => row.codes).map(codeKey).filter(Boolean));
  const grade = result => {
    if (!result) return "";
    const value = result.scoreStatus ? ({absent:"غائب",barred:"محروم"}[result.scoreStatus] || result.scoreStatus) : result.score;
    const history = result.attempts.map(a => `${a.term}: ${a.scoreStatus ? ({absent:"غائب",barred:"محروم"}[a.scoreStatus] || a.scoreStatus) : a.score}`).join("؛ ");
    return `<span class="curriculum-grade${result.repeated ? " curriculum-retaken" : ""}" title="${esc(history)}">${esc(value)}${result.repeated ? '<small>معاد</small>' : ""}</span>`;
  };
  const other = [...latest].filter(([code]) => !shown.has(code));
  return `<p class="hint">الخانة الفارغة تعني عدم وجود درجة. <span class="curriculum-retaken">اللون البنفسجي وعلامة «معاد»</span> يميزان آخر نتيجة للمقرر المعاد.</p><div class="tablewrap"><table class="curriculum-table"><caption>سجل المقررات — المسار ${esc(track)}</caption><thead><tr><th>القسم</th><th>نوع المقرر</th>${[1,2,3,4,5,6].map(n=>`<th>الفصل ${n}</th>`).join("")}</tr></thead><tbody>${template.map(row=>`<tr class="curriculum-codes"><th rowspan="2">${esc(row.department)}</th><td rowspan="2">${esc(row.type)}</td>${row.codes.map(code=>`<td>${esc(code)}</td>`).join("")}</tr><tr class="curriculum-scores">${row.codes.map(code=>`<td>${grade(latest.get(codeKey(code)))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${other.length ? `<details style="margin-top:16px;"><summary>مقررات في الشهادة غير مدرجة بالقالب (${other.length})</summary><div class="tablewrap"><table><thead><tr><th>المقرر</th><th>المادة</th><th>آخر نتيجة</th></tr></thead><tbody>${other.map(([code,result])=>`<tr><td>${esc(code)}</td><td>${esc(result.name)}</td><td>${grade(result)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}`;
}
