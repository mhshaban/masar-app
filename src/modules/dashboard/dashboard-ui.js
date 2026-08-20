import { getAgendaProgressSummary } from "../agenda/agenda-service.js";
import { listReminders, addReminder, toggleReminder, removeReminder, isOverdue, isDueToday } from "../reminders/reminders-service.js";
import { listStudentsNeedingAttention, NEED_LABELS } from "./followup-needs-service.js";
import { listStaleOpenCases } from "../cases/guidance-service.js";
import { listOverdueActions } from "../support/support-service.js";

const NEED_TARGET_VIEW = { case: "cases", support: "support", career: "career", promoted: "promoted" };

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// نُسخة "التذكيرات" كاملة (عرض + إضافة + تبديل/حذف) منقولة داخل الرئيسية —
// لم تعد شاشة مستقلة، فالمستخدم ما يحتاج يتنقل لتبويب ثانٍ عشان تذكيراته.
async function renderRemindersCard(root) {
  const reminders = await listReminders();

  root.innerHTML = `
    <div class="card-head"><h3>التذكيرات</h3></div>
    <form id="dashboard-reminder-form" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:14px;">
      <div style="flex:2; min-width:180px;">
        <label class="hint" style="display:block;margin-bottom:4px;">عنوان تذكير جديد</label>
        <input name="title" required placeholder="مثال: متابعة حالة الطالب..." style="width:100%; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
      </div>
      <div>
        <label class="hint" style="display:block;margin-bottom:4px;">تاريخ الاستحقاق</label>
        <input name="dueDate" type="date" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
      </div>
      <button class="btn btn-primary" type="submit">إضافة</button>
    </form>
    <div id="dashboard-reminders-list"></div>
  `;

  const drawList = () => {
    const listRoot = root.querySelector("#dashboard-reminders-list");
    if (!reminders.length) {
      listRoot.innerHTML = '<p class="hint">لا توجد تذكيرات بعد — أضف أول تذكير من الأعلى.</p>';
      return;
    }
    listRoot.innerHTML = `<ul class="plain">${reminders.map((r) => {
      const overdue = isOverdue(r);
      const dueToday = isDueToday(r);
      const badge = r.status === "done"
        ? '<span class="pill pill-success">منجز</span>'
        : overdue
          ? '<span class="pill pill-critical">متأخر</span>'
          : dueToday
            ? '<span class="pill pill-warning">اليوم</span>'
            : r.dueDate
              ? `<span class="pill pill-neutral">${esc(r.dueDate)}</span>`
              : '<span class="pill pill-neutral">بلا تاريخ</span>';
      return `
        <li class="row-item" data-id="${esc(r.id)}">
          <button class="box" data-action="toggle" aria-label="تبديل الحالة" style="width:20px;height:20px;border:1.5px solid var(--border);border-radius:6px;flex:0 0 auto;background:${r.status === "done" ? "var(--success)" : "transparent"};color:#fff;border-color:${r.status === "done" ? "var(--success)" : "var(--border)"};cursor:pointer;">${r.status === "done" ? "✓" : ""}</button>
          <div class="body">
            <div class="title" style="${r.status === "done" ? "text-decoration:line-through;color:var(--ink-500);" : ""}">${esc(r.title)}</div>
          </div>
          ${badge}
          <button class="link-btn" data-action="delete" aria-label="حذف" style="color:var(--critical);">حذف</button>
        </li>`;
    }).join("")}</ul>`;

    listRoot.querySelectorAll("[data-action='toggle']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest("[data-id]").dataset.id;
        await toggleReminder(reminders.find((r) => r.id === id));
        await renderRemindersCard(root);
      });
    });
    listRoot.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.closest("[data-id]").dataset.id;
        await removeReminder(id);
        await renderRemindersCard(root);
      });
    });
  };
  drawList();

  root.querySelector("#dashboard-reminder-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await addReminder({ title: form.title.value, dueDate: form.dueDate.value });
      form.reset();
      await renderRemindersCard(root);
    } catch (err) {
      alert(err.message);
    }
  });
}

export async function mountDashboardView(container, { onGoto }) {
  const [agenda, attentionRows, staleCases, overdueSupportActions] = await Promise.all([
    getAgendaProgressSummary(),
    listStudentsNeedingAttention(),
    listStaleOpenCases(),
    listOverdueActions(),
  ]);

  container.innerHTML = `
    <div class="topbar">
      <div><h1>مرحبًا بك في مسار</h1><div class="sub">مدرسة الشيخ عبدالله بن عيسى آل خليفة — قسم الإرشاد الأكاديمي والتوجيه المهني</div></div>
    </div>

    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">طلاب يحتاجون متابعة</div><div class="value">${attentionRows.length}</div></div>
      <div class="card stat"><div class="label">حالات إرشادية بلا متابعة حديثة</div><div class="value">${staleCases.length}</div></div>
      <div class="card stat"><div class="label">إجراءات دعم متأخرة</div><div class="value">${overdueSupportActions.length}</div></div>
      <div class="card stat"><div class="label">إجراءات خطة لم تبدأ</div><div class="value">${agenda.notStarted} <span style="font-size:13px; color:var(--ink-500);">من ${agenda.total}</span></div></div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-head">
        <h3>طلاب يحتاجون متابعة</h3>
        <span class="pill pill-critical">${attentionRows.length}</span>
      </div>
      <p class="hint">مُجمَّعة من ثلاث شاشات مستقلة (الحالات الإرشادية، خطط الدعم، التوجيه المهني) بحسب الطالب — قد يحتاج نفس الطالب أكثر من واحدة معًا.</p>
      ${attentionRows.length ? `
        <ul class="plain">
          ${attentionRows.slice(0, 8).map((row) => `
            <li class="row-item">
              <div class="body">
                <div class="title">${esc(row.student?.name) || row.studentId}</div>
                <div class="meta">${esc(row.student?.level) || ""} ${esc(row.student?.section) || ""}</div>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${row.needs.map((n) => `<button class="pill pill-warning" style="border:none; cursor:pointer;" data-goto="${esc(NEED_TARGET_VIEW[n.type])}">${esc(NEED_LABELS[n.type])}</button>`).join("")}
              </div>
            </li>
          `).join("")}
        </ul>
        ${attentionRows.length > 8 ? `<p class="hint" style="margin:10px 0 0;">و${attentionRows.length - 8} طالبًا آخرين...</p>` : ""}
      ` : '<p class="hint">لا يوجد طلاب مرشَّحون حاليًا.</p>'}
    </div>

    <div class="grid g2" style="margin-bottom:16px;">
      <div class="card">
        <div class="card-head"><h3>حالات إرشادية بلا متابعة حديثة</h3><button class="link-btn" data-goto="cases">فتح المتابعات والحالات</button></div>
        ${staleCases.length ? `
          <ul class="plain">
            ${staleCases.slice(0, 6).map((c) => `
              <li class="row-item">
                <div class="body">
                  <div class="title">${esc(c.studentName) || c.studentId}</div>
                  <div class="meta">${esc(c.category) || ""}</div>
                </div>
                <span class="pill pill-warning">${daysSince(c.lastActivity)} يومًا بلا متابعة</span>
              </li>
            `).join("")}
          </ul>
          ${staleCases.length > 6 ? `<p class="hint" style="margin:10px 0 0;">و${staleCases.length - 6} حالة أخرى...</p>` : ""}
        ` : '<p class="hint">كل الحالات المفتوحة تمت متابعتها مؤخرًا.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>إجراءات دعم متأخرة</h3><button class="link-btn" data-goto="support">فتح خطط الدعم</button></div>
        ${overdueSupportActions.length ? `
          <ul class="plain">
            ${overdueSupportActions.slice(0, 6).map((a) => `
              <li class="row-item">
                <div class="body">
                  <div class="title">${esc(a.plan?.studentName) || a.plan?.studentId || "—"}</div>
                  <div class="meta">${esc(a.action)}</div>
                </div>
                <span class="pill pill-critical">${esc(a.dueDate)}</span>
              </li>
            `).join("")}
          </ul>
          ${overdueSupportActions.length > 6 ? `<p class="hint" style="margin:10px 0 0;">و${overdueSupportActions.length - 6} إجراء آخر...</p>` : ""}
        ` : '<p class="hint">لا توجد إجراءات دعم متأخرة حاليًا.</p>'}
      </div>
    </div>

    <div class="card" id="dashboard-reminders"></div>
  `;

  container.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => onGoto(btn.dataset.goto));
  });

  await renderRemindersCard(container.querySelector("#dashboard-reminders"));
}
