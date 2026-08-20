import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear, get, list } from "../src/services/cloud-runtime.js";
import {
  createProject, updateProject, deleteProject, getProject,
  addAction, updateAction, deleteAction, searchActions,
} from "../src/modules/department-plan/department-plan-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("createProject requires a pillar and a non-empty title", async () => {
  await assert.rejects(() => createProject({ pillar: "", project_title: "x" }));
  await assert.rejects(() => createProject({ pillar: "القيادة", project_title: "  " }));
});

test("createProject saves an empty actions array ready for addAction", async () => {
  const project = await createProject({ pillar: "القيادة", project_title: "مشروع جديد" });
  assert.deepEqual(project.actions, []);
  assert.equal(project.pillar, "القيادة");
});

test("updateProject patches only the given fields", async () => {
  const project = await createProject({ pillar: "القيادة", project_title: "أصلي", team_lead: "أحمد" });
  const updated = await updateProject(project.id, { project_title: "معدَّل" });
  assert.equal(updated.project_title, "معدَّل");
  assert.equal(updated.team_lead, "أحمد");
});

test("addAction assigns a `no` past the current max, never reusing an existing one", async () => {
  const project = await createProject({ pillar: "القيادة", project_title: "م" });
  const a1 = await addAction(project.id, { action: "إجراء أول" });
  const a2 = await addAction(project.id, { action: "إجراء ثاني" });
  assert.equal(a1.no, 1);
  assert.equal(a2.no, 2);

  await deleteAction(project.id, 1);
  const a3 = await addAction(project.id, { action: "إجراء ثالث" });
  assert.equal(a3.no, 3, "must not reuse no=1 after it was deleted");
});

test("addAction requires non-empty action text", async () => {
  const project = await createProject({ pillar: "القيادة", project_title: "م" });
  await assert.rejects(() => addAction(project.id, { action: "" }));
});

test("updateAction patches one action by `no` without touching its `no` or other actions", async () => {
  const project = await createProject({ pillar: "القيادة", project_title: "م" });
  await addAction(project.id, { action: "أ", target: "قديم" });
  await addAction(project.id, { action: "ب" });

  const updated = await updateAction(project.id, 1, { target: "جديد" });
  assert.equal(updated.no, 1);
  assert.equal(updated.target, "جديد");

  const fetched = await getProject(project.id);
  assert.equal(fetched.actions.find((a) => a.no === 2).action, "ب");
});

test("deleteAction removes the action and its actionProgress record", async () => {
  const project = await createProject({ pillar: "القيادة", project_title: "م" });
  const action = await addAction(project.id, { action: "أ" });
  await bulkPut("actionProgress", [{ id: `${project.id}-a${action.no}`, status: "done" }]);

  await deleteAction(project.id, action.no);

  const fetched = await getProject(project.id);
  assert.equal(fetched.actions.length, 0);
  assert.equal(await get("actionProgress", `${project.id}-a${action.no}`), null);
});

test("searchActions matches by action text, target, executor, or follower across all pillars, not just one", async () => {
  const p1 = await createProject({ pillar: "القيادة", project_title: "م1" });
  const p2 = await createProject({ pillar: "التطور الشخصي", project_title: "م2" });
  await addAction(p1.id, { action: "متابعة حالة الطالب الغائب", target: "الطلاب المتعثرون", executor: "أحمد" });
  await addAction(p2.id, { action: "لا علاقة له بالبحث", target: "شي آخر", executor: "أحمد" });

  const byActionText = await searchActions("الطالب الغائب");
  assert.equal(byActionText.length, 1);
  assert.equal(byActionText[0].projectId, p1.id);
  assert.equal(byActionText[0].pillar, "القيادة");

  const byExecutor = await searchActions("أحمد");
  assert.equal(byExecutor.length, 2, "must search across every pillar, not just the currently viewed one");
});

test("searchActions returns nothing for an empty query instead of every action", async () => {
  const project = await createProject({ pillar: "القيادة", project_title: "م" });
  await addAction(project.id, { action: "أ" });
  assert.deepEqual(await searchActions(""), []);
  assert.deepEqual(await searchActions("   "), []);
});

test("deleteProject cascades to every one of its actions' actionProgress records", async () => {
  const project = await createProject({ pillar: "القيادة", project_title: "م" });
  const a1 = await addAction(project.id, { action: "أ" });
  const a2 = await addAction(project.id, { action: "ب" });
  await bulkPut("actionProgress", [
    { id: `${project.id}-a${a1.no}`, status: "done" },
    { id: `${project.id}-a${a2.no}`, status: "ongoing" },
    { id: "other-project-a1", status: "done" },
  ]);

  await deleteProject(project.id);

  assert.equal(await get("departmentPlanProjects", project.id), null);
  assert.equal(await get("actionProgress", `${project.id}-a${a1.no}`), null);
  assert.equal(await get("actionProgress", `${project.id}-a${a2.no}`), null);
  assert.notEqual(await get("actionProgress", "other-project-a1"), null, "unrelated progress records must survive");
});
