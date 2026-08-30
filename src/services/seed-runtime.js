import { PLAN_SEED, PROGRESS_SEED } from "./seed-data.js";
import { FOLLOWUP_ITEMS_SEED } from "./followup-seed-data.js";
import { ACTION_FOLLOWUP_LINKS } from "./action-followup-links.js";
import { DEFAULT_PROGRESS } from "../modules/execution/execution-service.js";
import { count, bulkPut } from "./storage-runtime.js";

function flattenPlan() {
  const projects = [];
  let n = 0;
  for (const pillar of Object.keys(PLAN_SEED)) {
    for (const project of PLAN_SEED[pillar]) {
      n += 1;
      projects.push({
        id: `plan-${n}`,
        pillar,
        ...project,
      });
    }
  }
  return projects;
}

function flattenProgress() {
  return PROGRESS_SEED.items.map((item, i) => ({
    id: `progress-${i + 1}`,
    ...item,
  }));
}

function seedActionLinks() {
  return Object.entries(ACTION_FOLLOWUP_LINKS).map(([actionId, followUpItemId]) => ({
    id: actionId,
    ...DEFAULT_PROGRESS,
    followUpItemId,
  }));
}

export async function seedIfEmpty() {
  const existing = await count("departmentPlanProjects");
  if (existing > 0) return { seeded: false };

  await bulkPut("departmentPlanProjects", flattenPlan());
  await bulkPut("agendaStatus", flattenProgress());
  await bulkPut("followUpItems", FOLLOWUP_ITEMS_SEED);
  await bulkPut("actionProgress", seedActionLinks());
  return { seeded: true, meta: PROGRESS_SEED.meta };
}
