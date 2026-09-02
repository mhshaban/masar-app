import {
  listPlans, getPlan, createPlan, completePlan, cancelPlan, reactivatePlan, removePlan,
  listActions, addAction, cycleActionStatus, removeAction, listCandidates,
} from "./support-service.js";
import { getStudent } from "../students/students-service.js";
import { mountStudentPicker } from "../shared/student-picker.js";
import { buildSupportPlansReportHtml } from "../../services/report-builders.js?v=2026-09-02-print-approval-1";
import { downloadAsWordDoc } from "../../services/word-export.js?v=2026-09-02-print-approval-1";

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

async function renderCandidates(root, onOpenNewPlan) {
  const candidates = await listCandidates();
  if (!candidates.length) {
    root.innerHTML = '<div class="card"><h2>مرشحون من الدرجات</h2><div class="empty">لا يوجد طلاب مرشَّحون حاليًا — يعتمد هذا على الدرجات المستوردة</div></div>';
    return;
  }
  const enriched = await Promise.all(candidates.slice(0, 15).map(async (c) => ({ ...c, student: await getStudent(c.studentId) })));
  root.innerHTML = `
    <div class="card">
      <h2>مرشحون من الدرجات (${candidates.length})</h2>
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
}

function renderNewPlanForm(root, prefill, onCreated) {
  root.innerHTML = `
    <div class="card">
      <h2>خطة دعم جديدة</h2>
      <div id="new-plan-picker"></div>
      <div id="new-plan-selected" class="hint">${prefill?.student ? `الطالب المحدد: ${esc(prefill.student.name)} (${esc(prefill.student.academicId)})` : ""}</div>
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
      root.querySelector("#new-plan-selected").textContent = `الطالب المحدد: ${student.name} (${student.academicId || student.id})`;
    },
  });

  root.querySelector("#new-plan-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) { alert("اختر طالبًا من نتائج البحث أولًا"); return; }
    const form = e.target;
    try {
      await createPlan({ studentId: selected.id, studentName: selected.name, domain: form.domain.value, goal: form.goal.value });
      await onCreated();
    } catch (err) {
      alert(err.message);
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
      alert(err.message);
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
      if (!confirm("حذف هذا الإجراء؟")) return;
      await removeAction(btn.dataset.remove);
      await refreshDetail();
    });
  });
}

async function renderPlanDetail(container, id, onBack) {
  const refresh = () => renderPlanDetail(container, id, onBack);
  const plan = await getPlan(id);
  if (!plan) {
    container.innerHTML = '<div class="card"><div class="empty">تعذّر إيجاد هذه الخطة</div></div>';
    return;
  }

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
        <button class="btn btn-ghost" id="plan-delete" style="color:var(--critical);">حذف</button>
      </div>
    </div>
    ${plan.goal ? `<div class="card" style="margin-bottom:16px;"><h2>الهدف</h2><p class="hint" style="margin:0;">${esc(plan.goal)}</p></div>` : ""}
    <div id="plan-actions"></div>
  `;

  container.querySelector("#plan-back").addEventListener("click", onBack);
  const completeBtn = container.querySelector("#plan-complete");
  if (completeBtn) completeBtn.addEventListener("click", async () => { await completePlan(id); await refresh(); });
  const cancelBtn = container.querySelector("#plan-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", async () => { await cancelPlan(id); await refresh(); });
  const reactivateBtn = container.querySelector("#plan-reactivate");
  if (reactivateBtn) reactivateBtn.addEventListener("click", async () => { await reactivatePlan(id); await refresh(); });
  container.querySelector("#plan-delete").addEventListener("click", async () => {
    if (!confirm("حذف هذه الخطة وكل إجراءاتها نهائيًا؟")) return;
    await removePlan(id);
    onBack();
  });

  await renderActions(container.querySelector("#plan-actions"), id, refresh);
}

export async function mountSupportView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>خطط الدعم الفردية</h1><div class="sub">خطة تدخل للطالب مع إجراءات متابَعة كقائمة مهام — مرشَّحة تلقائيًا من الدرجات المستوردة</div></div>
      <button class="btn btn-ghost" id="support-export-btn">تصدير Word</button>
    </div>
    <div id="support-candidates" style="margin-bottom:16px;"></div>
    <div id="support-new-form" style="margin-bottom:16px;"></div>
    <div id="support-table"></div>
  `;

  const openDetail = (id) => renderPlanDetail(container, id, () => mountSupportView(container));

  const showNewForm = (student, reason) => {
    renderNewPlanForm(container.querySelector("#support-new-form"), student ? { student, reason } : null, async () => {
      await mountSupportView(container);
    });
  };

  await renderCandidates(container.querySelector("#support-candidates"), showNewForm);
  showNewForm(null, null);
  await renderPlansTable(container.querySelector("#support-table"), openDetail);

  container.querySelector("#support-export-btn").addEventListener("click", async () => {
    const plans = await listPlans();
    const withActions = await Promise.all(plans.map(async (p) => ({ ...p, actions: await listActions(p.id) })));
    const html = buildSupportPlansReportHtml(withActions, new Date().toLocaleString("ar-BH"));
    downloadAsWordDoc("تقرير خطط الدعم الفردية", html, `تقرير-خطط-الدعم-${new Date().toISOString().slice(0, 10)}`);
  });
}
