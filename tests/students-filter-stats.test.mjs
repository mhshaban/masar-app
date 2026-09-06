import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear } from "../src/services/cloud-runtime.js";
import { buildLevelTrackBreakdown, studentTrackGroup, normalizeSectionFilter, searchStudentsPage, listStudentsForSection, getFilterOptions } from "../src/modules/students/students-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("level dashboard splits every level into industrial and commercial counts", () => {
  const result = buildLevelTrackBreakdown([
    { level: "الأول", section: "١تلم١", track: "الصناعي" }, { level: "الأول", section: "١تلم٢", track: "الصناعي" },
    { level: "الأول", section: "١تجر١", track: "التجاري" }, { level: "الثاني", section: "٣محك١", track: "التجاري" },
    { level: "الثالث", section: "٥ديز١", track: "الصناعي" },
  ]);
  assert.deepEqual(result, {
    الأول: { الصناعي: 2, التجاري: 1 },
    الثاني: { الصناعي: 0, التجاري: 1 },
    الثالث: { الصناعي: 1, التجاري: 0 },
  });
});

test("track grouping trusts the corrected roster field and only falls back to the section when missing", () => {
  assert.equal(studentTrackGroup({ section: "٣محك١", track: "التجاري" }), "التجاري");
  assert.equal(studentTrackGroup({ section: "١تجر١", track: null }), "التجاري");
  assert.equal(studentTrackGroup({ section: "١تلم١", track: "الصناعي" }), "الصناعي");
});

test("section filter accepts Western digits and returns only that exact section", async () => {
  await bulkPut("students", [
    { id: "1", name: "طالب أول", section: "١تجر١", level: "الأول", track: "التجاري" },
    { id: "2", name: "طالب ثان", section: "١تجر٢", level: "الأول", track: "التجاري" },
  ]);
  assert.equal(normalizeSectionFilter("1تجر1"), "١تجر١");
  const page = await searchStudentsPage({ section: "1تجر1" });
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].id, "1");
  const printable = await listStudentsForSection("1تجر1");
  assert.deepEqual(printable.map((student) => student.id), ["1"]);
});

test("section choices come from the current roster without duplicates", async () => {
  await bulkPut("students", [
    { id: "1", section: "١تجر١" },
    { id: "2", section: "١تجر١" },
    { id: "3", section: "٣محك١" },
  ]);
  const options = await getFilterOptions();
  assert.deepEqual(options.sections, ["١تجر١", "٣محك١"]);
});
