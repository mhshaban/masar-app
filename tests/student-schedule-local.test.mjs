import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScheduleFileKey, scheduleMatchScore } from "../src/modules/students/student-schedule-local.js";

test("normalizes Arabic digits and the PDF suffix in a section timetable name", () => {
  assert.equal(normalizeScheduleFileKey("١تجر١.pdf"), "1تجر1");
  assert.equal(normalizeScheduleFileKey("١تلم١.PDF"), "1تلم1");
});

test("matches a timetable whose filename is exactly the student's section", () => {
  assert.equal(scheduleMatchScore("١تجر١.pdf", { section: "١تجر١", academicId: "20260001" }), 100);
  assert.equal(scheduleMatchScore("١تلم١.pdf", { section: "١تلم١", academicId: "20260002" }), 100);
});

test("does not match another section with a similar year digit", () => {
  assert.equal(scheduleMatchScore("١تجر٢.pdf", { section: "١تجر١", academicId: "20260001" }), 0);
});

test("section timetable wins over a certificate named with the student's academic number", () => {
  const student = { section: "١تجر١", academicId: "20260001" };
  assert.ok(scheduleMatchScore("١تجر١.pdf", student) > scheduleMatchScore("20260001.pdf", student));
});
