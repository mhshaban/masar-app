import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/fake-cloud-backend.mjs";
import { clear } from "../src/services/cloud-runtime.js";
import {
  createAttendanceSheet, updateAttendanceSheet, listAttendanceSheets, getAttendanceSheet, removeAttendanceSheet,
} from "../src/modules/forms/attendance-service.js";

globalThis.__MASAR_TEST_AUTH__ = {
  getCurrentProfile: () => ({ id: "user-1", full_name: "مرشد تجريبي", email: "guide@example.com" }),
};

const baseData = {
  title: "زيارة ميدانية لمعرض التعليم العالي",
  location: "قاعة عيسى بن سلمان الثقافية",
  date: "2026-09-17",
  day: "الخميس",
  startTime: "09:00",
  endTime: "11:00",
  teachers: ["خالد بدري حامد", "فاطمة أحمد علي"],
  students: [
    { id: "s1", academicId: "2026001", name: "أحمد سالم", section: "٢تلم١" },
    { id: "s2", academicId: "2026002", name: "سارة خالد", section: "٢تلم١" },
  ],
};

test.beforeEach(async () => { await clear("attendanceSheets"); });

test("createAttendanceSheet stores the event data and actor, and requires a title and students", async () => {
  await assert.rejects(() => createAttendanceSheet({ ...baseData, title: "" }), /عنوان الفعالية/);
  await assert.rejects(() => createAttendanceSheet({ ...baseData, students: [] }), /الطلبة المشاركين/);

  const sheet = await createAttendanceSheet(baseData);
  assert.equal(sheet.title, baseData.title);
  assert.equal(sheet.location, baseData.location);
  assert.equal(sheet.startTime, "09:00");
  assert.equal(sheet.endTime, "11:00");
  assert.equal(sheet.students.length, 2);
  assert.equal(sheet.createdById, "user-1");
  assert.equal(sheet.createdByName, "مرشد تجريبي");
  assert.ok(sheet.createdAt);
  assert.ok(sheet.id);
});

test("listAttendanceSheets sorts by date, most recent first", async () => {
  await createAttendanceSheet({ ...baseData, title: "فعالية قديمة", date: "2026-09-01" });
  await createAttendanceSheet({ ...baseData, title: "فعالية حديثة", date: "2026-09-20" });
  const sheets = await listAttendanceSheets();
  assert.deepEqual(sheets.map((s) => s.title), ["فعالية حديثة", "فعالية قديمة"]);
});

test("updateAttendanceSheet edits an existing sheet, keeping its id and creation stamp", async () => {
  const created = await createAttendanceSheet(baseData);
  const updated = await updateAttendanceSheet(created.id, { ...baseData, title: "زيارة معدَّلة", students: [baseData.students[0]] });
  assert.equal(updated.id, created.id);
  assert.equal(updated.title, "زيارة معدَّلة");
  assert.equal(updated.students.length, 1);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.createdByName, "مرشد تجريبي");
  assert.equal(updated.updatedByName, "مرشد تجريبي");

  const fetched = await getAttendanceSheet(created.id);
  assert.equal(fetched.title, "زيارة معدَّلة");
});

test("updateAttendanceSheet rejects an unknown id", async () => {
  await assert.rejects(() => updateAttendanceSheet("missing", baseData), /غير موجود/);
});

test("removeAttendanceSheet deletes the sheet", async () => {
  const created = await createAttendanceSheet(baseData);
  await removeAttendanceSheet(created.id);
  assert.equal(await getAttendanceSheet(created.id), null);
  assert.deepEqual(await listAttendanceSheets(), []);
});
