import { list as listAll, get, save, remove } from "../../services/cloud-runtime.js";

const PILLAR_ORDER = ["الانجاز الاكاديمي", "التطور الشخصي", "القيادة"];
export const PILLARS = PILLAR_ORDER;

export async function listPillars() {
  const projects = await listAll("departmentPlanProjects");
  const present = new Set(projects.map((p) => p.pillar));
  return PILLAR_ORDER.filter((p) => present.has(p));
}

export async function listProjectsByPillar(pillar) {
  const projects = await listAll("departmentPlanProjects");
  return projects.filter((p) => p.pillar === pillar);
}

export async function getPlanStats() {
  const projects = await listAll("departmentPlanProjects");
  const byPillar = {};
  for (const p of projects) {
    if (!byPillar[p.pillar]) byPillar[p.pillar] = { projects: 0, actions: 0 };
    byPillar[p.pillar].projects += 1;
    byPillar[p.pillar].actions += (p.actions || []).length;
  }
  const totalProjects = projects.length;
  const totalActions = projects.reduce((sum, p) => sum + (p.actions || []).length, 0);
  return { totalProjects, totalActions, byPillar };
}

export async function getProgressStats() {
  const items = await listAll("agendaStatus");
  const stats = { total: items.length, done: 0, ongoing: 0, not_done: 0, unknown: 0 };
  for (const item of items) {
    stats[item.status] = (stats[item.status] || 0) + 1;
  }
  return stats;
}

export async function listProgressItems() {
  return listAll("agendaStatus");
}

export async function getProject(id) {
  return get("departmentPlanProjects", id);
}

export async function createProject({ pillar, project_title, program_name, goal_specific, team_lead }) {
  if (!pillar) throw new Error("المحور مطلوب");
  if (!project_title || !project_title.trim()) throw new Error("عنوان المشروع مطلوب");
  return save("departmentPlanProjects", {
    pillar,
    project_title: project_title.trim(),
    program_name: program_name ? program_name.trim() : "",
    goal_specific: goal_specific ? goal_specific.trim() : "",
    team_lead: team_lead ? team_lead.trim() : "",
    actions: [],
  });
}

export async function updateProject(id, patch) {
  const project = await get("departmentPlanProjects", id);
  if (!project) return null;
  const next = { ...project, ...patch };
  await save("departmentPlanProjects", next);
  return next;
}

// Cascades to actionProgress so a deleted project doesn't leave orphaned
// execution/follow-up records pointing at actions that no longer exist.
export async function deleteProject(id) {
  const project = await get("departmentPlanProjects", id);
  if (project) {
    for (const action of project.actions || []) {
      await remove("actionProgress", `${id}-a${action.no}`);
    }
  }
  return remove("departmentPlanProjects", id);
}

// New actions get a `no` past the current max, never reusing or renumbering
// an existing one — action ids downstream (execution progress, follow-up
// links) are `${projectId}-a${no}`, so renumbering would silently sever
// those links.
export async function addAction(projectId, { action, target, executor, follower, evidence, period }) {
  if (!action || !action.trim()) throw new Error("نص الإجراء مطلوب");
  const project = await get("departmentPlanProjects", projectId);
  if (!project) throw new Error("تعذّر إيجاد المشروع");
  const actions = project.actions || [];
  const nextNo = actions.length ? Math.max(...actions.map((a) => Number(a.no) || 0)) + 1 : 1;
  const newAction = {
    no: nextNo,
    action: action.trim(),
    target: target || "",
    executor: executor || "",
    follower: follower || "",
    evidence: evidence || "",
    period: period || "",
  };
  await save("departmentPlanProjects", { ...project, actions: [...actions, newAction] });
  return newAction;
}

export async function updateAction(projectId, no, patch) {
  const project = await get("departmentPlanProjects", projectId);
  if (!project) return null;
  const actions = (project.actions || []).map((a) => (a.no === no ? { ...a, ...patch, no } : a));
  await save("departmentPlanProjects", { ...project, actions });
  return actions.find((a) => a.no === no) || null;
}

// Also removes that action's actionProgress record (its effectiveness
// report, evidence, follow-up link) — nothing should keep pointing at an
// action that was just deleted.
export async function deleteAction(projectId, no) {
  const project = await get("departmentPlanProjects", projectId);
  if (!project) return;
  const actions = (project.actions || []).filter((a) => a.no !== no);
  await save("departmentPlanProjects", { ...project, actions });
  await remove("actionProgress", `${projectId}-a${no}`);
}
