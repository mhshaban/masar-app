import { listReminders, addReminder, toggleReminder, removeReminder, isOverdue, isDueToday } from "../reminders/reminders-service.js";
import { NEED_LABELS } from "./followup-needs-service.js";
import { loadDashboardSnapshot } from "./dashboard-service.js?v=2026-08-31-daily-priorities-1";
import { connectMasarFolder, refreshMasarFolder, folderAccessSupported, priorityScore, priorityLevel } from "./dashboard-local-folder.js?v=2026-09-01-priorities-4";
import { markPriorityReviewed, snoozePriority, priorityDecisionState, clearPriorityDecision } from "./dashboard-priority-state.js?v=2026-08-31-priorities-3";
import { downloadAsWordDoc } from "../../services/word-export.js";

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

function planActionRow(entry, badge, badgeClass = "pill-warning", decisionKey = null) {
  return `<li class="row-item">
    <div class="body"><div class="title">${esc(entry.action) || "—"}</div><div class="meta">${esc(entry.project_title || entry.program_name || entry.pillar) || "خطة القسم"}</div></div>
    <span class="pill ${badgeClass}">${esc(badge)}</span>
    <button class="link-btn" data-goto="agenda">فتح</button>
    ${decisionKey ? decisionControls(decisionKey) : ""}
  </li>`;
}

function decisionControls(key) {
  return `<div class="priority-actions">
    <button class="link-btn" data-priority-review="${esc(key)}">تمت المراجعة</button>
    <button class="link-btn" data-priority-snooze="${esc(key)}">تأجيل</button>
  </div>`;
}

function isVisiblePriority(key) { return !priorityDecisionState(key).hidden; }

function priorityLabel(score) {
  const level = priorityLevel(score);
  if (level === "high") return '<span class="pill pill-critical">أولوية عالية</span>';
  if (level === "medium") return '<span class="pill pill-warning">أولوية متوسطة</span>';
  return '<span class="pill pill-neutral">متابعة عادية</span>';
}

function dailyReportHtml(snapshot, generatedAt, reminders = []) {
  const { attentionRows = [], staleCases = [], overdueSupportActions = [], planPriorities = {} } = snapshot;
  const rows = attentionRows.filter((r) => isVisiblePriority(`student:${r.studentId}`)).map((r) => `<tr><td>${esc(r.student?.name || r.studentId)}</td><td>${priorityScore(r.needs)}</td><td>${esc(r.needs.flatMap((n) => n.reasons || []).join("؛ "))}</td></tr>`).join("");
  const planRows = [...(planPriorities.overdue || []), ...(planPriorities.upcoming || [])].filter((r) => isVisiblePriority(`plan:${r.id}`)).map((r) => `<tr><td>${esc(r.project_title || r.program_name || r.pillar)}</td><td>${esc(r.action)}</td><td>${esc(r.period_end || r.periodEnd || r.period_start || r.periodStart || "—")}</td></tr>`).join("");
  return `<h1>تقرير أولويات اليوم</h1><p class="meta">تاريخ الإنشاء: ${esc(generatedAt)} — المصدر: ${snapshot.source === "onedrive-local" ? "مجلد مسار المحلي في OneDrive" : "GUIDE / Supabase (استعلام مخفف)"}</p>
    <h2>الطلاب الأعلى أولوية</h2><table><tr><th>الطالب</th><th>الدرجة</th><th>الأسباب</th></tr>${rows || '<tr><td colspan="3">لا توجد أولويات ظاهرة</td></tr>'}</table>
    <h2>الحالات الإرشادية المتأخرة</h2><table><tr><th>الطالب</th><th>الفئة</th><th>آخر متابعة</th></tr>${staleCases.filter((r) => isVisiblePriority(`case:${r.id}`)).map((r) => `<tr><td>${esc(r.studentName || r.studentId)}</td><td>${esc(r.category)}</td><td>${esc(r.lastActivity)}</td></tr>`).join("") || '<tr><td colspan="3">لا توجد</td></tr>'}</table>
    <h2>إجراءات الدعم المتأخرة</h2><table><tr><th>الطالب</th><th>الإجراء</th><th>الاستحقاق</th></tr>${overdueSupportActions.filter((r) => isVisiblePriority(`support:${r.id}`)).map((r) => `<tr><td>${esc(r.plan?.studentName || r.plan?.studentId)}</td><td>${esc(r.action)}</td><td>${esc(r.dueDate)}</td></tr>`).join("") || '<tr><td colspan="3">لا توجد</td></tr>'}</table>
    <h2>إجراءات خطة القسم</h2><table><tr><th>المشروع</th><th>الإجراء</th><th>التاريخ</th></tr>${planRows || '<tr><td colspan="3">لا توجد</td></tr>'}</table>
    <h2>تذكيرات اليوم والمتأخرة</h2><table><tr><th>التذكير</th><th>تاريخ الاستحقاق</th><th>الحالة</th></tr>${reminders.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.dueDate || "—")}</td><td>${isOverdue(r) ? "متأخر" : "اليوم"}</td></tr>`).join("") || '<tr><td colspan="3">لا توجد</td></tr>'}</table>`;
}

function printDailyReport(html) {
  const w = window.open("", "_blank");
  if (!w) return alert("اسمح بالنوافذ المنبثقة لإتمام الطباعة");
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>أولويات اليوم</title><style>body{font-family:Cairo,Arial,sans-serif;padding:24px;direction:rtl}table{width:100%;border-collapse:collapse;margin:12px 0 22px}th,td{border:1px solid #999;padding:7px;text-align:right}th{background:#1a2744;color:#fff}h1,h2{color:#1a2744}.meta{color:#666}</style></head><body>${html}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 200);
}

// نُسخة "التذكيرات" كاملة (عرض + إضافة + تبديل/حذف) منقولة داخل الرئيسية —
// لم تعد شاشة مستقلة، فالمستخدم ما يحتاج يتنقل لتبويب ثانٍ عشان تذكيراته.
async function renderRemindersCard(root) {
  const allReminders = await listReminders();
  const reminders = allReminders.filter((r) => r.status !== "done" && (isDueToday(r) || isOverdue(r)));

  root.innerHTML = `
      <div class="card-head"><h2>تذكيرات اليوم والمتأخرة</h2><span class="pill pill-warning">${reminders.length}</span></div>
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
      listRoot.innerHTML = '<p class="hint">لا توجد تذكيرات مستحقة اليوم أو متأخرة.</p>';
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
  const snapshot = await loadDashboardSnapshot();
  const { agenda, attentionRows, attentionCount = attentionRows.length, totalStudents = 0, attentionBreakdown = {}, academicWeak = [], promotedTop = [], planSummary = {}, staleCases, overdueSupportActions, planPriorities = { overdue: [], upcoming: [], undated: [] } } = snapshot;
  const todayLabel = new Intl.DateTimeFormat("ar-BH", { timeZone: "Asia/Bahrain", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const completionPct = agenda.total ? Math.round((agenda.done / agenda.total) * 100) : 0;
  const visibleAttentionRows = attentionRows.filter((row) => isVisiblePriority(`student:${row.studentId}`));
  const visibleStaleCases = staleCases.filter((row) => isVisiblePriority(`case:${row.id}`));
  const visibleSupportActions = overdueSupportActions.filter((row) => isVisiblePriority(`support:${row.id}`));
  const highPriorityRows = visibleAttentionRows.filter((row) => priorityLevel(priorityScore(row.needs)) === "high");
  const highPriorityCount = Number(snapshot.highPriorityCount ?? highPriorityRows.length);
  const overduePlanCount = Number(planPriorities.overdueCount ?? planPriorities.overdue.length);
  const upcomingPlanCount = Number(planPriorities.upcomingCount ?? planPriorities.upcoming.length);
  const undatedPlanCount = Number(planPriorities.undatedCount ?? planPriorities.undated.length);
  const decidedItems = [
    ...attentionRows.map((r) => ({ key: `student:${r.studentId}`, label: r.student?.name || r.studentId })),
    ...staleCases.map((r) => ({ key: `case:${r.id}`, label: `حالة: ${r.studentName || r.studentId}` })),
    ...overdueSupportActions.map((r) => ({ key: `support:${r.id}`, label: `دعم: ${r.plan?.studentName || r.plan?.studentId || r.action}` })),
    ...[...(planPriorities.overdue || []), ...(planPriorities.upcoming || []), ...(planPriorities.undated || [])].map((r) => ({ key: `plan:${r.id}`, label: `الخطة: ${r.action}` })),
  ].filter((item, index, all) => all.findIndex((x) => x.key === item.key) === index)
    .map((item) => ({ ...item, ...priorityDecisionState(item.key) })).filter((item) => item.hidden);
  const dueReminders = (await listReminders()).filter((r) => r.status !== "done" && (isDueToday(r) || isOverdue(r)));
  const breakdown = {
    case: Number(attentionBreakdown.case ?? attentionRows.filter((r) => r.needs.some((n) => n.type === "case")).length),
    support: Number(attentionBreakdown.support ?? attentionRows.filter((r) => r.needs.some((n) => n.type === "support")).length),
    career: Number(attentionBreakdown.career ?? attentionRows.filter((r) => r.needs.some((n) => n.type === "career")).length),
    promoted: Number(attentionBreakdown.promoted ?? attentionRows.filter((r) => r.needs.some((n) => n.type === "promoted")).length),
  };
  const maxBreakdown = Math.max(1, ...Object.values(breakdown));
  const pillarRows = Object.entries(planSummary.pillarCounts || {}).sort((a, b) => b[1] - a[1]);

  container.innerHTML = `<div class="daily-dashboard">
    <header class="daily-hero">
      <div class="daily-hero-title"><span class="daily-accent" aria-hidden="true"></span><div><h1>شنو يحتاجني اليوم؟</h1><p>لوحة العمل اليومية — قراءة مباشرة من بيانات مسار الحقيقية</p></div></div>
      <div class="daily-hero-meta">
        <strong>${esc(todayLabel)} · قسم الإرشاد الأكاديمي والتوجيه المهني</strong>
        <span><i class="daily-status-dot"></i>${snapshot.source === "onedrive-local" ? "مجلد مسار المحلي في OneDrive" : "GUIDE / Supabase · استعلام مخفف"}</span>
        <small>${snapshot.source === "onedrive-local" ? `آخر نسخة: ${esc(snapshot.localFileName || "")} — ${esc(snapshot.sourceUpdatedAt || snapshot.localFileModifiedAt || "")}` : "قراءة خفيفة بلا تنزيل للمرفقات أو الصور"}</small>
      </div>
      <div class="daily-hero-actions">
        <button class="btn btn-ghost" id="folder-connect">${snapshot.source === "onedrive-local" ? "تحديث من المجلد" : "ربط مجلد مسار"}</button>
        <button class="btn btn-ghost" id="daily-word">تصدير Word</button><button class="btn btn-ghost" id="daily-print">طباعة</button>
      </div>
    </header>

    <div class="daily-section-title"><span>1</span><div><h2>شنو يحتاجني اليوم بخصوص الطلبة والحالات؟</h2><p>${totalStudents ? `من أصل ${totalStudents.toLocaleString("ar-BH")} طالبًا` : "قراءة موحدة من سجلات الطلبة والحالات والدعم والتوجيه المهني"}</p></div></div>

    <div class="grid g4 daily-stats" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">حالات إرشادية بلا متابعة حديثة</div><div class="value">${visibleStaleCases.length}</div></div>
      <div class="card stat"><div class="label">إجراءات دعم متأخرة</div><div class="value">${visibleSupportActions.length}</div></div>
      <div class="card stat"><div class="label">تذكيرات مستحقة</div><div class="value">${dueReminders.length}</div><div class="hint">اليوم أو متأخرة</div></div>
      <div class="card stat stat-warn"><div class="label">طلاب يحتاجون متابعة</div><div class="value">${attentionCount}</div><div class="hint">${totalStudents ? `${Math.round(attentionCount / totalStudents * 100)}٪ من الطلبة` : "من إشارات متعددة"}</div></div>
    </div>

    ${decidedItems.length ? `<details class="card daily-panel" style="margin-bottom:16px;"><summary>تمت مراجعتها أو تأجيلها (${decidedItems.length})</summary><ul class="plain" style="margin-top:12px;">${decidedItems.map((item) => `<li class="row-item"><div class="body"><div class="title">${esc(item.label)}</div><div class="meta">${item.decision.status === "reviewed" ? "تمت المراجعة اليوم" : `مؤجل إلى ${esc(item.decision.snoozedUntil)} — السبب: ${esc(item.decision.reason)}`}</div></div><button class="link-btn" data-priority-restore="${esc(item.key)}">إعادة للقائمة</button></li>`).join("")}</ul></details>` : ""}

    <div class="grid g2 daily-analysis-grid" style="margin-bottom:16px;">
      <div class="card daily-panel">
        <div class="card-head"><h2>مصدر الحاجة للمتابعة — ${attentionCount} طالبًا</h2></div>
        <p class="hint">قد يظهر الطالب في أكثر من إشارة؛ التجميع يمنع تكراره في العدد الإجمالي.</p>
        <div class="daily-bars">
          ${[["case", "مؤشر أكاديمي / حالة"], ["career", "بلا جلسة توجيه مهني"], ["promoted", "مقررات مرفّع لم تُجتز"], ["support", "يحتاج خطة دعم"]].map(([key, label]) => `<div class="daily-bar-row"><span>${label}</span><div><i style="width:${Math.max(2, breakdown[key] / maxBreakdown * 100)}%"></i></div><b>${breakdown[key]}</b></div>`).join("")}
        </div>
        ${breakdown.career ? `<div class="daily-note daily-note-info"><b>ملاحظة تفسيرية:</b> طلاب السنة النهائية بلا جلسة يظهرون كمرشحين للتخطيط المبكر، ولا يعني الرقم وحده وجود تعثر عاجل.</div>` : ""}
      </div>
      <div class="card daily-panel daily-student-panel">
      <div class="card-head">
          <h2>أولوية عالية — ${highPriorityCount} طالبًا</h2><span class="pill pill-critical">3 إشارات أو أكثر</span>
      </div>
        <p class="hint">الأعلى تقاطعًا بين الإشارات؛ أول 12 طالبًا ظاهرًا مع فتح الإجراء المناسب مباشرة.</p>
      ${highPriorityRows.length ? `
        <ul class="plain">
            ${highPriorityRows.slice(0, 12).map((row) => `
            <li class="row-item">
              <div class="body">
                  <div class="title">${esc(row.student?.name) || row.studentId} <span class="daily-id">${esc(row.studentId)}</span></div>
                <div class="meta">${esc(row.needs.flatMap((need) => need.reasons || []).join(" · "))}</div>
              </div>
                <div class="daily-row-actions">
                ${row.needs.map((n) => `<button class="pill pill-warning" style="border:none; cursor:pointer;" data-goto="${esc(NEED_TARGET_VIEW[n.type])}">${esc(NEED_LABELS[n.type])}</button>`).join("")}
                ${decisionControls(`student:${row.studentId}`)}
              </div>
            </li>
          `).join("")}
        </ul>
        ${highPriorityCount > highPriorityRows.length ? `<p class="hint daily-more">و${highPriorityCount - highPriorityRows.length} طالبًا آخرين ضمن الأولوية العالية.</p>` : ""}
        ` : '<p class="hint">لا توجد حالات تتقاطع عليها ثلاث إشارات حاليًا.</p>'}
      </div>
    </div>

    <div class="grid g2 daily-split" style="margin-bottom:16px;">
      <div class="card daily-panel"><div class="card-head"><h2>الأضعف أكاديميًا — أعلى 10</h2><button class="link-btn" data-goto="grades">فتح الدرجات والتحليلات</button></div><p class="hint">مرتبة حسب المعدل العام والإشارات الأكاديمية المتاحة من النسخة المحلية.</p><div class="tablewrap"><table><thead><tr><th>الطالب</th><th>المعدل</th><th>السبب</th></tr></thead><tbody>${academicWeak.length ? academicWeak.map((row) => `<tr data-goto="grades"><td><b>${esc(row.student?.name || row.studentId)}</b><small class="daily-table-id">${esc(row.studentId)}</small></td><td>${row.overallPct == null ? "—" : `${row.overallPct}%`}</td><td>${esc(row.reasons.join(" · "))}</td></tr>`).join("") : '<tr><td colspan="3">يتوفر هذا التحليل بعد تحديث مجلد OneDrive المحلي.</td></tr>'}</tbody></table></div></div>
      <div class="card daily-panel"><div class="card-head"><h2>أكثر مقررات معلّقة (مرفّع) — أعلى 10</h2><button class="link-btn" data-goto="promoted">فتح سجل المرفعين</button></div><p class="hint">الطلاب ذوو أكبر عدد من المقررات التي لم تُجتز بعد.</p><div class="tablewrap"><table><thead><tr><th>الطالب</th><th>العدد</th><th>المقررات</th></tr></thead><tbody>${promotedTop.length ? promotedTop.map((row) => `<tr data-goto="promoted"><td><b>${esc(row.student?.name || row.studentId)}</b><small class="daily-table-id">${esc(row.studentId)}</small></td><td>${row.subjects.length}</td><td>${esc(row.subjects.join("، "))}</td></tr>`).join("") : '<tr><td colspan="3">يتوفر هذا التحليل بعد تحديث مجلد OneDrive المحلي.</td></tr>'}</tbody></table></div></div>
    </div>

    <div class="daily-section-title"><span>2</span><div><h2>شنو المطلوب مني إنجازه بناءً على خطة القسم؟</h2><p>${agenda.done} من ${agenda.total} إجراءً أُنجز · نسبة الإنجاز ${completionPct}%</p></div></div>

    <div class="grid g4 daily-stats" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">نسبة الإنجاز</div><div class="value">${completionPct}%</div><div class="hint">${agenda.done} من ${agenda.total}</div></div>
      <div class="card stat"><div class="label">جارٍ التنفيذ</div><div class="value">${agenda.ongoing || 0}</div><div class="hint">بالحالة المسجلة في مسار</div></div>
      <div class="card stat"><div class="label">قادم خلال 14 يومًا</div><div class="value">${upcomingPlanCount}</div></div>
      <div class="card stat stat-warn"><div class="label">بلا جدول زمني</div><div class="value">${undatedPlanCount}</div><div class="hint">${agenda.total ? `${Math.round(undatedPlanCount / agenda.total * 100)}٪ من الإجراءات` : "—"}</div></div>
    </div>

    ${pillarRows.length ? `<div class="card daily-panel" style="margin-bottom:16px;"><div class="card-head"><h2>توزيع الإجراءات حسب المحور</h2><span class="pill pill-neutral">${planSummary.projectCount || 0} مشروعًا · ${agenda.total} إجراءً</span></div><div class="daily-pillar-grid">${pillarRows.map(([pillar, count]) => `<div><span>${esc(pillar)}</span><b>${count}</b></div>`).join("")}</div></div>` : ""}

    <div class="card daily-panel" style="margin-bottom:16px;">
      <div class="card-head"><h2>أولويات خطة القسم</h2><button class="link-btn" data-goto="agenda">فتح الأجندة التنفيذية</button></div>
      <div class="grid g3">
        <div><h3>متأخرة (${overduePlanCount})</h3>${planPriorities.overdue.length ? `<ul class="plain">${planPriorities.overdue.filter((entry) => isVisiblePriority(`plan:${entry.id}`)).slice(0, 6).map((entry) => planActionRow(entry, entry.period_end || entry.periodEnd || entry.period_start || entry.periodStart, "pill-critical", `plan:${entry.id}`)).join("")}</ul>` : '<p class="hint">لا توجد إجراءات متأخرة.</p>'}</div>
        <div><h3>قادمة خلال 14 يومًا (${upcomingPlanCount})</h3>${planPriorities.upcoming.length ? `<ul class="plain">${planPriorities.upcoming.filter((entry) => isVisiblePriority(`plan:${entry.id}`)).slice(0, 6).map((entry) => planActionRow(entry, entry.period_start || entry.periodStart, "pill-warning", `plan:${entry.id}`)).join("")}</ul>` : '<p class="hint">لا توجد إجراءات قادمة خلال 14 يومًا.</p>'}</div>
        <div><h3>بلا تاريخ (${undatedPlanCount})</h3>${planPriorities.undated.length ? `<ul class="plain">${planPriorities.undated.filter((entry) => isVisiblePriority(`plan:${entry.id}`)).slice(0, 6).map((entry) => planActionRow(entry, "بلا تاريخ", "pill-neutral", `plan:${entry.id}`)).join("")}</ul>` : '<p class="hint">كل الإجراءات مجدولة.</p>'}</div>
      </div>
      ${undatedPlanCount ? `<div class="daily-note daily-note-warning"><b>يحتاج قرارك: جدولة الإجراءات.</b> يوجد ${undatedPlanCount} إجراءً بلا تاريخ بداية أو نهاية؛ وهذا يمنع احتساب المتأخر والقادم بصورة موثوقة. افتح الأجندة وحدد موعدًا أو فترة تنفيذ لكل إجراء.</div>` : ""}
    </div>

    <div class="grid g2 daily-split" style="margin-bottom:16px;">
      <div class="card daily-panel">
        <div class="card-head"><h2>حالات إرشادية بلا متابعة حديثة</h2><button class="link-btn" data-goto="cases">فتح المتابعات والحالات</button></div>
        ${visibleStaleCases.length ? `
          <ul class="plain">
            ${visibleStaleCases.slice(0, 6).map((c) => `
              <li class="row-item">
                <div class="body">
                  <div class="title">${esc(c.studentName) || c.studentId}</div>
                  <div class="meta">${esc(c.category) || ""}</div>
                </div>
                <span class="pill pill-warning">${daysSince(c.lastActivity)} يومًا بلا متابعة</span>
                <button class="link-btn" data-goto="cases">فتح</button>
                ${decisionControls(`case:${c.id}`)}
              </li>
            `).join("")}
          </ul>
          ${staleCases.length > 6 ? `<p class="hint" style="margin:10px 0 0;">و${staleCases.length - 6} حالة أخرى...</p>` : ""}
        ` : '<p class="hint">كل الحالات المفتوحة تمت متابعتها مؤخرًا.</p>'}
      </div>
      <div class="card daily-panel">
        <div class="card-head"><h2>إجراءات دعم متأخرة</h2><button class="link-btn" data-goto="support">فتح خطط الدعم</button></div>
        ${visibleSupportActions.length ? `
          <ul class="plain">
            ${visibleSupportActions.slice(0, 6).map((a) => `
              <li class="row-item">
                <div class="body">
                  <div class="title">${esc(a.plan?.studentName) || a.plan?.studentId || "—"}</div>
                  <div class="meta">${esc(a.action)}</div>
                </div>
                <span class="pill pill-critical">${esc(a.dueDate)}</span>
                <button class="link-btn" data-goto="support">فتح</button>
                ${decisionControls(`support:${a.id}`)}
              </li>
            `).join("")}
          </ul>
          ${overdueSupportActions.length > 6 ? `<p class="hint" style="margin:10px 0 0;">و${overdueSupportActions.length - 6} إجراء آخر...</p>` : ""}
        ` : '<p class="hint">لا توجد إجراءات دعم متأخرة حاليًا.</p>'}
      </div>
    </div>

    <div class="daily-section-title"><span>3</span><div><h2>التذكيرات والقرارات اليومية</h2><p>أضف تذكيرًا، راجع المستحق، أو أجّل البند مع توثيق السبب</p></div></div>
    <div class="card daily-panel" id="dashboard-reminders"></div>
  </div>`;

  container.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => onGoto(btn.dataset.goto));
  });

  container.querySelectorAll("[data-priority-review]").forEach((btn) => btn.addEventListener("click", async () => {
    markPriorityReviewed(btn.dataset.priorityReview); await mountDashboardView(container, { onGoto });
  }));
  container.querySelectorAll("[data-priority-snooze]").forEach((btn) => btn.addEventListener("click", async () => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const until = prompt("إلى أي تاريخ تريد التأجيل؟ (YYYY-MM-DD)", tomorrow.toISOString().slice(0,10));
    if (!until) return;
    const reason = prompt("اكتب سبب التأجيل");
    if (!reason) return;
    try { snoozePriority(btn.dataset.prioritySnooze, until, reason); await mountDashboardView(container, { onGoto }); } catch (error) { alert(error.message); }
  }));
  container.querySelectorAll("[data-priority-restore]").forEach((btn) => btn.addEventListener("click", async () => {
    clearPriorityDecision(btn.dataset.priorityRestore); await mountDashboardView(container, { onGoto });
  }));
  container.querySelector("#folder-connect").addEventListener("click", async () => {
    try {
      if (!folderAccessSupported()) throw new Error("افتح نسخة مسار المنشورة عبر Chrome أو Edge ثم أعد المحاولة");
      const updated = snapshot.source === "onedrive-local" ? await refreshMasarFolder({ prompt: true }) : await connectMasarFolder();
      if (!updated) throw new Error("لم تُمنح صلاحية قراءة المجلد");
      await mountDashboardView(container, { onGoto });
    } catch (error) { alert(error.message); }
  });
  const reportHtml = dailyReportHtml(snapshot, new Intl.DateTimeFormat("ar-BH", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Bahrain" }).format(new Date()), dueReminders);
  container.querySelector("#daily-word").addEventListener("click", () => downloadAsWordDoc("تقرير أولويات اليوم", reportHtml, `أولويات-اليوم-${new Date().toISOString().slice(0,10)}`));
  container.querySelector("#daily-print").addEventListener("click", () => printDailyReport(reportHtml));

  await renderRemindersCard(container.querySelector("#dashboard-reminders"));
}
