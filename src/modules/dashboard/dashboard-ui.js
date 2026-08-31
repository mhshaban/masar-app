import { listReminders, addReminder, toggleReminder, removeReminder, isOverdue, isDueToday } from "../reminders/reminders-service.js";
import { NEED_LABELS } from "./followup-needs-service.js";
import { loadDashboardSnapshot } from "./dashboard-service.js?v=2026-08-31-priorities-2";

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

function planActionRow(entry, badge, badgeClass = "pill-warning") {
  return `<li class="row-item">
    <div class="body"><div class="title">${esc(entry.action) || "—"}</div><div class="meta">${esc(entry.project_title || entry.program_name || entry.pillar) || "خطة القسم"}</div></div>
    <span class="pill ${badgeClass}">${esc(badge)}</span>
  </li>`;
}

// نُسخة "التذكيرات" كاملة (عرض + إضافة + تبديل/حذف) منقولة داخل الرئيسية —
// لم تعد شاشة مستقلة، فالمستخدم ما يحتاج يتنقل لتبويب ثانٍ عشان تذكيراته.
async function renderRemindersCard(root) {
  const reminders = await listReminders();

  root.innerHTML = `
    <div class="card-head"><h2>التذكيرات</h2></div>
    <form id="dashboard-reminder-form" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:14px;">
      <div style="flex:2; min-width:180px;">
        <label class="hint" for="dashboard-reminder-title" style="display:block;margin-bottom:4px;">عنوان تذكير جديد</label>
        <input id="dashboard-reminder-title" name="title" required placeholder="مثال: متابعة حالة الطالب..." style="width:100%; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
      </div>
      <div>
        <label class="hint" for="dashboard-reminder-due" style="display:block;margin-bottom:4px;">تاريخ الاستحقاق</label>
        <input id="dashboard-reminder-due" name="dueDate" type="date" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
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
  const { agenda, attentionRows, attentionCount = attentionRows.length, staleCases, overdueSupportActions, planPriorities = { overdue: [], upcoming: [], undated: [] } } = await loadDashboardSnapshot();
  const todayLabel = new Intl.DateTimeFormat("ar-BH", { timeZone: "Asia/Bahrain", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const completionPct = agenda.total ? Math.round((agenda.done / agenda.total) * 100) : 0;
  const highPriorityRows = attentionRows.filter((row) => row.needs.length >= 3);

  container.innerHTML = `
    <div class="topbar">
      <div><h1>أولويات اليوم</h1><div class="sub">شنو يحتاجني اليوم؟ — ${esc(todayLabel)}</div></div>
    </div>

    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">أولوية عالية ظاهرة</div><div class="value">${highPriorityRows.length}</div></div>
      <div class="card stat"><div class="label">طلاب يحتاجون متابعة</div><div class="value">${attentionCount}</div></div>
      <div class="card stat"><div class="label">حالات إرشادية بلا متابعة حديثة</div><div class="value">${staleCases.length}</div></div>
      <div class="card stat"><div class="label">إجراءات دعم متأخرة</div><div class="value">${overdueSupportActions.length}</div></div>
      <div class="card stat"><div class="label">إنجاز خطة القسم</div><div class="value">${completionPct}%</div><div class="hint">${agenda.done} من ${agenda.total}</div></div>
      <div class="card stat"><div class="label">إجراءات الخطة المتأخرة</div><div class="value">${planPriorities.overdue.length}</div></div>
      <div class="card stat"><div class="label">قادمة خلال 14 يومًا</div><div class="value">${planPriorities.upcoming.length}</div></div>
      <div class="card stat"><div class="label">إجراءات بلا تاريخ</div><div class="value">${planPriorities.undated.length}</div></div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-head">
        <h2>طلاب يحتاجون متابعة</h2>
        <span class="pill pill-critical">${attentionCount}</span>
      </div>
      <p class="hint">اتحاد الاحتياج الأكاديمي والحالات وخطط الدعم والتوجيه المهني ومقررات الترفيع. الأولوية العالية تعني اجتماع 3 احتياجات مختلفة أو أكثر.</p>
      ${attentionRows.length ? `
        <ul class="plain">
          ${attentionRows.map((row) => `
            <li class="row-item">
              <div class="body">
                <div class="title">${esc(row.student?.name) || row.studentId}</div>
                <div class="meta">${esc(row.student?.level) || ""} ${esc(row.student?.section) || ""}</div>
                <div class="meta">${esc(row.needs.flatMap((need) => need.reasons || []).join(" · "))}</div>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${row.needs.length >= 3 ? '<span class="pill pill-critical">أولوية عالية</span>' : ""}
                ${row.needs.map((n) => `<button class="pill pill-warning" style="border:none; cursor:pointer;" data-goto="${esc(NEED_TARGET_VIEW[n.type])}">${esc(NEED_LABELS[n.type])}</button>`).join("")}
              </div>
            </li>
          `).join("")}
        </ul>
        ${attentionCount > attentionRows.length ? `<p class="hint" style="margin:10px 0 0;">و${attentionCount - attentionRows.length} طالبًا آخرين...</p>` : ""}
      ` : '<p class="hint">لا يوجد طلاب مرشَّحون حاليًا.</p>'}
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-head"><h2>أولويات خطة القسم</h2><button class="link-btn" data-goto="agenda">فتح الأجندة التنفيذية</button></div>
      <div class="grid g3">
        <div><h3>متأخرة (${planPriorities.overdue.length})</h3>${planPriorities.overdue.length ? `<ul class="plain">${planPriorities.overdue.slice(0, 6).map((entry) => planActionRow(entry, entry.periodEnd || entry.periodStart, "pill-critical")).join("")}</ul>` : '<p class="hint">لا توجد إجراءات متأخرة.</p>'}</div>
        <div><h3>قادمة خلال 14 يومًا (${planPriorities.upcoming.length})</h3>${planPriorities.upcoming.length ? `<ul class="plain">${planPriorities.upcoming.slice(0, 6).map((entry) => planActionRow(entry, entry.periodStart)).join("")}</ul>` : '<p class="hint">لا توجد إجراءات قادمة خلال 14 يومًا.</p>'}</div>
        <div><h3>بلا تاريخ (${planPriorities.undated.length})</h3>${planPriorities.undated.length ? `<ul class="plain">${planPriorities.undated.slice(0, 6).map((entry) => planActionRow(entry, "بلا تاريخ", "pill-neutral")).join("")}</ul>` : '<p class="hint">كل الإجراءات مجدولة.</p>'}</div>
      </div>
    </div>

    <div class="grid g2" style="margin-bottom:16px;">
      <div class="card">
        <div class="card-head"><h2>حالات إرشادية بلا متابعة حديثة</h2><button class="link-btn" data-goto="cases">فتح المتابعات والحالات</button></div>
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
        <div class="card-head"><h2>إجراءات دعم متأخرة</h2><button class="link-btn" data-goto="support">فتح خطط الدعم</button></div>
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
