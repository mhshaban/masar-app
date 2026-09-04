// Pure HTML-string builders for the exportable reports — no DOM, no
// IndexedDB, so they're directly unit-testable. The UI layer assembles the
// data (fetching sessions/actions per case/plan) and hands it in already
// shaped; these functions only decide what the document looks like.

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatAuditDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ar-BH", { dateStyle: "short", timeStyle: "short" });
}

function departmentFormEntryFooter(item) {
  const createdBy = item.createdByName || item.createdBy?.name || item.createdBy || "حساب الإدمن";
  const createdAt = formatAuditDate(item.createdAt);
  const updatedBy = item.updatedByName || item.updatedBy?.name || item.updatedBy || "";
  const updatedAt = formatAuditDate(item.updatedAt);
  return `<div class="document-entry-footer"><span>تم الإدخال بواسطة: <strong>${esc(createdBy)}</strong>${createdAt ? ` — ${esc(createdAt)}` : ""}</span>${updatedBy ? `<span>آخر تعديل بواسطة: <strong>${esc(updatedBy)}</strong>${updatedAt ? ` — ${esc(updatedAt)}` : ""}</span>` : ""}</div>`;
}

const AGENDA_STATUS_LABELS = { not_started: "لم يبدأ", ongoing: "قيد الإنجاز", done: "تم" };
const FOLLOWUP_STATUS_LABELS = { not_started: "لم يبدأ", ongoing: "قيد الإنجاز", done: "تم", not_done: "لم ينجز", unknown: "غير محدد" };
const PLAN_ACTION_STATUS_LABELS = { not_started: "لم يبدأ", ongoing: "قيد التنفيذ", done: "تم" };

const DEPARTMENT_FORM_FIELD_ORDER = {
  referral: ["reason", "requestedAction", "notes"],
  section_change: ["requestKind", "guardianName", "guardianPersonalNo", "guardianPhone", "currentPlacement", "requestedPlacement", "reason", "guidanceOpinion", "socialOpinion", "registrationOpinion", "finalDecision"],
  consent: ["guardianName", "address", "subject", "consentText", "guardianResponse", "guardianPersonalNo", "guardianPhone", "responseDate", "signature"],
};

function departmentFormWorkflow(item) {
  if (item.kind === "section_change") return `<div class="document-approval"><strong>القرار والتوثيق</strong><p>☐ موافق &nbsp;&nbsp; ☐ غير موافق &nbsp;&nbsp; ☐ مؤجل لاستكمال البيانات</p><table><tr><td>مدير المدرسة/من ينوب عنه: ................................</td><td>التاريخ: ........ / ........ / ................</td><td>التوقيع: ................................</td></tr></table></div>`;
  if (item.kind === "consent") {
    const response = item.fields?.guardianResponse;
    return `<div class="document-approval"><strong>إقرار ولي الأمر</strong><p>${response === "approved" ? "☑" : "☐"} موافق &nbsp;&nbsp; ${response === "declined" ? "☑" : "☐"} غير موافق</p><table><tr><td>الاسم: ${esc(item.fields?.guardianName || "................................")}</td><td>الرقم الشخصي: ${esc(item.fields?.guardianPersonalNo || "................................")}</td><td>التاريخ والتوقيع: ${esc(item.fields?.responseDate || "........ / ........ / ................")} &nbsp; ${esc(item.fields?.signature || "................................")}</td></tr></table></div>`;
  }
  return `<div class="document-approval"><strong>استلام ومتابعة الجهة المحال إليها</strong><p>☐ تم الاستلام &nbsp;&nbsp; ☐ تمت المراجعة &nbsp;&nbsp; ☐ تم اتخاذ الإجراء &nbsp;&nbsp; ☐ أُعيدت التغذية الراجعة</p><table><tr><td>اسم المستلم: ................................</td><td>التاريخ: ........ / ........ / ................</td><td>التوقيع: ................................</td></tr></table></div>`;
}

export function buildDepartmentFormReportHtml(item, exportedAt) {
  const labels = {
    reason: "السبب", requestedAction: "الإجراء المطلوب", notes: "ملاحظات", requestKind: "نوع الطلب",
    guardianName: "اسم ولي الأمر", guardianPersonalNo: "الرقم الشخصي لولي الأمر", guardianPhone: "رقم التواصل",
    currentPlacement: "الوضع الحالي", requestedPlacement: "الوضع المطلوب",
    guidanceOpinion: "رأي الإرشاد الأكاديمي والتوجيه المهني", socialOpinion: "رأي الإرشاد الاجتماعي",
    registrationOpinion: "رأي التسجيل", finalDecision: "قرار إدارة المدرسة", address: "العنوان",
    subject: "الموضوع", consentText: "نص الموافقة", guardianResponse: "رد ولي الأمر",
    responseDate: "تاريخ الرد", signature: "التوقيع/الإقرار",
  };
  const values = { section: "تغيير شعبة", specialization: "تحويل تخصص", pending: "بانتظار الرد", approved: "موافق", declined: "غير موافق" };
  const statuses = { pending: "بانتظار الإجراء", in_progress: "قيد الإجراء", completed: "مكتملة", rejected: "مرفوضة" };
  const student = item.student || {};
  const fields = item.fields || {};
  const fieldLabel = (key) => {
    if (item.kind === "section_change" && key === "reason") return "سبب الطلب";
    if (item.kind === "referral" && key === "reason") return "سبب التحويل وملخص الحالة";
    if (item.kind === "section_change" && key === "socialOpinion") return "رأي قسم الإرشاد الاجتماعي (للحالات الخاصة والمرضية)";
    if (item.kind === "section_change" && key === "registrationOpinion") return "رأي قسم التسجيل";
    if (item.kind === "section_change" && key === "finalDecision") return "قرار إدارة المدرسة النهائي";
    return labels[key] || key;
  };
  const requiredKeys = DEPARTMENT_FORM_FIELD_ORDER[item.kind] || [];
  const extraKeys = Object.keys(fields).filter((key) => key !== "createdDate" && !requiredKeys.includes(key));
  const rows = [...requiredKeys, ...extraKeys].map((key) => {
    const value = values[fields[key]] || fields[key] || "";
    return `<tr><th>${esc(fieldLabel(key))}</th><td class="${value ? "" : "blank-value"}">${value ? esc(value) : "&nbsp;"}</td></tr>`;
  }).join("");
  return `
    <h1>${esc(item.title || "استمارة القسم")}</h1>
    <p class="meta">تاريخ الطلب: ${esc(item.createdDate || "—")} — تاريخ التصدير: ${esc(exportedAt)}</p>
    <h2>بيانات الطالب</h2>
    <table>
      <tr><th>اسم الطالب</th><td>${esc(student.name)}</td><th>الرقم الأكاديمي</th><td>${esc(student.academicId || "—")}</td></tr>
      <tr><th>الرقم الشخصي</th><td>${esc(student.civilId || "—")}</td><th>المستوى والشعبة</th><td>${esc(student.level || "—")} / ${esc(student.section || "—")}</td></tr>
      <tr><th>المسار/التخصص</th><td colspan="3">${esc(student.track || student.specialization || "—")}</td></tr>
      <tr><th>المعدل التراكمي النهائي</th><td colspan="3">${student.finalCumulativeAverage == null ? "—" : `${esc(student.finalCumulativeAverage)}٪`}</td></tr>
    </table>
    <h2>بيانات الاستمارة</h2><table>${rows || '<tr><td>لا توجد بيانات إضافية</td></tr>'}</table>
    ${item.feedback || item.feedbackDate ? `<h2>الإجراء والتغذية الراجعة</h2><table><tr><th>الحالة</th><td>${esc(statuses[item.status] || item.status || "—")}</td><th>تاريخ الرد</th><td>${esc(item.feedbackDate || "—")}</td></tr><tr><th>التغذية الراجعة</th><td colspan="3">${esc(item.feedback || "—")}</td></tr></table>` : ""}
    ${departmentFormWorkflow(item)}
    ${departmentFormEntryFooter(item)}`;
}

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
