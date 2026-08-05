import { SESSION_TOPICS, listStudentsWithSessions, getStudentSessions, addSession, removeSession, listCandidates } from "./career-service.js";
import { mountStudentPicker } from "../shared/student-picker.js";

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
    root.innerHTML = '<div class="card"><h3>طلاب السنة النهائية بلا جلسة توجيه</h3><div class="empty">لا يوجد طلاب مرشَّحون حاليًا</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="card">
      <h3>طلاب السنة النهائية بلا جلسة توجيه (${candidates.length})</h3>
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

function renderNewSessionForm(root, prefill, onCreated) {
  root.innerHTML = `
    <div class="card">
      <h3>جلسة توجيه مهني جديدة</h3>
      <div id="new-session-picker"></div>
      <div id="new-session-selected" class="hint">${prefill ? `الطالب المحدد: ${esc(prefill.name)} (${esc(prefill.academicId)})` : ""}</div>
      <form id="new-session-form" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input name="topic" list="career-topics" required placeholder="موضوع الجلسة" style="flex:1; min-width:220px; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
          <datalist id="career-topics">${topicOptionsHtml()}</datalist>
          <input name="date" type="date" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
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
      root.querySelector("#new-session-selected").textContent = `الطالب المحدد: ${student.name} (${student.academicId || student.id})`;
    },
  });

  root.querySelector("#new-session-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) { alert("اختر طالبًا من نتائج البحث أولًا"); return; }
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
      alert(err.message);
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

async function renderStudentDetail(container, studentId, onBack) {
  const refresh = () => renderStudentDetail(container, studentId, onBack);
  const sessions = await getStudentSessions(studentId);
  const studentName = sessions[0]?.studentName || studentId;

  container.innerHTML = `
    <button class="backlink" id="career-back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>
      رجوع للتوجيه المهني
    </button>
    <div class="topbar">
      <div><h1>${esc(studentName)}</h1><div class="sub">${sessions.length} جلسة توجيه مهني مسجَّلة</div></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3>جلسة جديدة لهذا الطالب</h3>
      <form id="session-form" style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input name="topic" list="career-topics-detail" required placeholder="موضوع الجلسة" style="flex:1; min-width:220px; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
          <datalist id="career-topics-detail">${topicOptionsHtml()}</datalist>
          <input name="date" type="date" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <textarea name="notes" rows="2" placeholder="ملاحظات الجلسة (اختياري)" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit; resize:vertical;"></textarea>
        <textarea name="recommendation" rows="2" placeholder="التوصية النهائية (اختياري)" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit; resize:vertical;"></textarea>
        <div><button class="btn btn-primary" type="submit">حفظ الجلسة</button></div>
      </form>
    </div>
    <div class="card">
      <h3>سجل الجلسات</h3>
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
      alert(err.message);
    }
  });
  container.querySelectorAll("[data-remove-session]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("حذف هذه الجلسة؟")) return;
      await removeSession(btn.dataset.removeSession);
      await refresh();
    });
  });
}

export async function mountCareerView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>التوجيه المهني</h1><div class="sub">جلسات وتوصيات التوجيه الجامعي والمهني — مرشَّحة تلقائيًا لطلاب السنة النهائية</div></div>
    </div>
    <div id="career-candidates" style="margin-bottom:16px;"></div>
    <div id="career-new-form" style="margin-bottom:16px;"></div>
    <div id="career-table"></div>
  `;

  const openDetail = (studentId) => renderStudentDetail(container, studentId, () => mountCareerView(container));

  const showNewForm = (student) => {
    renderNewSessionForm(container.querySelector("#career-new-form"), student || null, async () => {
      await mountCareerView(container);
    });
  };

  await renderCandidates(container.querySelector("#career-candidates"), showNewForm);
  showNewForm(null);
  await renderStudentsTable(container.querySelector("#career-table"), openDetail);
}
