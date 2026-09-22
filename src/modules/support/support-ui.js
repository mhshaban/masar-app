import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import {
  listPlans, getPlan, createPlan, completePlan, cancelPlan, reactivatePlan, removePlan,
  listActions, addAction, cycleActionStatus, removeAction, listCandidates,
} from "./support-service.js?v=2026-09-14-cumulative-average-fix-1";
import { getStudent } from "../students/students-service.js";
import { mountStudentPicker } from "../shared/student-picker.js?v=2026-09-22-student-context-1";
import { loadAcademicFlagsMap, studentQuickInfo, studentQuickCard } from "../shared/student-quick-info.js";
import { buildSupportPlansReportHtml } from "../../services/report-builders.js?v=2026-09-17-attendance-checkbox-1";
import { downloadAsWordDoc } from "../../services/word-export.js?v=2026-09-13-landscape-export-1";
import { ensureXlsx } from "../../services/vendor-loader.js?v=2026-09-07-academic-fix-1";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function planStatusPill(status) {
  if (status === "completed") return '<span class="pill pill-success">مكتملة</span>';
  if (status === "cancelled") return '<span class="pill pill-neutral">مُلغاة</span>';
  return '<span class="pill pill-warning">نشطة</span>';
}

const PLAN_STATUS_LABELS = { active: "نشطة", completed: "مكتملة", cancelled: "مُلغاة" };

async function exportPlansExcel(plans) {
  if (!plans.length) throw new Error("لا توجد خطط دعم لتصديرها");
  const XLSX = await ensureXlsx();
  const rows = plans.map((p) => ({
    "اسم الطالب": p.studentName || p.studentId || "",
    "الرقم الأكاديمي": p.studentId || "",
    "المجال": p.domain || "",
    "الهدف": p.goal || "",
    "الحالة": PLAN_STATUS_LABELS[p.status] || p.status || "",
    "تاريخ البدء": p.startDate || "",
    "تاريخ الإكمال": p.completedDate || "",
    "ملاحظات": p.notes || "",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0]).map((key) => ({ wch: Math.min(45, Math.max(12, key.length + 3, ...rows.map((row) => String(row[key] || "").length + 2))) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "خطط الدعم");
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(workbook, `خطط-الدعم-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  await logAuditEvent("export_excel", { tableName: "supportPlans", count: plans.length });
}

async function exportCandidatesExcel(candidates) {
  if (!candidates.length) throw new Error("لا يوجد طلاب مرشَّحون لتصديرهم");
  const XLSX = await ensureXlsx();
  const enriched = await Promise.all(candidates.map(async (c) => ({ ...c, student: await getStudent(c.studentId) })));
  const rows = enriched.map((c) => ({
    "اسم الطالب": c.student?.name || c.studentId || "",
    "الرقم الأكاديمي": c.student?.academicId || c.studentId || "",
    "المستوى": c.student?.level || "",
    "الشعبة": c.student?.section || "",
    "المعدل العام": c.avgPct ?? "",
    "أسباب الترشيح": c.reasons.join(" · "),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0]).map((key) => ({ wch: Math.min(45, Math.max(12, key.length + 3, ...rows.map((row) => String(row[key] || "").length + 2))) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "مرشحون من الدرجات");
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(workbook, `مرشحون-من-الدرجات-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  await logAuditEvent("export_excel", { tableName: "supportCandidates", count: candidates.length });
}

async function renderCandidates(root, onOpenNewPlan) {
  const candidates = await listCandidates();
  if (!candidates.length) {
    root.innerHTML = '<div class="card"><h2>مرشحون من الدرجات</h2><div class="empty">لا يوجد طلاب مرشَّحون حاليًا — يعتمد هذا على الدرجات المستوردة</div></div>';
    return;
  }
  const enriched = await Promise.all(candidates.slice(0, 15).map(async (c) => ({ ...c, student: await getStudent(c.studentId) })));
  root.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>مرشحون من الدرجات (${candidates.length})</h2>
        <button class="btn btn-ghost" id="candidates-export-excel-btn" type="button">تصدير Excel</button>
      </div>
      <p class="hint">طلاب معدلهم العام أو إحدى موادهم أقل من الحد الأدنى، وليس لديهم خطة دعم نشطة بعد.</p>
      <ul class="plain">
        ${enriched.map((c) => `
          <li class="row-item">
            <div class="body">
              <div class="title">${esc(c.student?.name) || c.studentId}</div>
              <div class="meta">${c.reasons.map(esc).join(" · ")}</div>
            </div>
            <button class="btn btn-ghost" data-open-plan="${esc(c.studentId)}">إنشاء خطة دعم</button>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
  root.querySelectorAll("[data-open-plan]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const c = enriched.find((c) => c.studentId === btn.dataset.openPlan);
      onOpenNewPlan(c.student, c.reasons.join(" · "));
    });
  });
  root.querySelector("#candidates-export-excel-btn").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "جارٍ إعداد الملف…";
    try {
      await exportCandidatesExcel(candidates);
    } catch (error) {
      notify(error.message || "تعذر تصدير ملف Excel");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}

async function renderNewPlanForm(root, prefill, onCreated) {
  const flagsMap = await loadAcademicFlagsMap();
  root.innerHTML = `
    <div class="card">
      <h2>خطة دعم جديدة</h2>
      <div id="new-plan-picker"></div>
      <div id="new-plan-selected">${studentQuickCard(prefill?.student || null, prefill?.student ? studentQuickInfo(prefill.student, flagsMap) : null)}</div>
      <form id="new-plan-form" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input name="domain" placeholder="المجال/المادة (مثال: الرياضيات)" style="flex:1; min-width:200px; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <textarea name="goal" rows="2" placeholder="هدف الخطة" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit; resize:vertical;">${esc(prefill?.reason) || ""}</textarea>
        <div><button class="btn btn-primary" type="submit">بدء الخطة</button></div>
      </form>
    </div>
  `;

  let selected = prefill?.student || null;
  mountStudentPicker(root.querySelector("#new-plan-picker"), {
    onSelect: (student) => {
      selected = student;
      root.querySelector("#new-plan-selected").innerHTML = studentQuickCard(student, studentQuickInfo(student, flagsMap));
    },
  });

  root.querySelector("#new-plan-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) { notify("اختر طالبًا من نتائج البحث أولًا"); return; }
    const form = e.target;
    try {
      await createPlan({ studentId: selected.id, studentName: selected.name, domain: form.domain.value, goal: form.goal.value });
      await onCreated();
    } catch (err) {
      notify(err.message);
    }
  });
}

async function renderPlansTable(root, onOpen) {
  const plans = await listPlans();
  if (!plans.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد خطط دعم بعد</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>الطالب</th><th>المجال</th><th>الحالة</th><th>تاريخ البدء</th></tr></thead>
        <tbody>
          ${plans.map((p) => `
            <tr data-id="${esc(p.id)}">
              <td>${esc(p.studentName) || esc(p.studentId)}</td>
              <td>${esc(p.domain) || "—"}</td>
              <td>${planStatusPill(p.status)}</td>
              <td class="num">${esc(p.startDate) || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
    </div>
  `;
  root.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => onOpen(tr.dataset.id));
  });
}

async function renderActions(root, planId, refreshDetail) {
  const actions = await listActions(planId);
  const doneCount = actions.filter((a) => a.status === "done").length;
  root.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>إجراءات الخطة</h2>
        ${actions.length ? `<span class="pill pill-neutral">${doneCount} / ${actions.length}</span>` : ""}
      </div>
      <form id="action-form" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:14px;">
        <div style="flex:1; min-width:220px;">
          <label class="hint" for="support-action-text" style="display:block;margin-bottom:4px;">إجراء جديد</label>
          <input id="support-action-text" name="action" required style="width:100%; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <div>
          <label class="hint" for="support-action-due" style="display:block;margin-bottom:4px;">تاريخ الاستحقاق</label>
          <input id="support-action-due" name="dueDate" type="date" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <button class="btn btn-primary" type="submit">إضافة</button>
      </form>
      ${actions.length ? actions.map((a) => `
        <div class="action-item${a.status === "done" ? " done" : ""}" data-action-id="${esc(a.id)}">
          <div class="box" data-toggle="${esc(a.id)}" style="cursor:pointer; background:${a.status === "ongoing" ? "var(--warning-bg)" : ""};">${a.status === "done" ? "✓" : ""}</div>
          <div class="t">${esc(a.action)}${a.dueDate ? ` <span class="hint">(${esc(a.dueDate)})</span>` : ""}${a.status === "ongoing" ? ' <span class="pill pill-warning">قيد التنفيذ</span>' : ""}</div>
          <button class="link-btn" data-remove="${esc(a.id)}" style="color:var(--critical);">حذف</button>
        </div>
      `).join("") : '<div class="empty">لا توجد إجراءات مسجَّلة بعد</div>'}
    </div>
  `;

  root.querySelector("#action-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await addAction(planId, { action: form.action.value, dueDate: form.dueDate.value });
      await refreshDetail();
    } catch (err) {
      notify(err.message);
    }
  });
  root.querySelectorAll("[data-toggle]").forEach((box) => {
    box.addEventListener("click", async () => {
      await cycleActionStatus(box.dataset.toggle);
      await refreshDetail();
    });
  });
  root.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("حذف هذا الإجراء؟")) return;
      await removeAction(btn.dataset.remove);
      await refreshDetail();
    });
  });
}

const PLAN_ACTION_STATUS_LABELS = { not_started: "لم يبدأ", ongoing: "قيد التنفيذ", done: "منجز" };

// طباعة خطة دعم واحدة (بياناتها + إجراءاتها) — نفس تقنية الطباعة المباشرة
// المعتمدة بالاستمارات وكشف حضور الفعالية (forms-ui.js).
function planDetailPrintMarkup(plan, actions) {
  return `<div class="forms-print" id="plan-printable">
    <div class="topbar"><div><h1>${esc(plan.domain) || "خطة دعم فردية"}</h1><div class="sub">${esc(plan.studentName) || esc(plan.studentId)}</div></div></div>
    <div class="card"><h2>بيانات الخطة</h2>
      <div class="tablewrap"><table>
        <tr><th>الطالب</th><td>${esc(plan.studentName) || esc(plan.studentId)}</td><th>المجال</th><td>${esc(plan.domain) || "—"}</td></tr>
        <tr><th>الحالة</th><td>${esc(PLAN_STATUS_LABELS[plan.status] || plan.status)}</td><th>تاريخ البدء</th><td>${esc(plan.startDate) || "—"}</td></tr>
        ${plan.completedDate ? `<tr><th>تاريخ الإكمال</th><td colspan="3">${esc(plan.completedDate)}</td></tr>` : ""}
      </table></div>
    </div>
    ${plan.goal ? `<div class="card"><h2>الهدف</h2><p>${esc(plan.goal)}</p></div>` : ""}
    <div class="card"><h2>إجراءات الخطة</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>الإجراء</th><th>تاريخ الاستحقاق</th><th>الحالة</th></tr></thead>
        <tbody>${actions.length ? actions.map((a) => `<tr><td>${esc(a.action)}</td><td>${esc(a.dueDate) || "—"}</td><td>${esc(PLAN_ACTION_STATUS_LABELS[a.status] || a.status)}</td></tr>`).join("") : '<tr><td colspan="3">لا توجد إجراءات مسجَّلة</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

async function printPlanDirect(plan, actions) {
  const popup = window.open("", "_blank");
  if (!popup) { notify("اسمح بفتح نافذة الطباعة في المتصفح."); return; }
  popup.document.body.textContent = "جارٍ تجهيز الخطة للطباعة…";
  try {
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(plan.domain) || "خطة دعم فردية"}</title></head><body><main id="plan-print-root"></main></body></html>`);
    popup.document.close();
    popup.document.documentElement.dataset.theme = document.documentElement.dataset.theme || "light";
    const root = popup.document.getElementById("plan-print-root");
    root.innerHTML = planDetailPrintMarkup(plan, actions);
    const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map((source) => new Promise((resolve, reject) => {
      const link = popup.document.createElement("link");
      link.rel = "stylesheet";
      link.href = source.href;
      link.onload = resolve;
      link.onerror = () => reject(new Error("تعذّر تحميل تنسيق الطباعة؛ حاول مرة ثانية."));
      popup.document.head.appendChild(link);
    }));
    for (const source of document.querySelectorAll("style")) popup.document.head.appendChild(source.cloneNode(true));
    await Promise.all(styles);
    if (popup.closed) return;
    await Promise.all([400, 600, 700, 800].map((weight) => popup.document.fonts.load(`${weight} 12px "Cairo"`, "بيانات الطالب")));
    await popup.document.fonts.ready;
    if (popup.closed) return;
    popup.requestAnimationFrame(() => { if (!popup.closed) { popup.focus(); popup.print(); } });
  } catch (error) { if (!popup.closed) popup.close(); notify(error.message || "تعذّرت طباعة الخطة."); }
}

async function renderPlanDetail(container, id, onBack, onGoto) {
  const refresh = () => renderPlanDetail(container, id, onBack, onGoto);
  const plan = await getPlan(id);
  if (!plan) {
    container.innerHTML = '<div class="card"><div class="empty">تعذّر إيجاد هذه الخطة</div></div>';
    return;
  }
  const [student, flagsMap] = await Promise.all([getStudent(plan.studentId), loadAcademicFlagsMap()]);

  container.innerHTML = `
    <button class="backlink" id="plan-back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>
      رجوع لخطط الدعم
    </button>
    <div class="topbar">
      <div>
        <h1>${esc(plan.studentName) || esc(plan.studentId)}</h1>
        <div class="sub">${esc(plan.domain) || "بلا مجال محدد"} · بدأت ${esc(plan.startDate) || "—"}${plan.completedDate ? ` · أُنهيت ${esc(plan.completedDate)}` : ""}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        ${planStatusPill(plan.status)}
        ${plan.status === "active" ? `
          <button class="btn btn-ghost" id="plan-complete">إنهاء كمكتملة</button>
          <button class="btn btn-ghost" id="plan-cancel">إلغاء</button>
        ` : '<button class="btn btn-ghost" id="plan-reactivate">إعادة تفعيل</button>'}
        <button class="btn btn-ghost" id="plan-print">طباعة</button>
        <button class="btn btn-ghost" id="plan-delete" style="color:var(--critical);">حذف</button>
      </div>
    </div>
    ${student ? studentQuickCard(student, studentQuickInfo(student, flagsMap)) : ""}
    ${student && onGoto ? '<div style="margin:-8px 0 16px;"><button class="link-btn" id="plan-open-profile">فتح ملف الطالب</button></div>' : ""}
    ${plan.goal ? `<div class="card" style="margin-bottom:16px;"><h2>الهدف</h2><p class="hint" style="margin:0;">${esc(plan.goal)}</p></div>` : ""}
    <div id="plan-actions"></div>
  `;

  container.querySelector("#plan-back").addEventListener("click", onBack);
  const profileBtn = container.querySelector("#plan-open-profile");
  if (profileBtn) profileBtn.addEventListener("click", () => onGoto("students", { studentId: student.id }));
  const completeBtn = container.querySelector("#plan-complete");
  if (completeBtn) completeBtn.addEventListener("click", async () => { await completePlan(id); await refresh(); });
  const cancelBtn = container.querySelector("#plan-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", async () => { await cancelPlan(id); await refresh(); });
  const reactivateBtn = container.querySelector("#plan-reactivate");
  if (reactivateBtn) reactivateBtn.addEventListener("click", async () => { await reactivatePlan(id); await refresh(); });
  container.querySelector("#plan-print").addEventListener("click", async () => {
    const actions = await listActions(id);
    await printPlanDirect(plan, actions);
  });
  container.querySelector("#plan-delete").addEventListener("click", async () => {
    if (!await confirmDialog("حذف هذه الخطة وكل إجراءاتها نهائيًا؟")) return;
    await removePlan(id);
    onBack();
  });

  await renderActions(container.querySelector("#plan-actions"), id, refresh);
}

// options.planId/studentId: نفس منطق deep-link بوحدة الحالات الإرشادية —
// راجع التعليق أعلى mountCasesView.
export async function mountSupportView(container, options = {}) {
  const onGoto = options.onGoto;
  const openDetail = (id) => renderPlanDetail(container, id, () => mountSupportView(container, { onGoto }), onGoto);

  if (options.planId) { await openDetail(options.planId); return; }

  let prefillStudent = null;
  if (options.studentId) {
    const plans = await listPlans();
    const existing = plans.find((p) => String(p.studentId) === String(options.studentId) && p.status === "active");
    if (existing) { await openDetail(existing.id); return; }
    prefillStudent = await getStudent(options.studentId);
  }

  container.innerHTML = `
    <div class="topbar">
      <div><h1>خطط الدعم الفردية</h1><div class="sub">خطة تدخل للطالب مع إجراءات متابَعة كقائمة مهام</div></div>
      <div class="forms-actions"><button class="btn btn-ghost" id="support-export-excel-btn">تصدير Excel</button><button class="btn btn-ghost" id="support-export-btn">تصدير Word</button></div>
    </div>
    <div id="support-new-form" style="margin-bottom:16px;"></div>
    <div id="support-table" style="margin-bottom:16px;"></div>
    <div id="support-candidates"></div>
  `;

  const showNewForm = (student, reason) => {
    renderNewPlanForm(container.querySelector("#support-new-form"), student ? { student, reason } : null, async () => {
      await mountSupportView(container, { onGoto });
    });
    if (student) container.querySelector("#support-new-form").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  showNewForm(prefillStudent, null);
  await renderPlansTable(container.querySelector("#support-table"), openDetail);
  await renderCandidates(container.querySelector("#support-candidates"), showNewForm);

  container.querySelector("#support-export-btn").addEventListener("click", async () => {
    const plans = await listPlans();
    const withActions = await Promise.all(plans.map(async (p) => ({ ...p, actions: await listActions(p.id) })));
    const html = buildSupportPlansReportHtml(withActions, new Date().toLocaleString("ar-BH"));
    downloadAsWordDoc("تقرير خطط الدعم الفردية", html, `تقرير-خطط-الدعم-${new Date().toISOString().slice(0, 10)}`);
  });

  container.querySelector("#support-export-excel-btn").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "جارٍ إعداد الملف…";
    try {
      await exportPlansExcel(await listPlans());
    } catch (error) {
      notify(error.message || "تعذر تصدير ملف Excel");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}
