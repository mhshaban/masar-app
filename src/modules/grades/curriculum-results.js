import { loadCurriculumTemplates } from "../../services/curriculum-template-service.js?v=2026-09-11-curriculum-import-1";
import { normalizeKey } from "../../services/text-normalize.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const codeKey = value => normalizeKey(value).replace(/\s|ـ/g, "");
const cleanTerm = value => normalizeKey(value).replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
// خلية قالب قد تحمل أكثر من رمز مفصولة بـ"/" (مثل "رسم803/رسم813") لمّا
// يختلف رمز المقرر الفعلي بحسب فوج الطلبة رغم تمثيله نفس البند بالقالب —
// أي رمز منها يُطابق يكفي.
export const splitCodes = value => String(value ?? "").split("/").map(c => c.trim()).filter(Boolean);

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
  const own = `${student.track || ""} ${student.department || ""}`;
  const section = normalizeKey(student.section || "");
  const sectionTrack = /تجر/.test(section) ? "التجاري" : /^[1-6]\s*[^\d\s]+/.test(section) ? "الصناعي" : "";
  const text = /تجار|صناع/.test(own) ? own : sectionTrack || certificates.map(c => c.track || "").join(" ");
  return /تجاري|تجار/.test(text) ? "التجاري" : /صناع/.test(text) ? "الصناعي" : "";
}

export async function renderCurriculumResults(certificates, track) {
  const templates = await loadCurriculumTemplates();
  const template = templates[track];
  if (!template) return '<p class="hint">لم يُحدد المسار في بيانات الطالب أو الشهادة.</p>';
  const latest = latestCourseResults(certificates);
  const shown = new Set(template.flatMap(row => row.codes).flatMap(splitCodes).map(codeKey).filter(Boolean));
  const grade = result => {
    if (!result) return "";
    const value = result.scoreStatus ? ({absent:"غائب",barred:"محروم"}[result.scoreStatus] || result.scoreStatus) : result.score;
    const failed = !result.scoreStatus && result.score != null && Number.isFinite(Number(result.score)) && Number(result.score) < 50;
    const history = result.attempts.map(a => `${a.term}: ${a.scoreStatus ? ({absent:"غائب",barred:"محروم"}[a.scoreStatus] || a.scoreStatus) : a.score}`).join("؛ ");
    return `<span class="curriculum-grade${result.repeated ? " curriculum-retaken" : ""}${failed ? " curriculum-failed" : ""}" aria-label="${esc(`${value}${failed ? "، راسب" : ""}${result.repeated ? "، معاد" : ""}`)}" title="${esc(history)}">${esc(value)}${result.repeated ? '<small>معاد</small>' : ""}</span>`;
  };
  // خلية بها أكثر من رمز مفصولة بـ"/" — أول رمز فيه نتيجة فعلية هو المعروض.
  const gradeForCell = code => grade(splitCodes(code).map(part => latest.get(codeKey(part))).find(Boolean));
  const other = [...latest].filter(([code]) => !shown.has(code));
  return `<p class="hint">الخانة الفارغة تعني عدم وجود درجة. <span class="curriculum-retaken">اللون البنفسجي وعلامة «معاد»</span> يميزان آخر نتيجة للمقرر المعاد. <span class="curriculum-failed">الأحمر للدرجة الأقل من 50</span>، وتبقى علامة «معاد» عند الرسوب بعد الإعادة.</p><div class="tablewrap"><table class="curriculum-table"><caption>سجل المقررات — المسار ${esc(track)}</caption><thead><tr><th>القسم</th><th>نوع المقرر</th>${[1,2,3,4,5,6].map(n=>`<th>الفصل ${n}</th>`).join("")}</tr></thead><tbody>${template.map(row=>`<tr class="curriculum-codes"><th rowspan="2">${esc(row.department)}</th><td rowspan="2">${esc(row.type)}</td>${row.codes.map(code=>`<td>${esc(code)}</td>`).join("")}</tr><tr class="curriculum-scores">${row.codes.map(code=>`<td>${gradeForCell(code)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${other.length ? `<details style="margin-top:16px;"><summary>مقررات في الشهادة غير مدرجة بالقالب (${other.length})</summary><div class="tablewrap"><table><thead><tr><th>المقرر</th><th>المادة</th><th>آخر نتيجة</th></tr></thead><tbody>${other.map(([code,result])=>`<tr><td>${esc(code)}</td><td>${esc(result.name)}</td><td>${grade(result)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}`;
}
