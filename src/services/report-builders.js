// Pure HTML-string builders for the exportable reports — no DOM, no
// IndexedDB, so they're directly unit-testable. The UI layer assembles the
// data (fetching sessions/actions per case/plan) and hands it in already
// shaped; these functions only decide what the document looks like.

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const AGENDA_STATUS_LABELS = { not_started: "لم يبدأ", ongoing: "قيد الإنجاز", done: "تم" };
const FOLLOWUP_STATUS_LABELS = { not_started: "لم يبدأ", ongoing: "قيد الإنجاز", done: "تم", not_done: "لم ينجز", unknown: "غير محدد" };
const PLAN_ACTION_STATUS_LABELS = { not_started: "لم يبدأ", ongoing: "قيد التنفيذ", done: "تم" };

export function buildFollowUpReportHtml(bySection, stats, exportedAt) {
  const sections = [...bySection.entries()];
  return `
    <h1>تقرير المتابعة والإحصائيات</h1>
    <p class="meta">تاريخ التصدير: ${esc(exportedAt)}</p>
    <h2>الإحصائيات العامة</h2>
    <table>
      <tr><th>نسبة الإنجاز الكلية</th><td>${stats.completionPct}٪</td></tr>
      <tr><th>بنود منجزة</th><td>${stats.doneItems} من ${stats.totalItems}</td></tr>
      <tr><th>إجراءات مُنفَّذة</th><td>${stats.actionsExecuted}</td></tr>
      <tr><th>إجمالي المستفيدين</th><td>${stats.totalParticipants}</td></tr>
    </table>
    <h2>الإنجاز حسب القسم</h2>
    <table>
      <tr><th>القسم</th><th>بنود منجزة</th><th>نسبة الإنجاز</th><th>عدد المستفيدين</th></tr>
      ${stats.sections.map((s) => `
        <tr><td>${esc(s.section)}</td><td>${s.done} / ${s.total}</td><td>${s.completionPct}٪</td><td>${s.participants}</td></tr>
      `).join("")}
    </table>
    <h2>بنود تقرير المتابعة</h2>
    ${sections.map(([section, items]) => `
      <h3>${esc(section)}</h3>
      <table>
        <tr><th>#</th><th>البند</th><th>الحالة</th><th>المستفيدون</th><th>الملخص</th></tr>
        ${items.map((item) => `
          <tr>
            <td>${esc(item.no)}</td>
            <td>${esc(item.title)}</td>
            <td>${esc(FOLLOWUP_STATUS_LABELS[item.status] || item.status)}</td>
            <td>${item.totalParticipants || 0}</td>
            <td>${esc(item.summary || "")}</td>
          </tr>
        `).join("")}
      </table>
    `).join("")}
  `;
}

export function buildAgendaReportHtml(entries, exportedAt) {
  return `
    <h1>تقرير الإجراءات (الأجندة التنفيذية)</h1>
    <p class="meta">تاريخ التصدير: ${esc(exportedAt)} — ${entries.length} إجراءً</p>
    <table>
      <tr><th>المحور</th><th>المشروع</th><th>الإجراء</th><th>الحالة</th><th>المستفيدون</th><th>الثبوتية</th><th>تقرير الفعالية</th></tr>
      ${entries.map((e) => `
        <tr>
          <td>${esc(e.pillar)}</td>
          <td>${esc(e.project_title || "")}</td>
          <td>${esc(e.action)}</td>
          <td>${esc(AGENDA_STATUS_LABELS[e.progress.status] || e.progress.status)}</td>
          <td>${e.progress.participantsCount ?? "—"}</td>
          <td>${esc(e.progress.proofNote || "—")}</td>
          <td>${esc(e.progress.effectivenessReport || "—")}</td>
        </tr>
      `).join("")}
    </table>
  `;
}

// `cases` each carry their own `.sessions` array, assembled by the caller.
export function buildGuidanceCasesReportHtml(cases, exportedAt) {
  return `
    <h1>تقرير الحالات الإرشادية</h1>
    <p class="meta">تاريخ التصدير: ${esc(exportedAt)} — ${cases.length} حالة</p>
    ${cases.map((c) => `
      <h2>${esc(c.studentName || c.studentId)} — ${esc(c.category)} (${c.status === "closed" ? "مُغلقة" : "مفتوحة"})</h2>
      ${c.title ? `<p>${esc(c.title)}</p>` : ""}
      ${c.notes ? `<p class="meta">ملاحظات: ${esc(c.notes)}</p>` : ""}
      <table>
        <tr><th>التاريخ</th><th>الملاحظة</th><th>الخطوة التالية</th></tr>
        ${(c.sessions && c.sessions.length)
          ? c.sessions.map((s) => `<tr><td>${esc(s.date)}</td><td>${esc(s.note)}</td><td>${esc(s.nextStep || "—")}</td></tr>`).join("")
          : '<tr><td colspan="3">لا توجد جلسات مسجَّلة</td></tr>'}
      </table>
    `).join("")}
  `;
}

// `plans` each carry their own `.actions` array, assembled by the caller.
export function buildSupportPlansReportHtml(plans, exportedAt) {
  const planStatusLabel = { active: "نشطة", completed: "مكتملة", cancelled: "مُلغاة" };
  return `
    <h1>تقرير خطط الدعم الفردية</h1>
    <p class="meta">تاريخ التصدير: ${esc(exportedAt)} — ${plans.length} خطة</p>
    ${plans.map((p) => `
      <h2>${esc(p.studentName || p.studentId)} — ${esc(p.domain || "")} (${esc(planStatusLabel[p.status] || p.status)})</h2>
      ${p.goal ? `<p>${esc(p.goal)}</p>` : ""}
      <table>
        <tr><th>الإجراء</th><th>تاريخ الاستحقاق</th><th>الحالة</th></tr>
        ${(p.actions && p.actions.length)
          ? p.actions.map((a) => `<tr><td>${esc(a.action)}</td><td>${esc(a.dueDate || "—")}</td><td>${esc(PLAN_ACTION_STATUS_LABELS[a.status] || a.status)}</td></tr>`).join("")
          : '<tr><td colspan="3">لا توجد إجراءات مسجَّلة</td></tr>'}
      </table>
    `).join("")}
  `;
}
