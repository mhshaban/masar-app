// تقرير التحصيل الأكاديمي للطالب (درجات الوقفتين التقويميتين + المقارنة).
// HTML نقي بتنسيق مضمَّن (inline) بالكامل وتخطيط بالجداول، حتى يبقى شكله
// نفسه عند: العرض داخل مسار، التحويل إلى PDF، والطباعة. ألوان القسم:
// كحلي + ذهبي. لا تُذكر أسماء المرشدين — الصفة فقط.
import { formatPct } from "../shared/format-pct.js?v=2026-10-01-avg-decimals-1";
import { CHECKPOINT_LABELS, TREND_LABELS } from "./checkpoint-service.js?v=2026-11-18-zeros-1";

const NAVY = "#1b2a4a";
const GOLD = "#b8913a";
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d9dee8";
const SOFT = "#f4f6fa";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v == null ? "—" : `${formatPct(v)}٪`);
const STATUS = { absent: "غائب", barred: "محروم" };
const TREND_COLOR = { up: "#15803d", down: "#b91c1c", steady: MUTED };

function cell(entry) {
  if (!entry) return "—";
  if (entry.status) return STATUS[entry.status] || entry.status;
  const score = entry.maxScore ? `${entry.score} / ${entry.maxScore}` : null;
  return score ? `<span dir="ltr">${esc(score)}</span><br><span style="color:${MUTED};font-size:11px;">${pct(entry.pct)}</span>` : pct(entry.pct);
}

function deltaCell(row) {
  if (row.delta == null) return "—";
  const sign = row.delta > 0 ? "+" : "";
  return `<span dir="ltr" style="color:${TREND_COLOR[row.trend]};font-weight:700;">${sign}${formatPct(row.delta)}</span><br><span style="color:${TREND_COLOR[row.trend]};font-size:11px;">${TREND_LABELS[row.trend]}</span>`;
}

function tile(label, value, accent = NAVY) {
  return `<td style="width:25%;padding:4px;"><div style="border:1px solid ${LINE};border-top:3px solid ${accent};border-radius:8px;padding:10px 6px;text-align:center;background:#fff;">
    <div style="font-size:11px;color:${MUTED};">${esc(label)}</div>
    <div style="font-size:19px;font-weight:800;color:${INK};margin-top:4px;">${value}</div></div></td>`;
}

export function adviceLines(comparison) {
  const lines = [];
  const latest = comparison.second ? "second" : "first";
  const weak = comparison.subjects.filter((s) => s[latest]?.pct != null && s[latest].pct < 50);
  const absent = comparison.subjects.filter((s) => s[latest]?.status);
  const down = comparison.subjects.filter((s) => s.trend === "down");
  if (weak.length) lines.push(`تحتاج إلى متابعة ودعم في: ${weak.map((s) => s.name || s.code).join("، ")}. ننصحك بالتواصل مع معلم المقرر والاستفادة من الساعات المكتبية.`);
  if (absent.length) lines.push(`لم تُرصد لك درجة بسبب الغياب أو الحرمان في: ${absent.map((s) => s.name || s.code).join("، ")}. راجع قسم الإرشاد الأكاديمي.`);
  if (comparison.second && down.length) lines.push(`انخفض أداؤك بين الوقفتين في: ${down.map((s) => s.name || s.code).join("، ")}.`);
  if (comparison.second && comparison.trend === "up") lines.push("أحسنت، تحسّن معدلك بين الوقفتين. استمر على هذا المستوى.");
  if (!lines.length) lines.push("أداؤك جيد في جميع المقررات. نتمنى لك دوام التوفيق والتفوق.");
  return lines;
}

// student: سجل الطالب؛ comparison: من compareCheckpoints؛ extra: { cumulative, issuedAt }
export function buildAchievementReportHtml(student, comparison, { cumulative = null, issuedAt = new Date() } = {}) {
  const date = issuedAt.toLocaleDateString("ar-BH-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
  const hasSecond = !!comparison.second;
  const rows = comparison.subjects.map((s, i) => `
    <tr style="background:${i % 2 ? SOFT : "#fff"};">
      <td style="border:1px solid ${LINE};padding:7px 8px;text-align:right;">${esc(s.name || s.code)}${s.code && s.name ? `<br><span style="color:${MUTED};font-size:11px;" dir="ltr">${esc(s.code)}</span>` : ""}</td>
      <td style="border:1px solid ${LINE};padding:7px 6px;text-align:center;">${cell(s.first)}</td>
      ${hasSecond ? `<td style="border:1px solid ${LINE};padding:7px 6px;text-align:center;">${cell(s.second)}</td>
      <td style="border:1px solid ${LINE};padding:7px 6px;text-align:center;">${deltaCell(s)}</td>` : ""}
    </tr>`).join("");
  const advice = adviceLines(comparison);
  const th = `style="border:1px solid ${NAVY};background:${NAVY};color:#fff;padding:8px 6px;font-weight:700;font-size:12.5px;"`;
  return `<div dir="rtl" lang="ar" style="font-family:Cairo,'Segoe UI',Tahoma,Arial,sans-serif;color:${INK};background:#fff;width:100%;max-width:720px;margin:0 auto;font-size:13px;line-height:1.6;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:${NAVY};">
    <tr><td style="padding:18px 20px;color:#fff;">
      <div style="font-size:12px;color:#d6c08a;">قسم الإرشاد الأكاديمي والتوجيه المهني</div>
      <div style="font-size:22px;font-weight:800;margin-top:2px;">تقرير التحصيل الأكاديمي</div>
      <div style="font-size:12.5px;color:#e5e7eb;">${hasSecond ? "درجات الوقفات التقويمية" : `درجات ${CHECKPOINT_LABELS[1]}`} · ${esc(comparison.term)}</div>
    </td></tr>
    <tr><td style="height:5px;background:${GOLD};padding:0;"></td></tr>
  </table>

  <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:14px;">
    <tr>
      <td style="padding:3px 0;width:50%;"><span style="color:${MUTED};">اسم الطالب: </span><strong>${esc(student.name)}</strong></td>
      <td style="padding:3px 0;"><span style="color:${MUTED};">الرقم الأكاديمي: </span><strong dir="ltr">${esc(student.academicId || student.id)}</strong></td>
    </tr>
    <tr>
      <td style="padding:3px 0;"><span style="color:${MUTED};">المستوى / الشعبة: </span><strong>${esc(student.level) || "—"} · ${esc(student.section) || "—"}</strong></td>
      <td style="padding:3px 0;"><span style="color:${MUTED};">التخصص: </span><strong>${esc([student.department, student.track].filter(Boolean).join(" — ")) || "—"}</strong></td>
    </tr>
  </table>

  <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:10px;"><tr>
    ${tile(CHECKPOINT_LABELS[1], pct(comparison.firstAvg))}
    ${hasSecond ? tile(CHECKPOINT_LABELS[2], pct(comparison.secondAvg)) : ""}
    ${hasSecond ? tile("التغيّر بين الوقفتين", comparison.delta == null ? "—" : `<span dir="ltr" style="color:${TREND_COLOR[comparison.trend]};">${comparison.delta > 0 ? "+" : ""}${formatPct(comparison.delta)}</span>`, GOLD) : ""}
    ${tile("المعدل التراكمي", pct(cumulative), GOLD)}
  </tr></table>

  <div style="font-size:15px;font-weight:800;color:${NAVY};margin:16px 0 6px;border-right:4px solid ${GOLD};padding-right:8px;">درجات المقررات</div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr><th ${th} style="text-align:right;">المقرر</th><th ${th}>${CHECKPOINT_LABELS[1]}</th>${hasSecond ? `<th ${th}>${CHECKPOINT_LABELS[2]}</th><th ${th}>التغيّر</th>` : ""}</tr></thead>
    <tbody>${rows || `<tr><td colspan="${hasSecond ? 4 : 2}" style="border:1px solid ${LINE};padding:10px;text-align:center;color:${MUTED};">لا توجد درجات مرصودة</td></tr>`}</tbody>
  </table>

  <div style="font-size:15px;font-weight:800;color:${NAVY};margin:16px 0 6px;border-right:4px solid ${GOLD};padding-right:8px;">توجيهات قسم الإرشاد الأكاديمي</div>
  <div style="background:${SOFT};border:1px solid ${LINE};border-radius:8px;padding:10px 14px;">
    ${advice.map((line) => `<p style="margin:4px 0;">• ${esc(line)}</p>`).join("")}
  </div>

  <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px;font-size:12px;color:${MUTED};">
    <tr><td>تاريخ الإصدار: ${esc(date)}</td><td style="text-align:left;color:${INK};"><strong>قسم الإرشاد الأكاديمي والتوجيه المهني</strong></td></tr>
  </table>
</div>`;
}

export function emailSubject(student, comparison) {
  return `تقرير التحصيل الأكاديمي — ${student.name || ""} — ${comparison.term}`;
}

export function emailBody(student, comparison = null) {
  const scope = comparison && !comparison.second ? `درجات ${CHECKPOINT_LABELS[1]}` : "درجات الوقفات التقويمية والمقارنة بينها";
  return [
    `عزيزي الطالب ${student.name || ""}،`,
    "",
    `تجد مرفقًا تقرير التحصيل الأكاديمي الخاص بك، ويتضمن ${scope}، مع توجيهات قسم الإرشاد الأكاديمي.`,
    "نتمنى لك التوفيق، ولا تتردد في مراجعة القسم عند الحاجة.",
    "",
    "قسم الإرشاد الأكاديمي والتوجيه المهني",
  ].join("\n");
}

export function reportFileName(student, comparison) {
  return `تقرير التحصيل الأكاديمي - ${student.academicId || student.id} - ${student.name || ""} - ${comparison.term}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
}
