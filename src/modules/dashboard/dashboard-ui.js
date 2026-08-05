import { getPlanStats, getProgressStats } from "../department-plan/department-plan-service.js";
import { listAgendaEntries } from "../agenda/agenda-service.js";
import { listReminders, isOverdue, isDueToday } from "../reminders/reminders-service.js";
import { listStudentsNeedingAttention, NEED_LABELS } from "./followup-needs-service.js";

const NEED_TARGET_VIEW = { case: "cases", support: "support", career: "career", promoted: "promoted" };

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export async function mountDashboardView(container, { onGoto }) {
  const [plan, progress, agenda, reminders, attentionRows] = await Promise.all([
    getPlanStats(),
    getProgressStats(),
    listAgendaEntries(),
    listReminders(),
    listStudentsNeedingAttention(),
  ]);

  const donePct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const dueOrLate = reminders.filter((r) => isOverdue(r) || isDueToday(r));

  container.innerHTML = `
    <div class="topbar">
      <div><h1>مرحبًا بك في مسار</h1><div class="sub">مدرسة الشيخ عبدالله بن عيسى آل خليفة — قسم الإرشاد الأكاديمي والتوجيه المهني</div></div>
    </div>

    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat">
        <div class="label">إنجاز الخطة (تقرير المتابعة الرسمي)</div>
        <div class="value">${donePct}٪</div>
      </div>
      <div class="card stat">
        <div class="label">إجراءات الخطة الكلية</div>
        <div class="value">${plan.totalActions}</div>
      </div>
      <div class="card stat">
        <div class="label">بنود الأجندة</div>
        <div class="value">${agenda.length}</div>
      </div>
      <div class="card stat">
        <div class="label">تذكيرات مستحقة أو متأخرة</div>
        <div class="value">${dueOrLate.length}</div>
      </div>
    </div>

    <div class="grid g2" style="margin-top:16px;">
      <div class="card">
        <div class="card-head"><h3>خطة القسم</h3><button class="link-btn" data-goto="plan">فتح الخطة</button></div>
        <p class="hint">${plan.totalProjects} مشروعًا موزعة على 3 محاور (الانجاز الأكاديمي، التطور الشخصي، القيادة) من ملف الخطة الموحدة الفعلي.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>التذكيرات</h3><button class="link-btn" data-goto="reminders">فتح التذكيرات</button></div>
        ${dueOrLate.length
          ? `<ul class="plain">${dueOrLate.slice(0, 4).map((r) => `<li class="row-item"><div class="body"><div class="title">${esc(r.title)}</div></div></li>`).join("")}</ul>`
          : '<p class="hint">لا توجد تذكيرات مستحقة اليوم.</p>'}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
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
  `;

  container.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => onGoto(btn.dataset.goto));
  });
}
