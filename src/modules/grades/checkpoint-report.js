// تقرير التحصيل الأكاديمي للطالب (درجات الوقفتين التقويميتين + المقارنة).
// HTML نقي بتنسيق مضمَّن (inline) بالكامل وتخطيط بالجداول، حتى يبقى شكله
// نفسه عند: العرض داخل مسار، التحويل إلى PDF، والطباعة. ألوان القسم:
// كحلي + ذهبي. لا تُذكر أسماء المرشدين — الصفة فقط.
import { formatPct } from "../shared/format-pct.js?v=2026-10-01-avg-decimals-1";
import { CHECKPOINT_LABELS, TREND_LABELS } from "./checkpoint-service.js?v=2026-11-19-mac-1";

const NAVY = "#1b2a4a";
const GOLD = "#b8913a";
const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d9dee8";
const SOFT = "#f4f6fa";

// اسم المدرسة في رأس التقرير (نفس SCHOOL_NAME في نموذج اعتماد الفعاليات).
const SCHOOL_HEADER = "مدرسة الشيخ عبدالله بن عيسى آل خليفة الثانوية الصناعية للبنين";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v == null ? "—" : `${formatPct(v)}٪`);
const STATUS = { absent: "غائب", barred: "محروم" };
const statusText = (entry) => STATUS[entry.status] || entry.status;
const TREND_COLOR = { up: "#15803d", down: "#b91c1c", steady: MUTED };

function cell(entry) {
  if (!entry) return "—";
  if (entry.status) return `<span style="color:#b91c1c;font-weight:700;">${esc(statusText(entry))}</span>`;
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
  if (absent.length) lines.push(`تغيّبت عن الوقفة التقويمية في: ${absent.map((s) => s.name || s.code).join("، ")}، فلم تُرصد لك فيها درجة. راجع قسم الإرشاد الأكاديمي.`);
  if (comparison.second && down.length) lines.push(`انخفض أداؤك بين الوقفتين في: ${down.map((s) => s.name || s.code).join("، ")}.`);
  if (comparison.second && comparison.trend === "up") lines.push("أحسنت، تحسّن معدلك بين الوقفتين. استمر على هذا المستوى.");
  if (!lines.length) lines.push("أداؤك جيد في جميع المقررات. نتمنى لك دوام التوفيق والتفوق.");
  return lines;
}

// رسالة إلى ولي الأمر حسب وضع الطالب في آخر وقفة مرصودة.
// المستويات: absentAll (كل الدرجات صفر/غياب) ← low (أقل من 60٪ أو أقل من 50٪ في مقررين فأكثر)
// ← oneWeak (مقرر واحد أقل من 50٪) ← good ← top (90٪ فأكثر بلا مقرر أقل من 50٪).
export function parentMessage(comparison) {
  const latest = comparison.second ? "second" : "first";
  const avg = comparison.second ? comparison.secondAvg : comparison.firstAvg;
  const graded = comparison.subjects.filter((s) => s[latest]);
  const weak = graded.filter((s) => !s[latest].status && s[latest].pct != null && s[latest].pct < 50);
  const absent = graded.filter((s) => s[latest].status);
  const failing = [...weak, ...absent];
  const names = (list) => [...new Set(list.map((s) => s.name || s.code))].join("، ");
  // وصف الوضع: المقررات دون 50٪ ثم المقررات اللي غاب عن وقفتها.
  const situation = [
    weak.length ? `جاءت درجاته دون 50٪ في: ${names(weak)}` : "",
    absent.length ? `${weak.length ? "و" : ""}تغيّب عن الوقفة التقويمية في: ${names(absent)}` : "",
  ].filter(Boolean).join("، ");
  const visit = "ونرجو منكم مراجعة قسم الإرشاد الأكاديمي في المدرسة";
  if (graded.length && graded.every((s) => s[latest].status || s[latest].pct === 0)) {
    return { level: "absentAll", title: "إشعار عاجل", lines: [
      "نحيطكم علمًا بأن ابنكم لم يحصل على أي درجة في جميع مقررات الوقفة التقويمية بسبب غيابه عن الاختبارات، وهذا وضع خطير يهدد نجاحه في الفصل الدراسي.",
      `${visit} بشكل عاجل لتدارك الوضع ومعرفة أسباب الغياب ووضع خطة لتعويض ما فاته.`,
    ] };
  }
  if ((avg != null && avg < 60) || failing.length >= 2) {
    return { level: "low", title: "إشعار بتدني المستوى", lines: [
      `نود إحاطتكم بأن مستوى ابنكم الدراسي متدنٍ، إذ ${situation || "جاءت درجاته دون 50٪ في عدد من المقررات"}، وهذا يعرّضه لخطر الرسوب إذا استمر الوضع.`,
      `${visit} في أقرب وقت لتدارك الوضع والوقوف على أسباب تدني درجاته، ومتابعته مع معلمي المقررات.`,
    ] };
  }
  if (failing.length === 1) {
    return { level: "oneWeak", title: "تنبيه", lines: [
      weak.length
        ? `نلفت انتباهكم إلى أن درجة ابنكم في مقرر ${names(weak)} جاءت دون 50٪، رغم أن مستواه في بقية المقررات مقبول.`
        : `نلفت انتباهكم إلى أن ابنكم تغيّب عن الوقفة التقويمية في مقرر ${names(absent)}، رغم أن مستواه في بقية المقررات مقبول.`,
      `${visit} لمعرفة سبب تدني الدرجة ومساعدته على رفعها في الوقفة القادمة.`,
    ] };
  }
  if (avg != null && avg >= 90) {
    return { level: "top", title: "تهنئة", lines: [
      "يسرّنا إبلاغكم بتفوق ابنكم في جميع المقررات، ونشكر لكم متابعتكم واهتمامكم.",
      "نأمل استمرار دعمكم له ليحافظ على هذا المستوى المتميز.",
    ] };
  }
  return { level: "good", title: "", lines: [
    "نود إفادتكم بأن مستوى ابنكم جيد ولم تقل درجاته عن 50٪ في أي مقرر.",
    "نأمل استمرار متابعتكم وتشجيعه على رفع مستواه أكثر في الوقفة القادمة.",
  ] };
}

const PARENT_ACCENT = { absentAll: "#b91c1c", low: "#b91c1c", oneWeak: GOLD, good: NAVY, top: "#15803d" };

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
  const parent = parentMessage(comparison);
  const accent = PARENT_ACCENT[parent.level];
  const th = `style="border:1px solid ${NAVY};background:${NAVY};color:#fff;padding:8px 6px;font-weight:700;font-size:12.5px;"`;
  return `<div dir="rtl" lang="ar" style="font-family:Cairo,'Segoe UI',Tahoma,Arial,sans-serif;color:${INK};background:#fff;width:100%;max-width:720px;margin:0 auto;font-size:13px;line-height:1.6;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:${NAVY};">
    <tr><td style="padding:18px 20px;color:#fff;">
      <div style="font-size:12px;color:#d6c08a;">${SCHOOL_HEADER}</div>
      <div style="font-size:22px;font-weight:800;margin-top:2px;">تقرير التحصيل الأكاديمي</div>
      <div style="font-size:12.5px;color:#e5e7eb;">${hasSecond ? "درجات الوقفات التقويمية" : `درجات ${CHECKPOINT_LABELS[1]}`} · ${esc(comparison.term)}</div>
    </td></tr>
    <tr><td style="height:5px;background:${GOLD};padding:0;"></td></tr>
  </table>

  <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:14px;">
    <tr>
      <td style="padding:3px 0;width:50%;"><span style="color:${MUTED};">عزيزي الطالب: </span><strong>${esc(student.name)}</strong></td>
      <td style="padding:3px 0;"><span style="color:${MUTED};">الرقم الأكاديمي: </span><strong dir="ltr">${esc(student.academicId || student.id)}</strong></td>
    </tr>
    <tr>
      <td style="padding:3px 0;"><span style="color:${MUTED};">الشعبة: </span><strong>${esc(student.section) || "—"}</strong></td>
      <td style="padding:3px 0;"><span style="color:${MUTED};">التخصص: </span><strong>${esc([student.department, student.track].filter(Boolean).join(" — ")) || "—"}</strong></td>
    </tr>
  </table>
  <!--email-intro-->

  <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:10px;"><tr>
    ${tile(CHECKPOINT_LABELS[1], pct(comparison.firstAvg))}
    ${hasSecond ? tile(CHECKPOINT_LABELS[2], pct(comparison.secondAvg)) : ""}
    ${hasSecond ? tile("التغيّر بين الوقفتين", comparison.delta == null ? "—" : `<span dir="ltr" style="color:${TREND_COLOR[comparison.trend]};">${comparison.delta > 0 ? "+" : ""}${formatPct(comparison.delta)}</span>`, GOLD) : ""}
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

  <div style="font-size:15px;font-weight:800;color:${NAVY};margin:16px 0 6px;border-right:4px solid ${GOLD};padding-right:8px;">رسالة إلى ولي الأمر</div>
  <div style="border:1px solid ${LINE};border-right:5px solid ${accent};border-radius:8px;padding:10px 14px;background:#fff;">
    ${parent.title ? `<p style="margin:2px 0 6px;font-weight:800;color:${accent};">${esc(parent.title)}</p>` : ""}
    <p style="margin:4px 0;">ولي أمر الطالب المحترم،</p>
    ${parent.lines.map((line) => `<p style="margin:4px 0;">${esc(line)}</p>`).join("")}
  </div>

  <!--email-closing-->
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
    `فيما يلي تقرير التحصيل الأكاديمي الخاص بك، ويتضمن ${scope}، مع توجيهات قسم الإرشاد الأكاديمي.`,
    "نتمنى لك التوفيق، ولا تتردد في مراجعة القسم عند الحاجة.",
    "",
    "قسم الإرشاد الأكاديمي والتوجيه المهني",
  ].join("\n");
}

function injectAt(reportHtml, marker, html, fallbackFirst) {
  if (reportHtml.includes(marker)) return reportHtml.replace(marker, html);
  return fallbackFirst ? html + reportHtml : reportHtml + html;
}

// نص البريد بصيغة HTML: التقرير نفسه مدمجًا (بدون مرفق)، بنفس التصميم وخط
// Cairo. المقدمة بعد بيانات الطالب، وسطر الختام في آخر التقرير قبل التوقيع.
export function emailHtml(student, comparison, reportHtml) {
  const lines = emailBody(student, comparison).split("\n").filter(Boolean);
  lines.pop(); // التوقيع موجود أصلًا في ذيل التقرير
  lines.shift(); // بدون سطر «عزيزي الطالب»: الاسم موجود في بيانات التقرير
  const closing = lines.pop();
  const p = (l) => `<p style="margin:0 0 6px;">${esc(l)}</p>`;
  const box = (inner, margin) => `<div dir="rtl" style="font-size:14px;line-height:1.8;color:#1f2937;margin:${margin};text-align:right;">${inner}</div>`;
  let body = injectAt(reportHtml, "<!--email-intro-->", box(lines.map(p).join(""), "14px 0 4px"), true);
  body = injectAt(body, "<!--email-closing-->", box(p(closing), "18px 0 0"), false);
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap');:root{color-scheme:light only;supported-color-schemes:light only;}</style></head><body dir="rtl" style="margin:0;padding:12px;background:#ffffff;">
  ${body}
</body></html>`;
}

export function reportFileName(student, comparison) {
  return `تقرير التحصيل الأكاديمي - ${student.academicId || student.id} - ${student.name || ""} - ${comparison.term}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
}
