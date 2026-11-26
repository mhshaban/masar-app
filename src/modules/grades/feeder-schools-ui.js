import { listStudents } from "../students/students-service.js?v=2026-08-31-record-edit-1";
import { listCheckpoints, CHECKPOINT_LABELS } from "./checkpoint-service.js?v=2026-11-21-course-codes-1";
import { RATING_LABELS } from "./achievement-service.js?v=2026-11-03-exact-tiers-1";
import { formatPct } from "../shared/format-pct.js?v=2026-10-01-avg-decimals-1";
import { printMarkupInPopup } from "../forms/print-popup.js?v=2026-10-12-event-approval-1";
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { buildFeederSchoolAnalysis, PREP_SUBJECTS, shortSchoolName } from "./feeder-schools-service.js?v=2026-11-26-feeder-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v == null ? "—" : `${formatPct(v)}٪`);
const val = (v) => (v == null ? "—" : formatPct(v));
const subjectLabel = (key) => PREP_SUBJECTS.find((s) => s.key === key)?.label || "—";
const TRACKS = [{ key: "", label: "كل المسارات" }, { key: "الصناعي", label: "الصناعي" }, { key: "التجاري", label: "التجاري" }];

// تلوين خلية بالمقارنة مع متوسط السنة الأولى كاملة: أعلى بنقطتين فأكثر أخضر،
// أقل بنقطتين فأكثر أحمر. المدارس القليلة العدد تُقرأ بحذر (ملاحظة أسفل الجدول).
function tone(value, reference) {
  if (value == null || reference == null) return "";
  if (value >= reference + 2) return ' style="background:var(--success-bg);color:var(--success);font-weight:700;"';
  if (value <= reference - 2) return ' style="background:#fdecec;color:var(--critical);font-weight:700;"';
  return "";
}

const bar = (value) => value == null ? "" : `<div style="height:6px;background:var(--border);border-radius:4px;overflow:hidden;min-width:60px;"><div style="height:100%;width:${Math.max(0, Math.min(100, value))}%;background:var(--teal-600, #1a2744);"></div></div>`;

function averageTable(a, { clickable = false } = {}) {
  const ref = a.overall.avg;
  const rows = a.schools.map((s, i) => `<tr${clickable ? ` data-school="${esc(s.school)}" style="cursor:pointer;"` : ""}>
    <td>${i + 1}</td><td style="min-width:28mm;"><strong>${esc(s.shortName)}</strong></td><td class="num">${s.count}</td><td class="num">${formatPct(s.share)}٪</td>
    <td class="num"${tone(s.avg, ref)}>${pct(s.avg)}</td><td class="print-hide">${bar(s.avg)}</td><td class="num">${val(s.max)}</td><td class="num">${val(s.min)}</td>
    ${RATING_LABELS.map((label) => `<td class="num">${s.ratings[label] || ""}</td>`).join("")}
  </tr>`).join("");
  return `<div class="tablewrap"><table>
    <thead><tr><th>م</th><th>المدرسة الرافدة</th><th>الطلبة</th><th>النسبة</th><th>متوسط المعدل</th><th class="print-hide"></th><th>أعلى</th><th>أدنى</th>${RATING_LABELS.map((l) => `<th>${esc(l)}</th>`).join("")}</tr></thead>
    <tbody>${rows}
      <tr style="font-weight:800;"><td></td><td>الإجمالي</td><td class="num">${a.overall.count}</td><td class="num">100٪</td><td class="num">${pct(a.overall.avg)}</td><td class="print-hide">${bar(a.overall.avg)}</td><td class="num">${val(a.overall.max)}</td><td class="num">${val(a.overall.min)}</td>
      ${RATING_LABELS.map((label) => `<td class="num">${a.overall.ratings[label] || ""}</td>`).join("")}</tr>
    </tbody>
  </table></div>`;
}

function subjectsTable(a, { clickable = false } = {}) {
  const rows = a.schools.map((s, i) => `<tr${clickable ? ` data-school="${esc(s.school)}" style="cursor:pointer;"` : ""}>
    <td>${i + 1}</td><td style="min-width:28mm;"><strong>${esc(s.shortName)}</strong></td><td class="num">${s.count}</td>
    ${PREP_SUBJECTS.map(({ key }) => `<td class="num"${tone(s.subjects[key], a.overall.subjects[key])}>${val(s.subjects[key])}</td>`).join("")}
    <td>${esc(subjectLabel(s.strongestSubject))}</td><td>${esc(subjectLabel(s.weakestSubject))}</td>
  </tr>`).join("");
  return `<div class="tablewrap"><table>
    <thead><tr><th>م</th><th>المدرسة الرافدة</th><th>الطلبة</th>${PREP_SUBJECTS.map((s) => `<th>${esc(s.label)}</th>`).join("")}<th>أقوى مادة</th><th>أضعف مادة</th></tr></thead>
    <tbody>${rows}
      <tr style="font-weight:800;"><td></td><td>متوسط السنة الأولى</td><td class="num">${a.overall.count}</td>
      ${PREP_SUBJECTS.map(({ key }) => `<td class="num">${val(a.overall.subjects[key])}</td>`).join("")}
      <td>${esc(subjectLabel(a.overall.strongestSubject))}</td><td>${esc(subjectLabel(a.overall.weakestSubject))}</td></tr>
    </tbody>
  </table></div>`;
}

function checkpointsTable(a) {
  if (!a.checkpoints.length) return "";
  const cps = a.checkpoints;
  const first = cps[0];
  const rows = a.schools.map((s, i) => {
    const diff = s.checkpoints[first]?.avg != null && s.avg != null ? s.checkpoints[first].avg - s.avg : null;
    return `<tr><td>${i + 1}</td><td style="min-width:28mm;"><strong>${esc(s.shortName)}</strong></td><td class="num">${pct(s.avg)}</td>
      ${cps.map((cp) => `<td class="num"${tone(s.checkpoints[cp]?.avg, a.overall.checkpoints[cp]?.avg)}>${pct(s.checkpoints[cp]?.avg)} <span class="hint">(${s.checkpoints[cp]?.count || 0})</span></td>`).join("")}
      <td class="num">${diff == null ? "—" : `${diff > 0 ? "+" : ""}${formatPct(diff)}`}</td></tr>`;
  }).join("");
  const od = a.overall.checkpoints[first]?.avg != null && a.overall.avg != null ? a.overall.checkpoints[first].avg - a.overall.avg : null;
  return `<div class="tablewrap"><table>
    <thead><tr><th>م</th><th>المدرسة الرافدة</th><th>معدل الإعدادية</th>${cps.map((cp) => `<th>${esc(CHECKPOINT_LABELS[cp] || `الوقفة ${cp}`)}</th>`).join("")}<th>الفرق عن الإعدادية</th></tr></thead>
    <tbody>${rows}
      <tr style="font-weight:800;"><td></td><td>الإجمالي</td><td class="num">${pct(a.overall.avg)}</td>${cps.map((cp) => `<td class="num">${pct(a.overall.checkpoints[cp]?.avg)} <span class="hint">(${a.overall.checkpoints[cp]?.count || 0})</span></td>`).join("")}<td class="num">${od == null ? "—" : `${od > 0 ? "+" : ""}${formatPct(od)}`}</td></tr>
    </tbody>
  </table></div>`;
}

function studentsTable(school, checkpoints) {
  const rows = school.students.map((st, i) => `<tr data-goto-student="${esc(st.id)}" style="cursor:pointer;">
    <td>${i + 1}</td><td><strong>${esc(st.name)}</strong></td><td>${esc(st.section)}</td>
    ${PREP_SUBJECTS.map(({ key }) => `<td class="num">${val(st.subjects[key])}</td>`).join("")}
    <td class="num"><strong>${pct(st.average)}</strong></td><td>${esc(st.rating)}</td>
    ${checkpoints.map((cp) => `<td class="num">${pct(st.checkpoints[cp])}</td>`).join("")}
  </tr>`).join("");
  return `<div class="tablewrap"><table>
    <thead><tr><th>م</th><th>الطالب</th><th>الشعبة</th>${PREP_SUBJECTS.map((s) => `<th>${esc(s.label)}</th>`).join("")}<th>المعدل</th><th>التقدير</th>${checkpoints.map((cp) => `<th>${esc(CHECKPOINT_LABELS[cp] || `الوقفة ${cp}`)}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

const legend = '<p class="hint" style="margin:8px 0 0;">الأخضر: أعلى من متوسط السنة الأولى بنقطتين فأكثر · الأحمر: أقل بنقطتين فأكثر · نتائج المدارس ذات العدد القليل تُقرأ بحذر.</p>';

function trackLabel(track) { return track ? `المسار ${track}` : "كل المسارات"; }

function summaryRows(a, track) {
  const top = [...a.schools].filter((s) => s.count >= 5).sort((x, y) => (y.avg ?? 0) - (x.avg ?? 0));
  return `
    <tr><th>الفئة</th><td>طلبة السنة الأولى — ${esc(trackLabel(track))}</td><th>عدد الطلبة</th><td>${a.level1Count}</td></tr>
    <tr><th>لهم نتائج إعدادية</th><td>${a.withPrepCount}</td><th>بدون نتائج إعدادية</th><td>${a.withoutPrepCount}</td></tr>
    <tr><th>عدد المدارس الرافدة</th><td>${a.schoolCount}</td><th>متوسط معدل الإعدادية</th><td>${pct(a.overall.avg)}</td></tr>
    <tr><th>الحاصلون على ممتاز</th><td>${a.overall.excellent} (${a.withPrepCount ? formatPct((a.overall.excellent / a.withPrepCount) * 100) : 0}٪)</td><th>معدل أقل من ٧٠٪</th><td>${a.overall.below70}</td></tr>
    ${top.length ? `<tr><th>أعلى مدرسة (٥ طلاب فأكثر)</th><td>${esc(top[0].shortName)} (${pct(top[0].avg)})</td><th>أدنى مدرسة (٥ طلاب فأكثر)</th><td>${esc(top[top.length - 1].shortName)} (${pct(top[top.length - 1].avg)})</td></tr>` : ""}
    <tr><th>أقوى مادة</th><td>${esc(subjectLabel(a.overall.strongestSubject))}</td><th>أضعف مادة</th><td>${esc(subjectLabel(a.overall.weakestSubject))}</td></tr>`;
}

function printHeader(title, sub) {
  return `<thead><tr><td>
    <div class="print-dept-line">قسم الإرشاد الأكاديمي والتوجيه المهني</div>
    <div class="topbar"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div></div>
  </td></tr></thead>`;
}

export function feederReportMarkup(a, track) {
  return `<table class="forms-print">
    ${printHeader("تحليل طلبة السنة الأولى حسب المدارس الرافدة", trackLabel(track))}
    <tbody><tr><td>
      <div class="card"><h2>ملخص</h2><div class="tablewrap"><table>${summaryRows(a, track)}</table></div></div>
      <div class="card print-flow"><h2>التصنيف حسب معدل الإعدادية</h2>${averageTable(a)}</div>
      <div class="card print-flow"><h2>متوسط الدرجات حسب المواد</h2>${subjectsTable(a)}</div>
      ${a.checkpoints.length ? `<div class="card print-flow"><h2>الأداء في الوقفات التقويمية حسب المدرسة الرافدة</h2>${checkpointsTable(a)}</div>` : ""}
      ${legend}
    </td></tr></tbody>
  </table>`;
}

export function schoolStudentsMarkup(school, a, track) {
  return `<table class="forms-print">
    ${printHeader(`طلبة السنة الأولى — ${shortSchoolName(school.school)}`, `${trackLabel(track)} · ${school.count} طالبًا · متوسط المعدل ${pct(school.avg)}`)}
    <tbody><tr><td>
      <div class="card print-flow"><h2>كشف الطلبة حسب معدل الإعدادية</h2>${studentsTable(school, a.checkpoints)}</div>
    </td></tr></tbody>
  </table>`;
}

export async function mountFeederSchoolsTab(root, { onGoto } = {}) {
  root.innerHTML = '<div class="card"><div class="empty">جارٍ تحميل البيانات…</div></div>';
  let students = [];
  let checkpointRecords = [];
  try {
    [students, checkpointRecords] = await Promise.all([listStudents(), listCheckpoints().catch(() => [])]);
  } catch (error) {
    root.innerHTML = `<div class="card"><div class="empty">${esc(error.message || "تعذّر تحميل البيانات")}</div></div>`;
    return;
  }
  let track = "";
  let selectedSchool = "";

  const draw = () => {
    const a = buildFeederSchoolAnalysis(students, checkpointRecords, { track });
    if (!a.withPrepCount) {
      root.innerHTML = '<div class="card"><div class="empty">لا توجد نتائج إعدادية لطلبة السنة الأولى — تُستورَد مع كشف الطلبة (المدرسة الإعدادية ودرجاتها)</div></div>';
      return;
    }
    const school = a.schools.find((s) => s.school === selectedSchool) || null;
    root.innerHTML = `
      <div class="chip-row" id="feeder-track-chips">
        ${TRACKS.map((t) => `<div class="chip${t.key === track ? " on" : ""}" data-track="${esc(t.key)}">${esc(t.label)}</div>`).join("")}
        <button class="btn btn-primary" id="feeder-print" style="margin-inline-start:auto;">طباعة التحليل</button>
      </div>
      <div class="grid g4" style="margin-bottom:16px;">
        <div class="card stat"><div class="label">طلبة السنة الأولى</div><div class="value">${a.level1Count}</div></div>
        <div class="card stat"><div class="label">لهم نتائج إعدادية</div><div class="value">${a.withPrepCount}</div></div>
        <div class="card stat"><div class="label">المدارس الرافدة</div><div class="value">${a.schoolCount}</div></div>
        <div class="card stat"><div class="label">متوسط معدل الإعدادية</div><div class="value">${pct(a.overall.avg)}</div></div>
      </div>
      ${a.withoutPrepCount ? `<p class="hint" style="margin:-6px 0 12px;">${a.withoutPrepCount} طالبًا من السنة الأولى بلا نتائج إعدادية في السجل (غير داخلين في التحليل).</p>` : ""}
      <div class="card"><h2>التصنيف حسب معدل الإعدادية</h2><p class="hint" style="margin:0 0 8px;">اضغط على مدرسة لعرض كشف طلبتها.</p>${averageTable(a, { clickable: true })}</div>
      <div class="card"><h2>متوسط الدرجات حسب المواد</h2>${subjectsTable(a, { clickable: true })}${legend}</div>
      ${a.checkpoints.length ? `<div class="card"><h2>الأداء في الوقفات التقويمية حسب المدرسة الرافدة</h2><p class="hint" style="margin:0 0 8px;">متوسط درجات الطلبة في ${esc(a.checkpointTerm || "")} (بين القوسين عدد الطلبة المرصودة درجاتهم).</p>${checkpointsTable(a)}</div>` : ""}
      ${school ? `<div class="card" id="feeder-school-card"><h2>كشف طلبة ${esc(shortSchoolName(school.school))} (${school.count})</h2>
        <div class="chip-row" style="margin:0 0 8px;"><button class="btn btn-primary" id="feeder-school-print">طباعة الكشف</button><button class="btn btn-ghost" id="feeder-school-close">إغلاق</button></div>
        ${studentsTable(school, a.checkpoints)}</div>` : ""}
    `;
    root.querySelectorAll("[data-track]").forEach((chip) => chip.addEventListener("click", () => { track = chip.dataset.track; draw(); }));
    root.querySelectorAll("tr[data-school]").forEach((row) => row.addEventListener("click", () => {
      selectedSchool = row.dataset.school; draw();
      root.querySelector("#feeder-school-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    root.querySelectorAll("[data-goto-student]").forEach((row) => row.addEventListener("click", () => onGoto && onGoto("students", { studentId: row.dataset.gotoStudent })));
    root.querySelector("#feeder-print")?.addEventListener("click", () => printMarkupInPopup("تحليل طلبة السنة الأولى حسب المدارس الرافدة", feederReportMarkup(a, track)).catch((e) => notify(e.message)));
    root.querySelector("#feeder-school-print")?.addEventListener("click", () => printMarkupInPopup(`طلبة السنة الأولى — ${shortSchoolName(school.school)}`, schoolStudentsMarkup(school, a, track)).catch((e) => notify(e.message)));
    root.querySelector("#feeder-school-close")?.addEventListener("click", () => { selectedSchool = ""; draw(); });
  };
  draw();
}

