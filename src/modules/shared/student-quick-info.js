import { list as listAll } from "../../services/cloud-runtime.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// نفس حد الرسوب المعتمد بـgrade-flags-service.js (الترشيح للحالات/الدعم) —
// هنا فقط لعرض معلومة سريعة عن الطالب، لا للترشيح، فمكرَّر عمدًا بدل
// استيراد متبادل بين الوحدتين.
const FAIL_THRESHOLD_PCT = 50;

function normalizeAverage(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

// كل صفوف academicFlags دفعة واحدة (مخزَّنة مؤقتًا 5 دقائق داخل
// cloud-runtime.js أصلًا) بدل استعلام منفصل لكل طالب — تُستدعى مرة واحدة
// لكل شاشة/بحث وتُمرَّر خارطتها لـstudentQuickInfo لكل طالب على حدة.
export async function loadAcademicFlagsMap() {
  const flags = await listAll("academicFlags");
  const map = new Map();
  for (const flag of flags) if (flag.studentId != null) map.set(String(flag.studentId), flag);
  return map;
}

// معلومة سريعة عن طالب (هاتف، معدل تراكمي، رسوب/حرمان) — نفس ما يحتاجه
// المرشد فورًا بدل التنقل لسجل الطلبة أو الدرجات والتحليلات للتأكد منه.
export function studentQuickInfo(student, flagsMap) {
  const flag = flagsMap?.get(String(student?.id)) || flagsMap?.get(String(student?.academicId)) || null;
  const finalCumulativeAverage = normalizeAverage(flag?.finalCumulativeAverage ?? student?.finalCumulativeAverage);
  const failingSubjects = (flag?.subjects || []).filter((s) => s.pct != null && Math.round(Number(s.pct)) < FAIL_THRESHOLD_PCT);
  const barredCount = Number(flag?.barredCount) || 0;
  const reasons = [];
  if (failingSubjects.length) reasons.push(`رسوب في ${failingSubjects.length} ${failingSubjects.length === 1 ? "مادة" : "مواد"}`);
  if (barredCount) reasons.push(`محروم في ${barredCount} ${barredCount === 1 ? "مادة" : "مواد"}`);
  return {
    phone: (student?.phones || [])[0] || "",
    finalCumulativeAverage,
    reasons,
  };
}

// سطر نصي مضغوط (هاتف · المعدل · أسباب) لدمجه بنتائج بحث الطالب.
export function studentQuickInfoLine(info) {
  return [
    info.phone || null,
    info.finalCumulativeAverage != null ? `المعدل ${info.finalCumulativeAverage}٪` : null,
    info.reasons.length ? info.reasons.join(" · ") : null,
  ].filter(Boolean).join(" · ");
}

// بطاقة معلومات مصغّرة لشاشات الحالات/الدعم/التوجيه المهني — نفس شكل
// studentCard()‎ بوحدة forms-ui.js لكن معمَّمة (هاتف + معدل + رسوب/حرمان
// بدل حقول خاصة بالاستمارات كالتخصص).
export function studentQuickCard(student, info) {
  if (!student) return '<div class="forms-student empty">لم يتم اختيار طالب بعد</div>';
  const avg = info?.finalCumulativeAverage;
  return `<div class="forms-student">
    <strong>${esc(student.name)}</strong>
    <span>الرقم الأكاديمي: ${esc(student.academicId) || "—"}</span>
    <span>المستوى: ${esc(student.level) || "—"}</span>
    <span>الشعبة: ${esc(student.section) || "—"}</span>
    <span>رقم التواصل: ${esc(info?.phone) || "—"}</span>
    <span>المعدل التراكمي: ${avg == null ? "—" : `${esc(avg)}٪`}</span>
    ${info?.reasons?.length ? `<span class="forms-student-flag">${esc(info.reasons.join(" · "))}</span>` : ""}
  </div>`;
}
