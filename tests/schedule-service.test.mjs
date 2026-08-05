import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear } from "../src/services/cloud-runtime.js";
import { normalizeSectionDigits, commitSchedule, getStudentSchedule, getOfficeHoursForTeachers, getScheduleSummary } from "../src/modules/schedule/schedule-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("normalizeSectionDigits converts Arabic-Indic digits to ASCII so sections from different sources compare equal", () => {
  assert.equal(normalizeSectionDigits("٢تلم١"), "2تلم1");
  assert.equal(normalizeSectionDigits("4تبد1"), "4تبد1");
});

test("commitSchedule replaces the whole collection rather than merging", async () => {
  await bulkPut("teacherSchedule", [{ id: "old-1", section: "2تلم1", day: 1, teacher: "قديم" }]);

  await commitSchedule({
    scheduleRows: [{ section: "2تلم1", day: 2, period: 3, subjectCode: "ريض813", teacher: "جديد", session: 1 }],
  });

  const rows = await getStudentSchedule("٢تلم١");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].teacher, "جديد");
});

test("getStudentSchedule matches by normalized section and sorts by day then session then period", async () => {
  await commitSchedule({
    scheduleRows: [
      { section: "2تلم1", day: 2, session: 1, period: 3, subjectCode: "ب" },
      { section: "2تلم1", day: 1, session: 2, period: 1, subjectCode: "ج" },
      { section: "2تلم1", day: 1, session: 1, period: 1, subjectCode: "أ" },
      { section: "4تبد1", day: 1, session: 1, period: 1, subjectCode: "لطالب آخر" },
    ],
  });

  const rows = await getStudentSchedule("٢تلم١");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.subjectCode), ["أ", "ج", "ب"]);
});

test("getOfficeHoursForTeachers returns only the requested teachers' office hours", async () => {
  await commitSchedule({
    officeHoursRows: [
      { teacher: "أحمد", day: "الأحد", period: 3 },
      { teacher: "سالم", day: "الاثنين", period: 5 },
    ],
  });

  const rows = await getOfficeHoursForTeachers(["أحمد", "غير موجود"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].teacher, "أحمد");
});

test("getScheduleSummary reports counts from both collections", async () => {
  await commitSchedule({
    scheduleRows: [{ section: "2تلم1", day: 1, subjectCode: "أ" }, { section: "2تلم1", day: 2, subjectCode: "ب" }],
    officeHoursRows: [{ teacher: "أحمد", day: "الأحد", period: 3 }],
  });
  const summary = await getScheduleSummary();
  assert.equal(summary.scheduleRowCount, 2);
  assert.equal(summary.officeHoursTeacherCount, 1);
});
