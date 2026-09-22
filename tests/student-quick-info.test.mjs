import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { loadAcademicFlagsMap, studentQuickInfo, studentQuickInfoLine, studentQuickCard } from "../src/modules/shared/student-quick-info.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("studentQuickInfo reads phone, GPA and barred/failing flags for a matching student", async () => {
  await bulkPut("academicFlags", [
    {
      id: "s1", studentId: "s1", finalCumulativeAverage: 62.4,
      subjects: [{ subject: "الرياضيات", pct: 40 }, { subject: "العلوم", pct: 88 }],
      barredCount: 1,
    },
  ]);
  const flagsMap = await loadAcademicFlagsMap();
  const student = { id: "s1", phones: ["17001234", "17005678"] };
  const info = studentQuickInfo(student, flagsMap);
  assert.equal(info.phone, "17001234");
  assert.equal(info.finalCumulativeAverage, 62.4);
  assert.deepEqual(info.reasons, ["رسوب في 1 مادة", "محروم في 1 مادة"]);
});

test("studentQuickInfo falls back to the student record's own average and stays empty for a clean student", async () => {
  const student = { id: "s2", phones: [], finalCumulativeAverage: 91 };
  const info = studentQuickInfo(student, new Map());
  assert.equal(info.phone, "");
  assert.equal(info.finalCumulativeAverage, 91);
  assert.deepEqual(info.reasons, []);
});

test("studentQuickInfoLine joins available parts and skips missing ones", () => {
  assert.equal(studentQuickInfoLine({ phone: "17001234", finalCumulativeAverage: 75, reasons: [] }), "17001234 · المعدل 75٪");
  assert.equal(studentQuickInfoLine({ phone: "", finalCumulativeAverage: null, reasons: [] }), "");
  assert.equal(studentQuickInfoLine({ phone: "", finalCumulativeAverage: 40, reasons: ["رسوب في 1 مادة"] }), "المعدل 40٪ · رسوب في 1 مادة");
});

test("studentQuickCard renders an empty placeholder without a student and escapes values otherwise", () => {
  assert.match(studentQuickCard(null, null), /لم يتم اختيار طالب بعد/);
  const html = studentQuickCard({ name: "<b>طالب</b>", academicId: "123" }, { phone: "17001234", finalCumulativeAverage: 88, reasons: ["محروم في 1 مادة"] });
  assert.match(html, /&lt;b&gt;طالب&lt;\/b&gt;/);
  assert.match(html, /88٪/);
  assert.match(html, /محروم في 1 مادة/);
});
