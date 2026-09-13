import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { getAgendaProgressSummary, listAgendaEntries, groupByPeriod } from "../src/modules/agenda/agenda-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("getAgendaProgressSummary counts total actions and how many have not been started, from actionProgress status", async () => {
  await bulkPut("departmentPlanProjects", [
    { id: "p1", pillar: "القيادة", project_title: "م", actions: [{ no: 1, action: "أ" }, { no: 2, action: "ب" }, { no: 3, action: "ج" }] },
  ]);
  await bulkPut("actionProgress", [
    { id: "p1-a1", status: "done" },
    { id: "p1-a2", status: "ongoing" },
    // p1-a3 has no progress record at all — DEFAULT_PROGRESS.status is "not_started"
  ]);

  const summary = await getAgendaProgressSummary();
  assert.deepEqual(summary, { total: 3, done: 1, ongoing: 1, notStarted: 1 });
});

test("getAgendaProgressSummary returns zeros when there are no actions yet", async () => {
  const summary = await getAgendaProgressSummary();
  assert.deepEqual(summary, { total: 0, done: 0, ongoing: 0, notStarted: 0 });
});

test("listAgendaEntries includes projectId/no explicitly on each entry, not just the combined id string (project ids can contain '-', making id-splitting unreliable)", async () => {
  await bulkPut("departmentPlanProjects", [
    { id: "abc-123-def", pillar: "القيادة", project_title: "م", actions: [{ no: 7, action: "أ" }] },
  ]);
  const entries = await listAgendaEntries();
  assert.equal(entries[0].projectId, "abc-123-def");
  assert.equal(entries[0].no, 7);
});

test("listAgendaEntries carries the project's explicit order as projectOrder, falling back to Infinity when unset — the Word export groups programs by this, not by arbitrary fetch order", async () => {
  await bulkPut("departmentPlanProjects", [
    { id: "p1", pillar: "القيادة", project_title: "م", order: 3, actions: [{ no: 1, action: "أ" }] },
    { id: "p2", pillar: "القيادة", project_title: "ن", actions: [{ no: 1, action: "ب" }] },
  ]);
  const entries = await listAgendaEntries();
  assert.equal(entries.find((e) => e.projectId === "p1").projectOrder, 3);
  assert.equal(entries.find((e) => e.projectId === "p2").projectOrder, Infinity);
});

test("groupByPeriod orders groups by the month/week named in the period text itself, not by periodStart — the same period text is often tagged with wildly inconsistent periodStart values across its own actions (real bug reported by the counselor: whole groups jumped to the top of the list because one of their actions happened to carry an early periodStart, even though the text clearly names a later week)", async () => {
  await bulkPut("departmentPlanProjects", [
    {
      id: "p1",
      pillar: "القيادة",
      project_title: "م",
      actions: [
        // "الأسبوع الرابع" (متأخر بالنص) لكن periodStart مبكر جدًا (تقريب
        // خشن عند إدخال البيانات) — يجب ألا يقفز لأول الترتيب بسببه.
        { no: 1, action: "أ", period: "الأسبوع الرابع من سبتمبر", periodStart: "2026-09-01" },
        { no: 2, action: "ب", period: "الأسبوع الأول من سبتمبر", periodStart: "2026-09-17" },
        { no: 3, action: "ج", period: "الأسبوع الثاني من أكتوبر", periodStart: "2026-09-06" },
      ],
    },
  ]);

  const entries = await listAgendaEntries();
  const groups = await groupByPeriod(entries);
  assert.deepEqual([...groups.keys()], ["الأسبوع الأول من سبتمبر", "الأسبوع الرابع من سبتمبر", "الأسبوع الثاني من أكتوبر"]);
});

test("groupByPeriod orders months by the school year (starting September), not by the calendar month number — April/May of the following calendar year must sort after September-December, not before", async () => {
  await bulkPut("departmentPlanProjects", [
    {
      id: "p1",
      pillar: "القيادة",
      project_title: "م",
      actions: [
        { no: 1, action: "أ", period: "منتصف شهر أبريل" },
        { no: 2, action: "ب", period: "الأسبوع الأول من سبتمبر" },
        { no: 3, action: "ج", period: "الأسبوع الأول من نوفمبر" },
      ],
    },
  ]);

  const entries = await listAgendaEntries();
  const groups = await groupByPeriod(entries);
  assert.deepEqual([...groups.keys()], ["الأسبوع الأول من سبتمبر", "الأسبوع الأول من نوفمبر", "منتصف شهر أبريل"]);
});

test("groupByPeriod pushes the known whole-year/whole-term periods (no specific month) after every month-specific period, in the fixed order the counselor asked for, and pushes actions with no period text at all to the very end", async () => {
  await bulkPut("departmentPlanProjects", [
    {
      id: "p1",
      pillar: "القيادة",
      project_title: "م",
      actions: [
        { no: 1, action: "أ" }, // بلا period إطلاقًا
        { no: 2, action: "ب", period: "الفصل الدراسي الثاني" },
        { no: 3, action: "ج", period: "طوال العام الدراسي" },
        { no: 4, action: "د", period: "الأسبوع الأول من سبتمبر" },
        { no: 5, action: "هـ", period: "الفصلان الدراسيان" },
      ],
    },
  ]);

  const entries = await listAgendaEntries();
  const groups = await groupByPeriod(entries);
  assert.deepEqual([...groups.keys()], [
    "الأسبوع الأول من سبتمبر", "طوال العام الدراسي", "الفصلان الدراسيان", "الفصل الدراسي الثاني", "بلا فترة محددة",
  ]);
});

test("groupByPeriod also sorts the actions inside one group chronologically by periodStart (then periodEnd), not by their original order in the file", async () => {
  await bulkPut("departmentPlanProjects", [
    {
      id: "p1",
      pillar: "القيادة",
      project_title: "م",
      actions: [
        { no: 1, action: "يظهر ثالثًا بالملف لكنه أبكرهم", period: "طوال العام الدراسي", periodStart: "2026-09-01" },
        { no: 2, action: "يظهر أولًا بالملف لكنه أواخرهم", period: "طوال العام الدراسي", periodStart: "2026-11-01" },
        { no: 3, action: "بلا تاريخ — يُدفع لآخر المجموعة", period: "طوال العام الدراسي" },
        { no: 4, action: "يظهر رابعًا بالملف لكنه وسطهم", period: "طوال العام الدراسي", periodStart: "2026-10-01" },
      ],
    },
  ]);

  const entries = await listAgendaEntries();
  const groups = await groupByPeriod(entries);
  const order = groups.get("طوال العام الدراسي").map((e) => e.no);
  assert.deepEqual(order, [1, 4, 2, 3]);
});

test("listAgendaEntries passes periodStart/periodEnd through from the action record", async () => {
  await bulkPut("departmentPlanProjects", [
    { id: "p1", pillar: "القيادة", project_title: "م", actions: [{ no: 1, action: "أ", periodStart: "2026-09-01", periodEnd: "2026-09-10" }] },
  ]);
  const entries = await listAgendaEntries();
  assert.equal(entries[0].periodStart, "2026-09-01");
  assert.equal(entries[0].periodEnd, "2026-09-10");
});
