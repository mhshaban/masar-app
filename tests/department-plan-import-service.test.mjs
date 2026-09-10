import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, list } from "../src/services/cloud-runtime.js";
import { createProject, addAction } from "../src/modules/department-plan/department-plan-service.js";
import { parsePlanRows, previewPlanReplace, commitPlanReplace } from "../src/services/department-plan-import-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

const HEADER = [
  "م", "المحور", "البرنامج", "الاجراء", "الفئة المستهدفة", "الثبوتيات",
  "دور المكتب", "الأقسام المشاركة", "فترة التنفيذ", "تاريخ بدء التنفيذ المقترح",
  "تاريخ نهاية التنفيذ المقترح", "حالة التنفيذ", "بيانات الحصر المطلوبة", "مؤشر الأداء KPI", "المستهدف",
];

function row({ no, pillar, program, action, target = "", executor = "", follower = "", evidence = "", period = "", start = "", end = "" }) {
  return [no, pillar, program, action, target, evidence, executor, follower, period, start, end, "لم يبدأ", "", "", ""];
}

test("parsePlanRows groups actions under (pillar, program) projects in file order", () => {
  const rows = [
    ["عنوان الخطة"],
    HEADER,
    row({ no: 1, pillar: "الانجاز الاكاديمي", program: "١- برنامج أول", action: "إجراء أ" }),
    row({ no: 2, pillar: "الانجاز الاكاديمي", program: "١- برنامج أول", action: "إجراء ب" }),
    row({ no: 3, pillar: "التطور الشخصي", program: "٢- برنامج ثاني", action: "إجراء ج" }),
  ];
  const { projects, unknownPillars } = parsePlanRows(rows);
  assert.equal(unknownPillars.length, 0);
  assert.equal(projects.length, 2);
  assert.equal(projects[0].pillar, "الانجاز الاكاديمي");
  assert.equal(projects[0].project_title, "١- برنامج أول");
  assert.equal(projects[0].actions.length, 2);
  assert.equal(projects[0].actions[0].no, 1);
  assert.equal(projects[0].actions[1].no, 2);
  assert.equal(projects[1].pillar, "التطور الشخصي");
});

test("parsePlanRows maps دور المكتب to executor, الأقسام المشاركة to follower, and الفئة المستهدفة to target", () => {
  const rows = [
    ["عنوان"], HEADER,
    row({ no: 1, pillar: "القيادة", program: "ب", action: "إجراء", executor: "دور المكتب هنا", follower: "الأقسام المشاركة هنا", target: "طلاب المدرسة", evidence: "الثبوتيات هنا", period: "طوال العام" }),
  ];
  const { projects } = parsePlanRows(rows);
  const a = projects[0].actions[0];
  assert.equal(a.executor, "دور المكتب هنا");
  assert.equal(a.follower, "الأقسام المشاركة هنا");
  assert.equal(a.target, "طلاب المدرسة");
  assert.equal(a.evidence, "الثبوتيات هنا");
  assert.equal(a.period, "طوال العام");
});

test("parsePlanRows converts Excel serial dates to YYYY-MM-DD", () => {
  const rows = [
    ["عنوان"], HEADER,
    row({ no: 1, pillar: "القيادة", program: "ب", action: "إجراء", start: 46271, end: 46282 }),
  ];
  const { projects } = parsePlanRows(rows);
  assert.equal(projects[0].actions[0].periodStart, "2026-09-06");
  assert.equal(projects[0].actions[0].periodEnd, "2026-09-17");
});

test("parsePlanRows skips rows with an unrecognized pillar instead of throwing", () => {
  const rows = [
    ["عنوان"], HEADER,
    row({ no: 1, pillar: "محور غير معروف", program: "ب", action: "إجراء يُتجاهل" }),
    row({ no: 2, pillar: "القيادة", program: "ب", action: "إجراء صحيح" }),
  ];
  const { projects, unknownPillars } = parsePlanRows(rows);
  assert.deepEqual(unknownPillars, ["محور غير معروف"]);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].actions[0].action, "إجراء صحيح");
});

test("parsePlanRows throws when no header row is found", () => {
  assert.throws(() => parsePlanRows([["عنوان فقط"]]), /ترويسة/);
});

test("parsePlanRows throws when the file has no valid action rows", () => {
  assert.throws(() => parsePlanRows([["عنوان"], HEADER]), /إجراء صالح/);
});

test("previewPlanReplace reports pillars present in the current plan but missing from the new file", async () => {
  await createProject({ pillar: "القيادة", project_title: "مشروع قيادة قديم" });
  const { projects } = parsePlanRows([
    ["عنوان"], HEADER,
    row({ no: 1, pillar: "الانجاز الاكاديمي", program: "ب", action: "إجراء" }),
  ]);
  const preview = await previewPlanReplace(projects);
  assert.deepEqual(preview.droppedPillars, ["القيادة"]);
  assert.equal(preview.existingProjectsCount, 1);
  assert.equal(preview.newProjectsCount, 1);
});

test("commitPlanReplace writes the new plan then removes every old project and its action progress", async () => {
  const oldProject = await createProject({ pillar: "القيادة", project_title: "قديم" });
  const oldAction = await addAction(oldProject.id, { action: "إجراء قديم" });
  const { save } = await import("../src/services/cloud-runtime.js");
  await save("actionProgress", { id: `${oldProject.id}-a${oldAction.no}`, status: "done" });

  const { projects } = parsePlanRows([
    ["عنوان"], HEADER,
    row({ no: 1, pillar: "الانجاز الاكاديمي", program: "ب", action: "إجراء جديد" }),
  ]);
  const result = await commitPlanReplace(projects);

  assert.equal(result.projectsCount, 1);
  assert.equal(result.actionsCount, 1);
  assert.equal(result.removedProjectsCount, 1);

  const remainingProjects = await list("departmentPlanProjects");
  assert.equal(remainingProjects.length, 1);
  assert.equal(remainingProjects[0].pillar, "الانجاز الاكاديمي");

  const remainingProgress = await list("actionProgress");
  assert.equal(remainingProgress.length, 0, "orphaned actionProgress for the deleted project must be cleaned up");
});
