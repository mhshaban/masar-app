import "./helpers/fake-cloud-backend.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFeederSchoolAnalysis, shortSchoolName } from "../src/modules/grades/feeder-schools-service.js";
import { feederReportMarkup, schoolStudentsMarkup } from "../src/modules/grades/feeder-schools-ui.js";

const prep = (school, average, math = 80, arabic = 80, english = 80, science = 80) => ({ school, average, math, arabic, english, science });
const students = [
  { id: "1", academicId: "A1", name: "أ", level: "الأول", section: "١تلم١", track: "الصناعي", prepSchoolResults: prep("مدرسة عالي الإعدادية للبنين", 95, 90, 98, 96, 94) },
  { id: "2", academicId: "A2", name: "ب", level: "الأول", section: "١تلم١", track: "الصناعي", prepSchoolResults: prep("مدرسة عالي الإعدادية للبنين", 75, 60, 80, 70, 90) },
  { id: "3", academicId: "A3", name: "ج", level: "الأول", section: "١تجر١", track: "التجاري", prepSchoolResults: prep("مدرسة الرفاع الإعدادية للبنين", 88) },
  { id: "4", name: "د", level: "الأول", section: "١تجر١", track: "التجاري", prepSchoolResults: null },
  { id: "5", name: "هـ", level: "الثاني", section: "٣محك١", prepSchoolResults: prep("مدرسة الرفاع الإعدادية للبنين", 50) },
];
const cps = [
  { studentId: "A1", checkpoint: 1, term: "T1", averagePct: 90 },
  { studentId: "A2", checkpoint: 1, term: "T1", averagePct: 60 },
  { studentId: "A2", checkpoint: 1, term: "T0", averagePct: 10 },
];

test("groups level-1 students by feeder school with averages, ratings and subjects", () => {
  const a = buildFeederSchoolAnalysis(students, cps);
  assert.equal(a.level1Count, 4);
  assert.equal(a.withPrepCount, 3);
  assert.equal(a.withoutPrepCount, 1);
  assert.equal(a.schoolCount, 2);
  const aali = a.schools[0];
  assert.equal(aali.shortName, "عالي");
  assert.equal(aali.count, 2);
  assert.equal(aali.avg, 85);
  assert.equal(aali.ratings["ممتاز"], 1);
  assert.equal(aali.ratings["جيد"], 1);
  assert.equal(aali.subjects.math, 75);
  assert.equal(aali.weakestSubject, "math");
  assert.equal(aali.strongestSubject, "science");
  assert.deepEqual(a.checkpoints, [1]);
  assert.equal(aali.checkpoints[1].avg, 75); // latest term only
  assert.equal(a.overall.count, 3);
});

test("track filter and short names", () => {
  const a = buildFeederSchoolAnalysis(students, [], { track: "التجاري" });
  assert.equal(a.level1Count, 2);
  assert.equal(a.withPrepCount, 1);
  assert.equal(shortSchoolName("مدرسة مدينة عيسى الابتدائية الإعدادية للبنين"), "مدينة عيسى الابتدائية الإعدادية");
});

test("print markup includes every school and student", () => {
  const a = buildFeederSchoolAnalysis(students, cps);
  const html = feederReportMarkup(a, "");
  assert.match(html, /forms-print/);
  assert.match(html, />عالي</);
  assert.match(html, />الرفاع</);
  const list = schoolStudentsMarkup(a.schools[0], a, "");
  assert.match(list, /١تلم١/);
});

test("compact names keep the type only when two schools share a town", async () => {
  const { compactSchoolNames } = await import("../src/modules/grades/feeder-schools-service.js");
  const m = compactSchoolNames(["مدرسة مدينة عيسى الإعدادية للبنين", "مدرسة مدينة عيسى الابتدائية الإعدادية للبنين", "مدرسة جو الابتدائية الإعدادية للبنين"]);
  assert.equal(m.get("مدرسة مدينة عيسى الإعدادية للبنين"), "مدينة عيسى الإعدادية");
  assert.equal(m.get("مدرسة مدينة عيسى الابتدائية الإعدادية للبنين"), "مدينة عيسى الابتدائية الإعدادية");
  assert.equal(m.get("مدرسة جو الابتدائية الإعدادية للبنين"), "جو");
});

test("view helpers sort, hide small schools and build findings", async () => {
  const { viewOf, keyFindings, sectionPrintMarkup } = await import("../src/modules/grades/feeder-schools-ui.js");
  const a = buildFeederSchoolAnalysis(students, cps);
  assert.deepEqual(viewOf(a, { sort: "avg-desc" }).schools.map((s) => s.shortName), ["الرفاع", "عالي"]);
  assert.deepEqual(viewOf(a, { sort: "avg-asc", subject: "math" }).schools.map((s) => s.shortName), ["عالي", "الرفاع"]);
  assert.equal(viewOf(a, { hideSmall: true }).schools.length, 0);
  assert.ok(keyFindings(a).length >= 2);
  for (const v of ["overview", "average", "subjects", "checkpoints"]) assert.match(sectionPrintMarkup(v, a, ""), /forms-print/);
  assert.match(sectionPrintMarkup("subjects", a, "", { subject: "math" }), /ترتيب المدارس في الرياضيات/);
});
