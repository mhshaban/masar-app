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
  searchActions,
  getProject,
  listProgressItems,
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

// عرض بنود تقرير المتابعة الرسمي (agendaStatus — لقطة تاريخية من التقرير
// الرسمي المستورد، منفصلة عن تقرير المتابعة الحي بشاشة "تقرير المتابعة")
// المطابقة لتصنيف "منجز" أو "متعثر/غير محدد" — كانت الأرقام معروضة بدون
// أي طريقة لرؤية البنود نفسها خلفها.
function progressItemRow(item) {
  const map = {
    done: ["pill-success", "منجز"],
    ongoing: ["pill-warning", "قيد الإنجاز"],
    not_done: ["pill-critical", "لم يُنجز"],
    unknown: ["pill-neutral", "غير محدد"],
  };
  const [cls, label] = map[item.status] || map.unknown;
  return `
    <li class="row-item" data-progress-item="${esc(item.id)}" style="flex-direction:column; align-items:stretch; cursor:pointer;">
      <div style="display:flex; align-items:center; gap:10px; width:100%;">
        <div class="body">
          <div class="title">${item.no !== "*" ? `${esc(item.no)}. ` : ""}${esc(item.item)}</div>
          ${item.obstacles ? `<div class="meta">${esc(item.obstacles)}</div>` : ""}
        </div>
        <span class="pill dot ${cls}">${label}</span>
      </div>
      <div class="detail-slot"></div>
    </li>
  `;
}

// يوضّح مصدر البند صراحةً — لقطة تاريخية مستوردة من تقرير المتابعة الرسمي
// (agendaStatus)، بلا ربط حي بأي إجراء بخطة القسم أو مشروع، فحالته هنا لا
// تتحدّث تلقائيًا ولا تتزامن مع أي حالة أخرى بنفس الاسم بالأجندة التنفيذية.
function progressItemDetailHtml(item) {
  return `
    <div class="card" style="margin-top:8px; background:var(--paper-50);">
      ${item.indicator ? `<p class="hint" style="margin:0 0 6px;"><strong>مؤشر الإنجاز:</strong> ${esc(item.indicator)}</p>` : ""}
      ${item.parties ? `<p class="hint" style="margin:0 0 6px;"><strong>الجهات المعنية:</strong> ${esc(item.parties)}</p>` : ""}
      ${item.obstacles ? `<p class="hint" style="margin:0 0 6px;"><strong>المعوقات:</strong> ${esc(item.obstacles)}</p>` : ""}
      ${!item.indicator && !item.parties && !item.obstacles ? '<p class="hint" style="margin:0;">لا تفاصيل إضافية مسجَّلة لهذا البند.</p>' : ""}
      <p class="hint" style="margin:8px 0 0; color:var(--ink-500);">هذا البند من تقرير المتابعة الرسمي المستورَد كلقطة تاريخية — <strong>غير مرتبط بأي إجراء حي بخطة القسم</strong>، فحالته هنا لا تتحدّث تلقائيًا ولا تعكس حالة أي إجراء مشابه بالاسم في الأجندة التنفيذية.</p>
    </div>
  `;
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
      <div class="card stat" id="stat-done" style="cursor:pointer;">
        <div class="label">إنجاز تقرير المتابعة الرسمي</div>
        <div class="value">${donePct}٪</div>
        <div class="delta up">${progress.done} من ${progress.total} بند منجز — اضغط للعرض</div>
      </div>
      <div class="card stat" id="stat-pending" style="cursor:pointer;">
        <div class="label">بنود متعثرة أو غير محددة</div>
        <div class="value">${progress.not_done + progress.unknown}</div>
        <div class="delta down">${progress.not_done} لم يُنجز · ${progress.unknown} غير محدد — اضغط للعرض</div>
      </div>
    </div>
    <div id="progress-items-list" style="margin-bottom:20px;"></div>
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

  const listRoot = root.querySelector("#progress-items-list");
  let openFilter = null;

  const draw = async () => {
    if (!openFilter) { listRoot.innerHTML = ""; return; }
    const items = await listProgressItems();
    const filtered = openFilter === "done"
      ? items.filter((i) => i.status === "done")
      : items.filter((i) => i.status === "not_done" || i.status === "unknown");
    const title = openFilter === "done" ? "البنود المنجزة" : "البنود المتعثرة أو غير المحددة";
    listRoot.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>${title}</h3><span class="pill pill-neutral">${filtered.length} بند</span></div>
        ${filtered.length ? `<ul class="plain">${filtered.map(progressItemRow).join("")}</ul>` : '<div class="empty">لا يوجد بنود بهذا التصنيف</div>'}
      </div>
    `;

    listRoot.querySelectorAll("[data-progress-item]").forEach((li) => {
      li.addEventListener("click", () => {
        const slot = li.querySelector(".detail-slot");
        if (slot.innerHTML) { slot.innerHTML = ""; return; }
        const item = filtered.find((i) => i.id === li.dataset.progressItem);
        slot.innerHTML = progressItemDetailHtml(item);
      });
    });
  };

  root.querySelector("#stat-done").addEventListener("click", () => {
    openFilter = openFilter === "done" ? null : "done";
    draw();
  });
  root.querySelector("#stat-pending").addEventListener("click", () => {
    openFilter = openFilter === "pending" ? null : "pending";
    draw();
  });
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
            <input name="period" placeholder="وصف الفترة (مثال: طوال العام الدراسي)" value="${esc(action?.period) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:140px;">
              <label class="hint" style="display:block;margin-bottom:4px;">تاريخ بداية التنفيذ (اختياري)</label>
              <input name="periodStart" type="date" value="${esc(action?.periodStart) || ""}" style="width:100%; ${FIELD_STYLE}">
            </div>
            <div style="flex:1; min-width:140px;">
              <label class="hint" style="display:block;margin-bottom:4px;">تاريخ نهاية التنفيذ (اختياري)</label>
              <input name="periodEnd" type="date" value="${esc(action?.periodEnd) || ""}" style="width:100%; ${FIELD_STYLE}">
            </div>
          </div>
          <p class="hint" style="margin:0;">تحديد التاريخين يرتّب هذا الإجراء زمنيًا بالأجندة التنفيذية تلقائيًا — بدونهما يبقى ضمن قسم "بلا تاريخ محدد".</p>
          <div data-role="form-actions" style="display:flex; gap:8px;">
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
    periodStart: form.periodStart.value || null,
    periodEnd: form.periodEnd.value || null,
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
                    <td>${a.periodStart ? `${esc(a.periodStart)}${a.periodEnd ? ` → ${esc(a.periodEnd)}` : ""}` : (esc(a.period) || "—")}</td>
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
    form.querySelector('[data-role="form-actions"]').appendChild(delBtn);
  });
}

// بحث سريع عن إجراء عبر كل المحاور معًا (لا يتقيّد بالمحور المعروض حاليًا)
// — بديل لتصفح يدوي بين المحاور والمشاريع لإيجاد إجراء معيّن للتعديل.
function renderSearchResults(root, results, onPick) {
  if (!results.length) {
    root.innerHTML = '<p class="hint">لا يوجد إجراء مطابق.</p>';
    return;
  }
  root.innerHTML = `
    <ul class="plain" style="border:1px solid var(--border); border-radius:9px; padding:6px 10px; max-height:260px; overflow-y:auto;">
      ${results.slice(0, 15).map((r) => `
        <li class="row-item" data-project="${esc(r.projectId)}" data-no="${esc(r.action.no)}" style="cursor:pointer;">
          <div class="body">
            <div class="title">${esc(r.action.action)}</div>
            <div class="meta">${esc(r.pillar)} — ${esc(r.projectTitle)}${r.action.executor ? ` · المنفذ: ${esc(r.action.executor)}` : ""}</div>
          </div>
        </li>
      `).join("")}
    </ul>
    ${results.length > 15 ? `<p class="hint" style="margin-top:6px;">و${results.length - 15} نتيجة أخرى — دقّق البحث أكثر.</p>` : ""}
  `;
  root.querySelectorAll("[data-project]").forEach((li) => {
    li.addEventListener("click", () => onPick(li.dataset.project, Number(li.dataset.no)));
  });
}

export async function mountDepartmentPlanView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>خطة القسم — الإرشاد الأكاديمي والتوجيه المهني</h1><div class="sub">العام الدراسي 2025/2026 — من ملف الخطة الموحدة الفعلي، قابلة للتعديل</div></div>
      <button class="btn btn-primary" id="plan-new-project-btn">+ مشروع جديد</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <label class="hint" style="display:block; margin-bottom:6px;">بحث سريع عن إجراء (بنص الإجراء، المستهدف، المنفذ، أو المتابع) — يبحث بكل المحاور للوصول السريع للتعديل</label>
      <input id="plan-search-input" type="search" placeholder="ابحث عن إجراء..." style="width:100%; box-sizing:border-box; padding:10px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
      <div id="plan-search-results" style="margin-top:8px;"></div>
    </div>
    <div id="plan-stats"></div>
    <div class="chip-row" id="plan-pillars"></div>
    <div id="plan-projects"></div>
  `;

  await renderStats(container.querySelector("#plan-stats"));

  const pillarsRoot = container.querySelector("#plan-pillars");
  const projectsRoot = container.querySelector("#plan-projects");
  const searchInput = container.querySelector("#plan-search-input");
  const searchResultsRoot = container.querySelector("#plan-search-results");
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

  const jumpToAction = async (projectId, no) => {
    searchInput.value = "";
    searchResultsRoot.innerHTML = "";
    const project = await getProject(projectId);
    if (!project) return;
    await selectPillar(project.pillar);
    state.editingAction = { projectId, no };
    state.addingActionFor = null;
    await draw();
    projectsRoot.querySelector(`[data-project="${CSS.escape(projectId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  searchInput.addEventListener("input", async () => {
    const query = searchInput.value;
    if (!query.trim()) {
      searchResultsRoot.innerHTML = "";
      return;
    }
    const results = await searchActions(query);
    renderSearchResults(searchResultsRoot, results, jumpToAction);
  });
}
