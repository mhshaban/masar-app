import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/fake-cloud-backend.mjs";
import { clear } from "../src/services/cloud-runtime.js";
import { createAttendanceSheet, listAttendanceSheets } from "../src/modules/forms/attendance-service.js";
import {
  durationLabel, normalizeEventApproval, beneficiaryTotal,
  listEventApprovals, getEventApproval, saveEventApproval, removeEventApproval,
} from "../src/modules/forms/event-approval-service.js";

globalThis.__MASAR_TEST_AUTH__ = {
  getCurrentProfile: () => ({ id: "user-1", full_name: "مرشد تجريبي", email: "guide@example.com" }),
};

test.beforeEach(async () => { await clear("attendanceSheets"); });

test("durationLabel() turns a time range into Arabic hours and minutes", () => {
  assert.equal(durationLabel("08:00", "09:00"), "ساعة");
  assert.equal(durationLabel("08:00", "10:00"), "ساعتان");
  assert.equal(durationLabel("08:00", "11:30"), "3 ساعات و30 دقيقة");
  assert.equal(durationLabel("08:00", "08:45"), "45 دقيقة");
  assert.equal(durationLabel("08:00", "09:15"), "ساعة و15 دقيقة");
  assert.equal(durationLabel("10:00", "09:00"), "");
  assert.equal(durationLabel("", "09:00"), "");
});

test("normalizeEventApproval() trims text, parses counts (Arabic digits too) and fills the duration", () => {
  const record = normalizeEventApproval({
    title: "  ورشة تمكين  ", startTime: "09:00", endTime: "10:30",
    ben_students: "٥١", ben_teachers: "4", ben_others: "abc", other_guardians: "-2", other_students: "3",
  });
  assert.equal(record.kind, "approval");
  assert.equal(record.title, "ورشة تمكين");
  assert.equal(record.duration, "ساعة و30 دقيقة");
  assert.deepEqual(record.beneficiaries, { teachers: "4", students: "51", admins: "", guardians: "", others: "" });
  assert.deepEqual(record.otherSchoolBeneficiaries, { teachers: "", students: "3", admins: "", guardians: "" });
  assert.equal(beneficiaryTotal(record.beneficiaries), 55);
  // مدة كتبها المستخدم بنفسه لا تُستبدل.
  assert.equal(normalizeEventApproval({ startTime: "09:00", endTime: "10:00", duration: "حصتان" }).duration, "حصتان");
});

test("normalizeEventApproval() round-trips a saved record (used when printing from the log)", () => {
  const saved = normalizeEventApproval({ title: "ندوة", ben_students: "20", other_teachers: "2" });
  const again = normalizeEventApproval(saved);
  assert.deepEqual(again.beneficiaries, saved.beneficiaries);
  assert.deepEqual(again.otherSchoolBeneficiaries, saved.otherSchoolBeneficiaries);
});

test("event approvals are saved in attendanceSheets without students and kept apart from the sheets", async () => {
  await assert.rejects(() => saveEventApproval(null, { title: " " }), /اسم الفعالية/);
  await createAttendanceSheet({ title: "كشف", students: [{ id: "s1", name: "طالب" }] });
  const created = await saveEventApproval(null, { title: "محاضرة التخصصات", date: "2026-10-20", ben_students: "40" });
  assert.equal(created.kind, "approval");
  assert.equal(created.createdByName, "مرشد تجريبي");
  assert.equal((await listAttendanceSheets()).length, 2);
  assert.deepEqual((await listEventApprovals()).map((r) => r.title), ["محاضرة التخصصات"]);

  await saveEventApproval(created.id, { title: "محاضرة التخصصات المهنية", ben_students: "45" });
  const updated = await getEventApproval(created.id);
  assert.equal(updated.title, "محاضرة التخصصات المهنية");
  assert.equal(updated.beneficiaries.students, "45");
  assert.equal(updated.createdByName, "مرشد تجريبي");

  const sheet = (await listAttendanceSheets()).find((r) => r.kind !== "approval");
  assert.equal(await getEventApproval(sheet.id), null);

  await removeEventApproval(created.id);
  assert.deepEqual(await listEventApprovals(), []);
});
