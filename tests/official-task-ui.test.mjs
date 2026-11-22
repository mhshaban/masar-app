import test from "node:test";
import assert from "node:assert/strict";
import { dayName, formatTime, formatDate, taskLines, officialTaskMarkup } from "../src/modules/forms/official-task-ui.js";

test("اليوم والتاريخ والوقت بصيغة الاستمارة", () => {
  assert.equal(dayName("2026-11-22"), "الأحد");
  assert.equal(dayName(""), "");
  assert.equal(formatDate("2026-11-22"), "22/11/2026");
  assert.equal(formatTime("09:30"), "09:30 ص");
  assert.equal(formatTime("13:05"), "01:05 م");
  assert.equal(formatTime(""), "");
});

test("نص المهمة يتوزع على خمسة أسطر والزائد يُدمج بالأخير", () => {
  assert.deepEqual(taskLines("أ\nب"), ["أ", "ب", "", "", ""]);
  assert.deepEqual(taskLines("1\n2\n3\n4\n5\n6"), ["1", "2", "3", "4", "5 6"]);
});

test("الاستمارة الفارغة فيها كل البنود وتُهرّب المدخلات", () => {
  const blank = officialTaskMarkup({});
  for (const label of ["اسم الموظف", "الرقم الشخصي", "الوظيفة", "اليوم", "التاريخ", "وقت المغادرة", "الوقت المتوقع للعودة", "المهمة الرسمية", "يوجد مرفق", "لا يوجد مرفق", "توقيع الموظف", "توقيع مدير المدرسة"]) {
    assert.ok(blank.includes(label), label);
  }
  assert.ok(!blank.includes("ot-foot"));
  assert.ok(officialTaskMarkup({ name: "<b>x</b>" }).includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(officialTaskMarkup({ attachment: "yes" }).includes("✓"));
});
