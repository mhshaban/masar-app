import { listReminders, addReminder, toggleReminder, removeReminder, isOverdue, isDueToday } from "./reminders-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function renderList(container) {
  const listRoot = container.querySelector("#reminders-list");
  const reminders = await listReminders();

  if (!reminders.length) {
    listRoot.innerHTML = '<div class="empty">لا توجد تذكيرات بعد — أضف أول تذكير من الأعلى</div>';
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
          ${r.note ? `<div class="meta">${esc(r.note)}</div>` : ""}
        </div>
        ${badge}
        <button class="link-btn" data-action="delete" aria-label="حذف" style="color:var(--critical);">حذف</button>
      </li>`;
  }).join("")}</ul>`;

  listRoot.querySelectorAll("[data-action='toggle']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("[data-id]").dataset.id;
      const reminder = reminders.find((r) => r.id === id);
      await toggleReminder(reminder);
      renderList(container);
    });
  });
  listRoot.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("[data-id]").dataset.id;
      await removeReminder(id);
      renderList(container);
    });
  });
}

export async function mountRemindersView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>التذكيرات</h1><div class="sub">مهامك الشخصية ومواعيد المتابعة — تُدار يدويًا حاليًا</div></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3>تذكير جديد</h3>
      <form id="reminder-form" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
        <div style="flex:2; min-width:200px;">
          <label class="hint" style="display:block;margin-bottom:4px;">العنوان</label>
          <input name="title" required placeholder="مثال: متابعة حالة الطالب..." style="width:100%; padding:10px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <div>
          <label class="hint" style="display:block;margin-bottom:4px;">تاريخ الاستحقاق</label>
          <input name="dueDate" type="date" style="padding:10px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <button class="btn btn-primary" type="submit">إضافة</button>
      </form>
    </div>
    <div class="card"><div id="reminders-list"></div></div>
  `;

  container.querySelector("#reminder-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const title = form.title.value;
    const dueDate = form.dueDate.value;
    try {
      await addReminder({ title, dueDate });
      form.reset();
      await renderList(container);
    } catch (err) {
      alert(err.message);
    }
  });

  await renderList(container);
}
