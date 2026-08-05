import { list as listAll } from "../../services/cloud-runtime.js";
import { DEFAULT_PROGRESS } from "../execution/execution-service.js";

export async function listAgendaEntries() {
  const [projects, progressRecords] = await Promise.all([
    listAll("departmentPlanProjects"),
    listAll("actionProgress"),
  ]);
  const progressById = new Map(progressRecords.map((p) => [p.id, p]));

  const entries = [];
  for (const project of projects) {
    for (const action of project.actions || []) {
      const id = `${project.id}-a${action.no}`;
      entries.push({
        id,
        pillar: project.pillar,
        project_title: project.project_title,
        program_name: project.program_name,
        action: action.action,
        target: action.target,
        executor: action.executor,
        follower: action.follower,
        evidence: action.evidence,
        period: action.period,
        progress: progressById.get(id) || { id, ...DEFAULT_PROGRESS },
      });
    }
  }
  return entries;
}

export async function groupByPeriod(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.period || "بلا فترة محددة";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return groups;
}

export async function listFollowUpItemOptions() {
  const items = await listAll("followUpItems");
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items.map((item) => ({
    id: item.id,
    label: item.no === "*" ? item.title : `${item.no}. ${item.title}`,
  }));
}
