import test from "node:test";
import assert from "node:assert/strict";
import { scheduleCourseRows, normalizeCode, courseName } from "../src/modules/grades/checkpoint-schedule.js";

const rowsFor = (codes, subjects) => Object.fromEntries(scheduleCourseRows(codes, subjects).map((r) => [r.code, r.note]));

test("normalizes Eng/انج codes", () => {
  assert.equal(normalizeCode("Eng 801"), "انج801");
  assert.equal(normalizeCode("انج 807"), "انج807");
  assert.equal(courseName("سار803"), "السيارات");
  assert.equal(courseName("ريض807"), "الرياضيات");
});

test("level-2 industrial: graded courses skipped, دين/وطن pending, practical continuous", () => {
  const codes = "انج807,انج883,بدن803,دين803,رسم813,رشد803,ريض807,سار803,عرب803,كيم803,ميك803,وطن809".split(",");
  const subjects = [
    { code: "", name: "الرسم الفني" }, { code: "انج 807", name: "اللغة الإنجليزية" },
    { code: "", name: "الرياضيات" }, { code: "", name: "العلوم" }, { code: "", name: "اللغة العربية" },
  ];
  assert.deepEqual(rowsFor(codes, subjects), {
    انج883: "pending", دين803: "pending", وطن809: "pending",
    بدن803: "continuous", رشد803: "continuous", سار803: "continuous", ميك803: "continuous",
  });
  // «لم تُرصد بعد» قبل «تقويم مستمر»
  const notes = scheduleCourseRows(codes, subjects).map((r) => r.note);
  assert.deepEqual(notes, [...notes].sort((a, b) => (a === b ? 0 : a === "pending" ? -1 : 1)));
});

test("level-1 commercial: uncoded المواد التجارية covers قصد; Eng 801 code matches انج801", () => {
  const codes = "انج801,انج811,بدن801,بيع801,حيا801,دين801,رشد801,ريض813,عرب801,قصد801,محك801,وطن801".split(",");
  const subjects = [
    { code: "دين 801", name: "التربية الإسلامية" }, { code: "Eng 801", name: "اللغة الإنجليزية" }, { code: "انج 811", name: "اللغة الإنجليزية" },
    { code: "", name: "الرياضيات" }, { code: "", name: "العلوم" }, { code: "", name: "المواد التجارية" },
  ];
  assert.deepEqual(rowsFor(codes, subjects), { عرب801: "pending", وطن801: "pending", بدن801: "continuous", بيع801: "continuous", رشد801: "continuous", محك801: "continuous" });
});

test("uncoded checkpoint subjects get their codes from the schedule", async () => {
  const { fillMissingCodes } = await import("../src/modules/grades/checkpoint-schedule.js");
  const subjects = [
    { code: "", name: "الرياضيات" },
    { code: "", name: "العلوم" },
    { code: "انج 807", name: "اللغة الإنجليزية" },
    { code: "", name: "مادة غير موجودة" },
  ];
  fillMissingCodes(["ريض807", "فيز801", "كيم801", "انج807", "بدن803"], subjects);
  assert.equal(subjects[0].code, "ريض807");
  assert.equal(subjects[1].code, "فيز801 / كيم801");
  assert.equal(subjects[2].code, "انج807");
  assert.equal(subjects[3].code, "");
});
