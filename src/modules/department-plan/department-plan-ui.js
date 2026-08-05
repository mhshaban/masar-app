import {
  listPillars,
  listProjectsByPillar,
  getPlanStats,
  getProgressStats,
  PILLARS,
  createProject,
  updateProject,
  deleteProject,
  addAction,
  updateAction,
  deleteAction,
} from "./department-plan-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const FIELD_STYLE = "padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;";

function statusPill(status) {
  const map = {
    done: ["pill-success", "منجز"],
    ongoing: ["pill-warning", "قيد الإنجاز"],
    not_done: ["pill-critical", "لم يُنجز"],
    unknown: ["pill-neutral", "غير محدد"],
  };
  const [cls, label] = map[status] || map.unknown;
  return `<span class="pill dot ${cls}">${label}</span>`;
}

async function renderStats(root) {
  const plan = await getPlanStats();
  const progress = await getProgressStats();
  const donePct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  root.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat">
        <div class="label">مشاريع الخطة</div>
        <div class="value">${plan.totalProjects}</div>
      </div>
      <div class="card stat">
        <div class="label">إجراءات الخطة الكلية</div>
        <div class="value">${plan.totalActions}</div>
      </div>
      <div class="card stat">
        <div class="label">إنجاز تقرير المتابعة الرسمي</div>
        <div class="value">${donePct}٪</div>
        <div class="delta up">${progress.done} من ${progress.total} بند منجز</div>
      </div>
      <div class="card stat">
        <div class="label">بنود متعثرة أو غير محددة</div>
        <div class="value">${progress.not_done + progress.unknown}</div>
        <div class="delta down">${progress.not_done} لم يُنجز · ${progress.unknown} غير محدد</div>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <h3>الإنجاز بحسب الخطة والمطلوب — لكل محور</h3>
      <p class="hint">عدد المشاريع والإجراءات المخطَّطة في كل محور من ملف الخطة الموحدة</p>
      <div class="tablewrap"><table>
        <thead><tr><th>المحور</th><th>عدد المشاريع</th><th>عدد الإجراءات</th></tr></thead>
        <tbody>
          ${Object.entries(plan.byPillar).map(([pillar, s]) => `
            <tr><td>${esc(pillar)}</td><td class="num">${s.projects}</td><td class="num">${s.actions}</td></tr>
          `).join("")}
        </tbody>
      </table></div>
    </div>
  `;
}

async function renderPillarTabs(root, currentPillar, onSelect) {
  const pillars = await listPillars();
  root.innerHTML = pillars.map((p) => `<div class="chip${p === currentPillar ? " on" : ""}" data-pillar="${esc(p)}">${esc(p)}</div>`).join("");
  root.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => onSelect(chip.dataset.pillar));
  });
  return pillars;
}

function projectFormHtml(project, defaultPillar) {
  return `
    <form class="project-form" style="margin-bottom:16px; display:flex; flex-direction:column; gap:10px;">
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <select name="pillar" style="${FIELD_STYLE}">
          ${PILLARS.map((p) => `<option value="${esc(p)}" ${(project?.pillar || defaultPillar) === p ? "selected" : ""}>${esc(p)}</option>`).join("")}
        </select>
        <input name="project_title" placeholder="عنوان المشروع" value="${esc(project?.project_title) || ""}" required style="flex:1; min-width:220px; ${FIELD_STYLE}">
        <input name="program_name" placeholder="اسم البرنامج (اختياري)" value="${esc(project?.program_name) || ""}" style="flex:1; min-width:180px; ${FIELD_STYLE}">
      </div>
      <textarea name="goal_specific" placeholder="الهدف التفصيلي (اختياري)" rows="2" style="${FIELD_STYLE} resize:vertical;">${esc(project?.goal_specific) || ""}</textarea>
      <input name="team_lead" placeholder="رئيس الفريق (اختياري)" value="${esc(project?.team_lead) || ""}" style="${FIELD_STYLE}">
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" type="submit">حفظ</button>
        <button class="btn btn-ghost" type="button" data-cancel="1">إلغاء</button>
      </div>
    </form>
  `;
}

function readProjectForm(form) {
  return {
    pillar: form.pillar.value,
    project_title: form.project_title.value,
    program_name: form.program_name.value,
    goal_specific: form.goal_specific.value,
    team_lead: form.team_lead.value,
  };
}

function actionFormHtml(action) {
  return `
    <tr class="action-form-row">
      <td colspan="5">
        <form class="action-form" style="display:flex; flex-direction:column; gap:8px; padding:10px 0;">
          <textarea name="action" placeholder="نص الإجراء" required rows="2" style="${FIELD_STYLE} resize:vertical;">${esc(action?.action) || ""}</textarea>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <input name="target" placeholder="المستهدف" value="${esc(action?.target) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
            <input name="executor" placeholder="المنفذ" value="${esc(action?.executor) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
            <input name="follower" placeholder="المتابع" value="${esc(action?.follower) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <input name="evidence" placeholder="الثبوتية" value="${esc(action?.evidence) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
            <input name="period" placeholder="فترة التنفيذ" value="${esc(action?.period) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary" type="submit">حفظ الإجراء</button>
            <button class="btn btn-ghost" type="button" data-cancel="1">إلغاء</button>
          </div>
        </form>
      </td>
    </tr>
  `;
}

function readActionForm(form) {
  return {
    action: form.action.value,
    target: form.target.value,
    executor: form.executor.value,
    follower: form.follower.value,
    evidence: form.evidence.value,
    period: form.period.value,
  };
}

// UI edit state lives outside the render function so it survives the
// re-render each interaction triggers (this screen re-renders the whole
// project list on every change rather than patching individual DOM nodes).
function createEditState() {
  return { editingProjectId: null, newProjectPillar: null, addingActionFor: null, editingAction: null };
}

function renderProjects(root, projects, state, actions) {
  if (!projects.length && state.newProjectPillar == null) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد مشاريع في هذا المحور</div></div>';
    return;
  }

  root.innerHTML = `
    ${state.newProjectPillar != null ? `<div class="card" id="new-project-card">${projectFormHtml(null, state.newProjectPillar)}</div>` : ""}
    ${projects.map((project) => `
      <div class="card" style="margin-bottom:16px;" data-project="${esc(project.id)}">
        ${state.editingProjectId === project.id ? projectFormHtml(project) : `
          <div class="card-head">
            <h3>${esc(project.project_title || "بلا عنوان")}${project.program_name ? ` — ${esc(project.program_name)}` : ""}</h3>
            <div style="display:flex; gap:10px; align-items:center;">
              <span class="pill pill-teal">${(project.actions || []).length} إجراء</span>
              <button class="link-btn" data-edit-project="${esc(project.id)}">تعديل</button>
              <button class="link-btn" data-delete-project="${esc(project.id)}" style="color:var(--critical);">حذف</button>
            </div>
          </div>
          ${project.goal_specific ? `<p class="hint">${esc(project.goal_specific)}</p>` : ""}
          ${project.team_lead ? `<p class="hint" style="margin-top:-10px;">رئيس الفريق: ${esc(project.team_lead)}</p>` : ""}
        `}
        <div class="tablewrap"><table>
          <thead><tr><th>#</th><th>الإجراء</th><th>المستهدف</th><th>المنفذ</th><th>فترة التنفيذ</th></tr></thead>
          <tbody>
            ${(project.actions || []).map((a) => (
              state.editingAction && state.editingAction.projectId === project.id && state.editingAction.no === a.no
                ? actionFormHtml(a)
                : `
                  <tr data-action="${esc(project.id)}:${esc(a.no)}" style="cursor:pointer;">
                    <td class="num">${esc(a.no)}</td>
                    <td>${esc(a.action)}</td>
                    <td>${esc(a.target)}</td>
                    <td>${esc(a.executor)}</td>
                    <td>${esc(a.period) || "—"}</td>
                  </tr>
                `
            )).join("")}
            ${state.addingActionFor === project.id ? actionFormHtml(null) : ""}
          </tbody>
        </table></div>
        ${state.addingActionFor !== project.id ? `<button class="btn btn-ghost" style="margin-top:10px;" data-add-action="${esc(project.id)}">+ إضافة إجراء</button>` : ""}
      </div>
    `).join("")}
  `;

  // New-project form
  const newForm = root.querySelector("#new-project-card form");
  if (newForm) {
    newForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const created = await createProject(readProjectForm(newForm));
        // Switch to the pillar it was actually saved under — otherwise a
        // project created under a different pillar than the one currently
        // viewed would silently vanish from the list with no feedback.
        await actions.onProjectCreated(created.pillar);
      } catch (err) { alert(err.message); }
    });
    newForm.querySelector("[data-cancel]").addEventListener("click", () => actions.cancelNewProject());
  }

  // Project edit/delete
  root.querySelectorAll("[data-edit-project]").forEach((btn) => {
    btn.addEventListener("click", () => actions.editProject(btn.dataset.editProject));
  });
  root.querySelectorAll("[data-delete-project]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("حذف هذا المشروع وكل إجراءاته نهائيًا؟")) return;
      await deleteProject(btn.dataset.deleteProject);
      await actions.onProjectChanged();
    });
  });
  root.querySelectorAll(".card[data-project] > form.project-form").forEach((form) => {
    const projectId = form.closest("[data-project]").dataset.project;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await updateProject(projectId, readProjectForm(form));
        await actions.onProjectChanged();
      } catch (err) { alert(err.message); }
    });
    form.querySelector("[data-cancel]").addEventListener("click", () => actions.cancelEditProject());
  });

  // Add-action affordance
  root.querySelectorAll("[data-add-action]").forEach((btn) => {
    btn.addEventListener("click", () => actions.startAddAction(btn.dataset.addAction));
  });

  // Action rows -> edit
  root.querySelectorAll("[data-action]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const [projectId, no] = tr.dataset.action.split(":");
      actions.editAction(projectId, Number(no));
    });
  });

  // Action forms (new + edit)
  root.querySelectorAll(".action-form").forEach((form) => {
    const row = form.closest("tr");
    const table = form.closest("table");
    const projectId = table.closest("[data-project]").dataset.project;
    form.addEventListener("click", (e) => e.stopPropagation());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (state.addingActionFor === projectId) {
          await addAction(projectId, readActionForm(form));
        } else if (state.editingAction && state.editingAction.projectId === projectId) {
          await updateAction(projectId, state.editingAction.no, readActionForm(form));
        }
        await actions.onProjectChanged();
      } catch (err) { alert(err.message); }
    });
    form.querySelector("[data-cancel]").addEventListener("click", (e) => {
      e.stopPropagation();
      actions.cancelActionForm();
    });
    row.querySelectorAll("input, textarea, select").forEach((el) => el.addEventListener("click", (e) => e.stopPropagation()));
  });

  // Delete-action button lives inside the row when hovered — simplest: add a
  // small delete link next to the edit form's save/cancel buttons instead.
  root.querySelectorAll(".action-form").forEach((form) => {
    if (form.querySelector("[data-delete-action]")) return;
    const row = form.closest("tr");
    const table = form.closest("table");
    const projectId = table.closest("[data-project]").dataset.project;
    const isEdit = state.editingAction && state.editingAction.projectId === projectId;
    if (!isEdit) return;
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "link-btn";
    delBtn.style.color = "var(--critical)";
    delBtn.textContent = "حذف الإجراء";
    delBtn.dataset.deleteAction = "1";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("حذف هذا الإجراء نهائيًا؟ سيُحذف معه أي تقدم أو تقرير فعالية مسجَّل له.")) return;
      await deleteAction(projectId, state.editingAction.no);
      await actions.onProjectChanged();
    });
    form.querySelector("div:last-child").appendChild(delBtn);
  });
}

export async function mountDepartmentPlanView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>خطة القسم — الإرشاد الأكاديمي والتوجيه المهني</h1><div class="sub">العام الدراسي 2025/2026 — من ملف الخطة الموحدة الفعلي، قابلة للتعديل</div></div>
      <button class="btn btn-primary" id="plan-new-project-btn">+ مشروع جديد</button>
    </div>
    <div id="plan-stats"></div>
    <div class="chip-row" id="plan-pillars"></div>
    <div id="plan-projects"></div>
  `;

  await renderStats(container.querySelector("#plan-stats"));

  const pillarsRoot = container.querySelector("#plan-pillars");
  const projectsRoot = container.querySelector("#plan-projects");
  const state = createEditState();
  let currentPillar = null;

  const draw = async () => {
    const projects = currentPillar ? await listProjectsByPillar(currentPillar) : [];
    const actionsApi = {
      onProjectChanged: async () => {
        Object.assign(state, createEditState());
        await renderStats(container.querySelector("#plan-stats"));
        await draw();
      },
      onProjectCreated: async (pillar) => {
        Object.assign(state, createEditState());
        await renderStats(container.querySelector("#plan-stats"));
        await selectPillar(pillar);
      },
      editProject: (id) => { state.editingProjectId = id; draw(); },
      cancelEditProject: () => { state.editingProjectId = null; draw(); },
      cancelNewProject: () => { state.newProjectPillar = null; draw(); },
      startAddAction: (projectId) => { state.addingActionFor = projectId; state.editingAction = null; draw(); },
      editAction: (projectId, no) => { state.editingAction = { projectId, no }; state.addingActionFor = null; draw(); },
      cancelActionForm: () => { state.addingActionFor = null; state.editingAction = null; draw(); },
    };
    renderProjects(projectsRoot, projects, state, actionsApi);
  };

  const selectPillar = async (pillar) => {
    currentPillar = pillar;
    Object.assign(state, createEditState());
    await renderPillarTabs(pillarsRoot, currentPillar, selectPillar);
    await draw();
  };

  const pillars = await renderPillarTabs(pillarsRoot, null, selectPillar);
  if (pillars[0]) await selectPillar(pillars[0]);

  container.querySelector("#plan-new-project-btn").addEventListener("click", () => {
    state.newProjectPillar = currentPillar || PILLARS[0];
    state.editingProjectId = null;
    draw();
  });
}
