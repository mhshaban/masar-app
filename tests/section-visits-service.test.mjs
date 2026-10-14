import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/fake-cloud-backend.mjs";
import { clear } from "../src/services/cloud-runtime.js";
import { createAttendanceSheet, listAttendanceSheets } from "../src/modules/forms/attendance-service.js";
import {
  scheduleSections, campaignProgress, listCampaigns, getCampaign, saveCampaign, setSectionVisited, removeCampaign,
} from "../src/modules/schedule/section-visits-service.js";

globalThis.__MASAR_TEST_AUTH__ = {
  getCurrentProfile: () => ({ id: "user-1", full_name: "مرشد تجريبي", email: "guide@example.com" }),
};

test.beforeEach(async () => { await clear("attendanceSheets"); });

test("scheduleSections() lists each section once with its level and sessions, ordered by level", () => {
  const sections = scheduleSections([
    { section: "٥تجر١", session: "مسائي" }, { section: "١تلم٢", session: "صباحي" },
    { section: "١تلم٢", session: "صباحي" }, { section: "٣كهر٢", session: "صباحي" }, { section: "٣كهر٢", session: "مسائي" },
    { section: "" },
  ]);
  assert.deepEqual(sections.map((s) => s.section), ["١تلم٢", "٣كهر٢", "٥تجر١"]);
  assert.deepEqual(sections.map((s) => s.level), ["الأول", "الثاني", "الثالث"]);
  assert.deepEqual(sections[1].sessions.sort(), ["صباحي", "مسائي"]);
});

test("campaignProgress() counts visited target sections and lists the remaining ones", () => {
  const p = campaignProgress({ targetSections: ["أ", "ب", "ج", "د"], visits: { أ: { date: "2026-10-14" }, ج: { date: "2026-10-14" }, ز: { date: "x" } } });
  assert.equal(p.total, 4);
  assert.equal(p.visited, 2);
  assert.equal(p.pct, 50);
  assert.deepEqual(p.remaining, ["ب", "د"]);
  assert.equal(campaignProgress({}).pct, 0);
});

test("campaigns are saved apart from event sheets, and visits are ticked, kept and unticked per section", async () => {
  await assert.rejects(() => saveCampaign(null, { title: "", targetSections: ["أ"] }), /اسم الإجراء/);
  await assert.rejects(() => saveCampaign(null, { title: "تعليمات", targetSections: [] }), /الشعب المستهدفة/);
  await createAttendanceSheet({ title: "كشف", students: [{ id: "s1", name: "طالب" }] });
  const created = await saveCampaign(null, { title: "  تعليمات اختيار التخصص ", notes: "زيارة صفية", targetSections: ["أ", "ب", "ب", "ج"] });
  assert.equal(created.title, "تعليمات اختيار التخصص");
  assert.deepEqual(created.targetSections, ["أ", "ب", "ج"]);
  assert.equal((await listAttendanceSheets()).length, 2);
  assert.deepEqual((await listCampaigns()).map((c) => c.title), ["تعليمات اختيار التخصص"]);

  await setSectionVisited(created.id, "أ", true);
  await setSectionVisited(created.id, "ب", true);
  let current = await getCampaign(created.id);
  assert.deepEqual(current.visits.أ, { date: new Date().toISOString().slice(0, 10), by: "مرشد تجريبي" });
  await setSectionVisited(created.id, "ب", false);
  current = await getCampaign(created.id);
  assert.deepEqual(Object.keys(current.visits), ["أ"]);

  // تعديل الشعب المستهدفة يحفظ زيارات الشعب الباقية ويسقط زيارات الشعب المحذوفة.
  await setSectionVisited(created.id, "ج", true);
  await saveCampaign(created.id, { title: "تعليمات اختيار التخصص", targetSections: ["أ", "د"] });
  current = await getCampaign(created.id);
  assert.deepEqual(Object.keys(current.visits), ["أ"]);
  assert.equal(campaignProgress(current).pct, 50);

  await removeCampaign(created.id);
  assert.deepEqual(await listCampaigns(), []);
});
