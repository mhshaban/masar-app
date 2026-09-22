import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { SESSION_TOPICS, listStudentsWithSessions, getStudentSessions, addSession, removeSession, listCandidates } from "./career-service.js";
import { mountStudentPicker } from "../shared/student-picker.js?v=2026-09-22-student-context-1";
import { getStudent } from "../students/students-service.js";
import { loadAcademicFlagsMap, studentQuickInfo, studentQuickCard } from "../shared/student-quick-info.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function topicOptionsHtml() {
  return SESSION_TOPICS.map((t) => `<option value="${esc(t)}"></option>`).join("");
}

async function renderCandidates(root, onOpenNewSession) {
  const candidates = await listCandidates();
  if (!candidates.length) {
    root.innerHTML = '<div class="card"><h2>طلاب السنة النهائية بلا جلسة توجيه</h2><div class="empty">لا يوجد طلاب مرشَّحون حاليًا</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="card">
      <h2>طلاب السنة النهائية بلا جلسة توجيه (${candidates.length})</h2>
      <p class="hint">طلاب المستوى الثالث الذين لم يُسجَّل لهم أي جلسة توجيه مهني بعد.</p>
      <ul class="plain">
        ${candidates.slice(0, 15).map((s) => `
          <li class="row-item">
            <div class="body">
              <div class="title">${esc(s.name) || "—"}</div>
              <div class="meta">${esc(s.academicId) || "—"} · ${esc(s.track) || "—"}</div>
            </div>
            <button class="btn btn-ghost" data-open-session="${esc(s.id)}">إضافة جلسة</button>
          </li>
        `).join("")}
      </ul>
      ${candidates.length > 15 ? `<p class="hint" style="margin:10px 0 0;">و${candidates.length - 15} طالبًا آخر...</p>` : ""}
    </div>
  `;
  root.querySelectorAll("[data-open-session]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const student = candidates.find((s) => s.id === btn.dataset.openSession);
      onOpenNewSession(student);
    });
  });
}

async function renderNewSessionForm(root, prefill, onCreated) {
  const flagsMap = await loadAcademicFlagsMap();
  root.innerHTML = `
    <div class="card">
      <h2>جلسة توجيه مهني جديدة</h2>
      <div id="new-session-picker"></div>
      <div id="new-session-selected">${studentQuickCard(prefill || null, prefill ? studentQuickInfo(prefill, flagsMap) : null)}</div>
      <form id="new-session-form" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input name="topic" list="career-topics" required placeholder="موضوع الجلسة" style="flex:1; min-width:220px; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
          <datalist id="career-topics">${topicOptionsHtml()}</datalist>
          <input name="date" type="date" aria-label="تاريخ الجلسة" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <textarea name="notes" rows="2" placeholder="ملاحظات الجلسة (اختياري)" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit; resize:vertical;"></textarea>
        <textarea name="recommendation" rows="2" placeholder="التوصية النهائية (اختياري — إن انتهت الجلسة بتوصية محددة)" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit; resize:vertical;"></textarea>
        <div><button class="btn btn-primary" type="submit">حفظ الجلسة</button></div>
      </form>
    </div>
  `;

  let selected = prefill || null;
  mountStudentPicker(root.querySelector("#new-session-picker"), {
    onSelect: (student) => {
      selected = student;
      root.querySelector("#new-session-selected").innerHTML = studentQuickCard(student, studentQuickInfo(student, flagsMap));
    },
  });

  root.querySelector("#new-session-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) { notify("اختر طالبًا من نتائج البحث أولًا"); return; }
    const form = e.target;
    try {
      await addSession({
        studentId: selected.id,
        studentName: selected.name,
        date: form.date.value,
        topic: form.topic.value,
        notes: form.notes.value,
        recommendation: form.recommendation.value,
      });
      await onCreated();
    } catch (err) {
      notify(err.message);
    }
  });
}

async function renderStudentsTable(root, onOpen) {
  const rows = await listStudentsWithSessions();
  if (!rows.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد جلسات توجيه مهني مسجَّلة بعد</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>الطالب</th><th>عدد الجلسات</th><th>آخر جلسة</th><th>التوصية</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr data-id="${esc(r.studentId)}">
              <td>${esc(r.studentName) || esc(r.studentId)}</td>
              <td class="num">${r.sessionCount}</td>
              <td class="num">${esc(r.lastDate) || "—"}</td>
              <td>${r.lastRecommendation ? `<span class="pill pill-success">${esc(r.lastRecommendation)}</span>` : '<span class="pill pill-neutral">بلا توصية بعد</span>'}</td>
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

// طباعة سجل جلسات التوجيه المهني لطالب واحد — نفس تقنية الطباعة المباشرة
// المعتمدة بالاستمارات وكشف حضور الفعالية (forms-ui.js).
function careerSessionsPrintMarkup(studentName, sessions) {
  return `<div class="forms-print" id="career-printable">
    <div class="topbar"><div><h1>${esc(studentName) || "جلسات التوجيه المهني"}</h1><div class="sub">${sessions.length} جلسة توجيه مهني مسجَّلة</div></div></div>
    <div class="card"><h2>سجل الجلسات</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>التاريخ</th><th>الموضوع</th><th>الملاحظات</th><th>التوصية</th></tr></thead>
        <tbody>${sessions.length ? sessions.map((s) => `<tr><td>${esc(s.date) || "—"}</td><td>${esc(s.topic)}</td><td>${esc(s.notes) || "—"}</td><td>${esc(s.recommendation) || "—"}</td></tr>`).join("") : '<tr><td colspan="4">لا توجد جلسات مسجَّلة</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

async function printCareerSessionsDirect(studentName, sessions) {
  const popup = window.open("", "_blank");
  if (!popup) { notify("اسمح بفتح نافذة الطباعة في المتصفح."); return; }
  popup.document.body.textContent = "جارٍ تجهيز السجل للطباعة…";
  try {
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(studentName) || "جلسات التوجيه المهني"}</title></head><body><main id="career-print-root"></main></body></html>`);
    popup.document.close();
    popup.document.documentElement.dataset.theme = document.documentElement.dataset.theme || "light";
    const root = popup.document.getElementById("career-print-root");
    root.innerHTML = careerSessionsPrintMarkup(studentName, sessions);
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
  } catch (error) { if (!popup.closed) popup.close(); notify(error.message || "تعذّرت طباعة السجل."); }
}

async function renderStudentDetail(container, studentId, onBack, onGoto) {
  const refresh = () => renderStudentDetail(container, studentId, onBack, onGoto);
  const [sessions, student, flagsMap] = await Promise.all([
    getStudentSessions(studentId), getStudent(studentId), loadAcademicFlagsMap(),
  ]);
  const studentName = student?.name || sessions[0]?.studentName || studentId;

  container.innerHTML = `
    <button class="backlink" id="career-back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>
      رجوع للتوجيه المهني
    </button>
    <div class="topbar">
      <div><h1>${esc(studentName)}</h1><div class="sub">${sessions.length} جلسة توجيه مهني مسجَّلة</div></div>
      <div class="forms-actions"><button class="btn btn-ghost" id="career-print">طباعة</button></div>
    </div>
    ${student ? studentQuickCard(student, studentQuickInfo(student, flagsMap)) : ""}
    ${student && onGoto ? '<div style="margin:-8px 0 16px;"><button class="link-btn" id="career-open-profile">فتح ملف الطالب</button></div>' : ""}
    <div class="card" style="margin-bottom:16px;">
      <h2>جلسة جديدة لهذا الطالب</h2>
      <form id="session-form" style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input name="topic" list="career-topics-detail" required placeholder="موضوع الجلسة" style="flex:1; min-width:220px; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
          <datalist id="career-topics-detail">${topicOptionsHtml()}</datalist>
          <input name="date" type="date" aria-label="تاريخ الجلسة" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <textarea name="notes" rows="2" placeholder="ملاحظات الجلسة (اختياري)" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit; resize:vertical;"></textarea>
        <textarea name="recommendation" rows="2" placeholder="التوصية النهائية (اختياري)" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit; resize:vertical;"></textarea>
        <div><button class="btn btn-primary" type="submit">حفظ الجلسة</button></div>
      </form>
    </div>
    <div class="card">
      <h2>سجل الجلسات</h2>
      <ul class="plain">
        ${sessions.map((s) => `
          <li class="row-item" data-session-id="${esc(s.id)}">
            <div class="body">
              <div class="title">${esc(s.topic)}</div>
              ${s.notes ? `<div class="meta">${esc(s.notes)}</div>` : ""}
              ${s.recommendation ? `<div class="meta"><span class="pill pill-success">التوصية: ${esc(s.recommendation)}</span></div>` : ""}
            </div>
            <span class="pill pill-neutral">${esc(s.date) || "—"}</span>
            <button class="link-btn" data-remove-session="${esc(s.id)}" style="color:var(--critical);">حذف</button>
          </li>
        `).join("")}
      </ul>
    </div>
  `;

  container.querySelector("#career-back").addEventListener("click", onBack);
  const profileBtn = container.querySelector("#career-open-profile");
  if (profileBtn) profileBtn.addEventListener("click", () => onGoto("students", { studentId: student.id }));
  container.querySelector("#career-print").addEventListener("click", () => printCareerSessionsDirect(studentName, sessions));
  container.querySelector("#session-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await addSession({
        studentId,
        studentName,
        date: form.date.value,
        topic: form.topic.value,
        notes: form.notes.value,
        recommendation: form.recommendation.value,
      });
      await refresh();
    } catch (err) {
      notify(err.message);
    }
  });
  container.querySelectorAll("[data-remove-session]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("حذف هذه الجلسة؟")) return;
      await removeSession(btn.dataset.removeSession);
      await refresh();
    });
  });
}

// options.studentId: نفس منطق deep-link بوحدة الحالات الإرشادية — إن وُجدت
// جلسات سابقة للطالب يفتح سجله مباشرة، وإلا يعبّئ نموذج جلسة جديدة به.
export async function mountCareerView(container, options = {}) {
  const onGoto = options.onGoto;
  const openDetail = (studentId) => renderStudentDetail(container, studentId, () => mountCareerView(container, { onGoto }), onGoto);

  let prefillStudent = null;
  if (options.studentId) {
    const rows = await listStudentsWithSessions();
    if (rows.some((r) => String(r.studentId) === String(options.studentId))) { await openDetail(options.studentId); return; }
    prefillStudent = await getStudent(options.studentId);
  }

  container.innerHTML = `
    <div class="topbar">
      <div><h1>التوجيه المهني</h1><div class="sub">جلسات وتوصيات التوجيه الجامعي والمهني</div></div>
    </div>
    <div id="career-new-form" style="margin-bottom:16px;"></div>
    <div id="career-table" style="margin-bottom:16px;"></div>
    <div id="career-candidates"></div>
  `;

  const showNewForm = (student) => {
    renderNewSessionForm(container.querySelector("#career-new-form"), student || null, async () => {
      await mountCareerView(container, { onGoto });
    });
    if (student) container.querySelector("#career-new-form").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  showNewForm(prefillStudent);
  await renderStudentsTable(container.querySelector("#career-table"), openDetail);
  await renderCandidates(container.querySelector("#career-candidates"), showNewForm);
}
