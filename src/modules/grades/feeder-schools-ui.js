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

// الشريط يبدأ من ٦٠ حتى تظهر الفروق بين المدارس (المعدلات كلها تقريبًا فوق ٦٠).
const BAR_FLOOR = 60;
const bar = (value) => value == null ? "" : `<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;min-width:60px;"><div style="height:100%;width:${Math.max(2, Math.min(100, ((value - BAR_FLOOR) / (100 - BAR_FLOOR)) * 100))}%;background:var(--teal-600, #1a2744);"></div></div>`;

function averageTable(a, { clickable = false } = {}) {
  const ref = a.overall.avg;
  // أعمدة التقديرات التي لا يوجد فيها أي طالب تُخفى لتخفيف الجدول.
  const labels = RATING_LABELS.filter((label) => a.overall.ratings[label]);
  const rows = a.schools.map((s, i) => `<tr${clickable ? ` data-school="${esc(s.school)}" style="cursor:pointer;"` : ""}>
    <td>${i + 1}</td><td style="min-width:28mm;"><strong>${esc(s.shortName)}</strong></td><td class="num">${s.count}</td><td class="num">${formatPct(s.share)}٪</td>
    <td class="num"${tone(s.avg, ref)}>${pct(s.avg)}</td><td class="print-hide">${bar(s.avg)}</td><td class="num">${val(s.max)}</td><td class="num">${val(s.min)}</td>
    ${labels.map((label) => `<td class="num">${s.ratings[label] || ""}</td>`).join("")}
  </tr>`).join("");
  return `<div class="tablewrap"><table>
    <thead><tr><th>م</th><th>المدرسة الرافدة</th><th>الطلبة</th><th>النسبة</th><th>متوسط المعدل</th><th class="print-hide"></th><th>أعلى</th><th>أدنى</th>${labels.map((l) => `<th>${esc(l)}</th>`).join("")}</tr></thead>
    <tbody>${rows}
      <tr style="font-weight:800;"><td></td><td>الإجمالي</td><td class="num">${a.overall.count}</td><td class="num">100٪</td><td class="num">${pct(a.overall.avg)}</td><td class="print-hide">${bar(a.overall.avg)}</td><td class="num">${val(a.overall.max)}</td><td class="num">${val(a.overall.min)}</td>
      ${labels.map((label) => `<td class="num">${a.overall.ratings[label] || ""}</td>`).join("")}</tr>
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
      <div class="card"><h2>أبرز النتائج</h2><ul style="margin:0;padding-inline-start:5mm;line-height:1.9;">${keyFindings(a).map((f) => `<li>${f}</li>`).join("")}</ul></div>
      <div class="card"><h2>توزيع التقديرات</h2>${ratingsStrip(a)}</div>
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

const VIEWS = [
  { key: "overview", label: "نظرة عامة" },
  { key: "average", label: "حسب المعدل" },
  { key: "subjects", label: "حسب المواد" },
  { key: "checkpoints", label: "الوقفات التقويمية" },
  { key: "school", label: "كشف مدرسة" },
];
const SORTS = [
  { key: "count", label: "الأكثر طلبة" },
  { key: "avg-desc", label: "الأعلى معدلًا" },
  { key: "avg-asc", label: "الأدنى معدلًا" },
];
const VIEW_KEY = "masar.feeder.view";
const readPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* تفضيل محلي فقط */ } };

// نسخة من التحليل بترتيب وفلترة العرض (المجاميع تبقى للسنة الأولى كاملة).
export function viewOf(a, { sort = "count", hideSmall = false, subject = "" } = {}) {
  let schools = hideSmall ? a.schools.filter((s) => s.count >= 5) : [...a.schools];
  const key = (s) => (subject ? s.subjects[subject] : s.avg) ?? -1;
  if (sort === "avg-desc") schools.sort((x, y) => key(y) - key(x));
  else if (sort === "avg-asc") schools.sort((x, y) => key(x) - key(y));
  return { ...a, schools };
}

// ترتيب المدارس في مادة واحدة مع شريط بصري.
function subjectRankingTable(a, subject, { clickable = false } = {}) {
  const ref = a.overall.subjects[subject];
  const rows = a.schools.map((s, i) => `<tr${clickable ? ` data-school="${esc(s.school)}" style="cursor:pointer;"` : ""}>
    <td>${i + 1}</td><td style="min-width:28mm;"><strong>${esc(s.shortName)}</strong></td><td class="num">${s.count}</td>
    <td class="num"${tone(s.subjects[subject], ref)}>${val(s.subjects[subject])}</td><td style="width:40%;">${bar(s.subjects[subject])}</td>
    <td class="num">${s.subjects[subject] == null || ref == null ? "—" : `${s.subjects[subject] - ref > 0 ? "+" : ""}${formatPct(s.subjects[subject] - ref)}`}</td>
  </tr>`).join("");
  return `<div class="tablewrap"><table>
    <thead><tr><th>م</th><th>المدرسة الرافدة</th><th>الطلبة</th><th>متوسط ${esc(subjectLabel(subject))}</th><th></th><th>الفرق عن المتوسط</th></tr></thead>
    <tbody>${rows}<tr style="font-weight:800;"><td></td><td>متوسط السنة الأولى</td><td class="num">${a.overall.count}</td><td class="num">${val(ref)}</td><td>${bar(ref)}</td><td></td></tr></tbody>
  </table></div>`;
}

// شريط توزيع التقديرات للسنة الأولى كاملة.
const RATING_COLORS = ["#1e7d4e", "#4f9d6e", "#1a2744", "#c8923a", "#d9822b", "#c0392b"];
function ratingsStrip(a) {
  const total = a.withPrepCount || 1;
  const parts = RATING_LABELS.map((label, i) => ({ label, n: a.overall.ratings[label] || 0, color: RATING_COLORS[i] })).filter((p) => p.n);
  return `<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;margin:4px 0 8px;">${parts.map((p) => `<div title="${esc(p.label)}: ${p.n}" style="width:${(p.n / total) * 100}%;background:${p.color};"></div>`).join("")}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;">${parts.map((p) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.color};margin-inline-end:5px;"></span>${esc(p.label)}: <strong>${p.n}</strong> (${formatPct((p.n / total) * 100)}٪)</span>`).join("")}</div>`;
}

// أبرز النتائج بجمل قصيرة (المقارنات بين المدارس لمن عندها ٥ طلاب فأكثر).
export function keyFindings(a) {
  const big = a.schools.filter((s) => s.count >= 5);
  const byAvg = [...big].sort((x, y) => (y.avg ?? 0) - (x.avg ?? 0));
  const out = [];
  if (a.schools[0]) out.push(`أكثر مدرسة رافدة: <strong>${esc(a.schools[0].shortName)}</strong> بـ ${a.schools[0].count} طالبًا (${formatPct(a.schools[0].share)}٪).`);
  const top3 = a.schools.slice(0, 3).reduce((sum, s) => sum + s.count, 0);
  if (a.schools.length > 3) out.push(`أكبر ٣ مدارس تمثل ${formatPct((top3 / (a.withPrepCount || 1)) * 100)}٪ من طلبة السنة الأولى.`);
  if (byAvg.length > 1) {
    out.push(`أعلى متوسط معدل: <strong>${esc(byAvg[0].shortName)}</strong> (${pct(byAvg[0].avg)}).`);
    out.push(`أدنى متوسط معدل: <strong>${esc(byAvg[byAvg.length - 1].shortName)}</strong> (${pct(byAvg[byAvg.length - 1].avg)}).`);
  }
  if (a.overall.weakestSubject) out.push(`أضعف مادة: <strong>${esc(subjectLabel(a.overall.weakestSubject))}</strong> (${val(a.overall.subjects[a.overall.weakestSubject])})، وأقواها ${esc(subjectLabel(a.overall.strongestSubject))} (${val(a.overall.subjects[a.overall.strongestSubject])}).`);
  const weakMath = big.filter((s) => s.weakestSubject === a.overall.weakestSubject).length;
  if (big.length && a.overall.weakestSubject) out.push(`${esc(subjectLabel(a.overall.weakestSubject))} أضعف مادة في ${weakMath} من ${big.length} مدارس (٥ طلاب فأكثر).`);
  const cp = a.checkpoints[0];
  if (cp && a.overall.checkpoints[cp]?.avg != null && a.overall.avg != null) {
    out.push(`متوسط ${esc(CHECKPOINT_LABELS[cp] || "الوقفة")}: <strong>${pct(a.overall.checkpoints[cp].avg)}</strong> مقابل ${pct(a.overall.avg)} في الإعدادية (${formatPct(a.overall.checkpoints[cp].avg - a.overall.avg)} نقطة).`);
    const gaps = big.filter((s) => s.checkpoints[cp]?.avg != null).map((s) => ({ s, d: s.checkpoints[cp].avg - s.avg })).sort((x, y) => y.d - x.d);
    if (gaps.length > 1) out.push(`أقل تراجع في الوقفة: <strong>${esc(gaps[0].s.shortName)}</strong> (${formatPct(gaps[0].d)})، وأكبر تراجع: <strong>${esc(gaps[gaps.length - 1].s.shortName)}</strong> (${formatPct(gaps[gaps.length - 1].d)}).`);
  }
  return out;
}

function overviewMarkup(a) {
  return `
    <div class="card"><h2>أبرز النتائج</h2><ul style="margin:0;padding-inline-start:20px;line-height:2;">${keyFindings(a).map((f) => `<li>${f}</li>`).join("")}</ul></div>
    <div class="card"><h2>توزيع التقديرات (معدل الإعدادية)</h2>${ratingsStrip(a)}</div>
    <div class="card"><h2>ملخص</h2><div class="tablewrap"><table>${summaryRows(a, "")}</table></div></div>`;
}

function schoolProfile(school, a) {
  const cp = a.checkpoints[0];
  return `<div class="grid g4" style="margin-bottom:12px;">
    <div class="card stat"><div class="label">عدد الطلبة</div><div class="value">${school.count}</div></div>
    <div class="card stat"><div class="label">متوسط المعدل</div><div class="value">${pct(school.avg)}</div></div>
    <div class="card stat"><div class="label">أضعف مادة</div><div class="value" style="font-size:18px;">${esc(subjectLabel(school.weakestSubject))}</div></div>
    ${cp ? `<div class="card stat"><div class="label">${esc(CHECKPOINT_LABELS[cp] || "الوقفة")}</div><div class="value">${pct(school.checkpoints[cp]?.avg)}</div></div>` : `<div class="card stat"><div class="label">ممتاز</div><div class="value">${school.excellent}</div></div>`}
  </div>`;
}

const sectionTitle = { overview: "نظرة عامة", average: "التصنيف حسب معدل الإعدادية", subjects: "متوسط الدرجات حسب المواد", checkpoints: "الأداء في الوقفات التقويمية" };

export function sectionPrintMarkup(view, a, track, { subject = "" } = {}) {
  let body = "";
  if (view === "overview") body = `<div class="card"><h2>أبرز النتائج</h2><ul style="margin:0;padding-inline-start:5mm;line-height:1.9;">${keyFindings(a).map((f) => `<li>${f}</li>`).join("")}</ul></div><div class="card"><h2>توزيع التقديرات</h2>${ratingsStrip(a)}</div><div class="card"><h2>ملخص</h2><div class="tablewrap"><table>${summaryRows(a, track)}</table></div></div>`;
  if (view === "average") body = `<div class="card print-flow"><h2>${sectionTitle.average}</h2>${averageTable(a)}</div>`;
  if (view === "subjects") body = subject
    ? `<div class="card print-flow"><h2>ترتيب المدارس في ${esc(subjectLabel(subject))}</h2>${subjectRankingTable(a, subject)}</div>`
    : `<div class="card print-flow"><h2>${sectionTitle.subjects}</h2>${subjectsTable(a)}</div>`;
  if (view === "checkpoints") body = `<div class="card print-flow"><h2>${sectionTitle.checkpoints}</h2>${checkpointsTable(a)}</div>`;
  return `<table class="forms-print">
    ${printHeader("تحليل طلبة السنة الأولى حسب المدارس الرافدة", `${trackLabel(track)} · ${subject && view === "subjects" ? subjectLabel(subject) : sectionTitle[view] || ""}`)}
    <tbody><tr><td>${body}${view === "overview" ? "" : legend}</td></tr></tbody>
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
  const state = { track: "", view: readPref(VIEW_KEY, "overview"), sort: "count", hideSmall: false, subject: "", school: "" };
  if (!VIEWS.some((v) => v.key === state.view)) state.view = "overview";

  const draw = () => {
    const full = buildFeederSchoolAnalysis(students, checkpointRecords, { track: state.track });
    if (!full.withPrepCount) {
      root.innerHTML = '<div class="card"><div class="empty">لا توجد نتائج إعدادية لطلبة السنة الأولى — تُستورَد مع كشف الطلبة (المدرسة الإعدادية ودرجاتها)</div></div>';
      return;
    }
    const views = VIEWS.filter((v) => v.key !== "checkpoints" || full.checkpoints.length);
    if (!views.some((v) => v.key === state.view)) state.view = "overview";
    const a = viewOf(full, { sort: state.sort, hideSmall: state.hideSmall, subject: state.view === "subjects" ? state.subject : "" });
    if (!state.school || !full.schools.some((s) => s.school === state.school)) state.school = full.schools[0].school;
    const school = full.schools.find((s) => s.school === state.school);
    const listControls = `<div class="chip-row" style="align-items:center;margin-bottom:10px;">
        <span class="hint">الترتيب:</span>
        ${SORTS.map((o) => `<div class="chip${o.key === state.sort ? " on" : ""}" data-sort="${o.key}">${esc(o.label)}</div>`).join("")}
        <label class="hint" style="display:flex;align-items:center;gap:6px;margin-inline-start:8px;cursor:pointer;"><input type="checkbox" id="feeder-hide-small"${state.hideSmall ? " checked" : ""}> إخفاء المدارس الأقل من ٥ طلاب</label>
      </div>`;
    let body = "";
    if (state.view === "overview") body = overviewMarkup(full);
    if (state.view === "average") body = `${listControls}<div class="card"><h2>${sectionTitle.average}</h2><p class="hint" style="margin:0 0 8px;">اضغط على مدرسة لفتح كشف طلبتها.</p>${averageTable(a, { clickable: true })}${legend}</div>`;
    if (state.view === "subjects") body = `
      <div class="chip-row" style="margin-bottom:8px;"><span class="hint" style="align-self:center;">المادة:</span>
        <div class="chip${!state.subject ? " on" : ""}" data-subject="">كل المواد</div>
        ${PREP_SUBJECTS.map((s) => `<div class="chip${state.subject === s.key ? " on" : ""}" data-subject="${s.key}">${esc(s.label)}</div>`).join("")}
      </div>${listControls}
      <div class="card"><h2>${state.subject ? `ترتيب المدارس في ${esc(subjectLabel(state.subject))}` : sectionTitle.subjects}</h2>${state.subject ? subjectRankingTable(a, state.subject, { clickable: true }) : subjectsTable(a, { clickable: true })}${legend}</div>`;
    if (state.view === "checkpoints") body = `${listControls}<div class="card"><h2>${sectionTitle.checkpoints}</h2><p class="hint" style="margin:0 0 8px;">متوسط درجات الطلبة في ${esc(full.checkpointTerm || "")} (بين القوسين عدد الطلبة المرصودة درجاتهم).</p>${checkpointsTable(a)}${legend}</div>`;
    if (state.view === "school") body = `
      <div class="chip-row" style="align-items:center;">
        <label class="hint" for="feeder-school-select">المدرسة:</label>
        <select id="feeder-school-select" style="min-width:260px;">${full.schools.map((s) => `<option value="${esc(s.school)}"${s.school === state.school ? " selected" : ""}>${esc(shortSchoolName(s.school))} (${s.count})</option>`).join("")}</select>
      </div>
      ${schoolProfile(school, full)}
      <div class="card"><h2>كشف طلبة ${esc(shortSchoolName(school.school))} (${school.count})</h2><p class="hint" style="margin:0 0 8px;">مرتبون من الأعلى معدلًا. اضغط على طالب لفتح ملفه.</p>${studentsTable(school, full.checkpoints)}</div>`;

    root.innerHTML = `
      <div class="chip-row" style="align-items:center;">
        ${TRACKS.map((t) => `<div class="chip${t.key === state.track ? " on" : ""}" data-track="${esc(t.key)}">${esc(t.label)}</div>`).join("")}
        <span style="margin-inline-start:auto;display:flex;gap:8px;">
          <button class="btn btn-ghost" id="feeder-print-all">طباعة التحليل كاملًا</button>
          <button class="btn btn-primary" id="feeder-print">${state.view === "school" ? "طباعة كشف المدرسة" : "طباعة هذا القسم"}</button>
        </span>
      </div>
      <div class="grid g4" style="margin-bottom:12px;">
        <div class="card stat"><div class="label">طلبة السنة الأولى</div><div class="value">${full.level1Count}</div></div>
        <div class="card stat"><div class="label">لهم نتائج إعدادية</div><div class="value">${full.withPrepCount}</div></div>
        <div class="card stat"><div class="label">المدارس الرافدة</div><div class="value">${full.schoolCount}</div></div>
        <div class="card stat"><div class="label">متوسط معدل الإعدادية</div><div class="value">${pct(full.overall.avg)}</div></div>
      </div>
      ${full.withoutPrepCount ? `<p class="hint" style="margin:-4px 0 10px;">${full.withoutPrepCount} طالبًا من السنة الأولى بلا نتائج إعدادية في السجل (غير داخلين في التحليل).</p>` : ""}
      <div class="tabs" style="margin-bottom:14px;">${views.map((v) => `<div class="tab${v.key === state.view ? " active" : ""}" data-view="${v.key}">${esc(v.label)}</div>`).join("")}</div>
      ${body}
    `;
    const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
    on("[data-track]", "click", (el) => { state.track = el.dataset.track; draw(); });
    on("[data-view]", "click", (el) => { state.view = el.dataset.view; writePref(VIEW_KEY, state.view); draw(); });
    on("[data-sort]", "click", (el) => { state.sort = el.dataset.sort; draw(); });
    on("[data-subject]", "click", (el) => { state.subject = el.dataset.subject; if (state.subject && state.sort === "count") state.sort = "avg-desc"; draw(); });
    on("#feeder-hide-small", "change", (el) => { state.hideSmall = el.checked; draw(); });
    on("#feeder-school-select", "change", (el) => { state.school = el.value; draw(); });
    on("tr[data-school]", "click", (el) => { state.school = el.dataset.school; state.view = "school"; writePref(VIEW_KEY, state.view); draw(); root.scrollIntoView({ behavior: "smooth", block: "start" }); });
    on("[data-goto-student]", "click", (el) => onGoto && onGoto("students", { studentId: el.dataset.gotoStudent }));
    on("#feeder-print-all", "click", () => printMarkupInPopup("تحليل طلبة السنة الأولى حسب المدارس الرافدة", feederReportMarkup(viewOf(full, { sort: state.sort, hideSmall: state.hideSmall }), state.track)).catch((e) => notify(e.message)));
    on("#feeder-print", "click", () => {
      const job = state.view === "school"
        ? printMarkupInPopup(`طلبة السنة الأولى — ${shortSchoolName(school.school)}`, schoolStudentsMarkup(school, full, state.track))
        : printMarkupInPopup(`تحليل السنة الأولى — ${sectionTitle[state.view]}`, sectionPrintMarkup(state.view, a, state.track, { subject: state.subject }));
      job.catch((e) => notify(e.message));
    });
  };
  draw();
}
