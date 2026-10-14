import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/fake-cloud-backend.mjs";
import { clear } from "../src/services/cloud-runtime.js";
import { createAttendanceSheet, updateAttendanceSheet, listAttendanceSheets } from "../src/modules/forms/attendance-service.js";
import {
  consentOf, consentSummary, approvedStudents, defaultConsentText, consentTextOf,
  listEventFiles, getEventFile, setConsent, saveConsentText, removeEventFile,
} from "../src/modules/forms/event-file-service.js";

globalThis.__MASAR_TEST_AUTH__ = {
  getCurrentProfile: () => ({ id: "user-1", full_name: "مرشد تجريبي", email: "guide@example.com" }),
};

const students = [
  { id: "s1", academicId: "20240001", name: "أحمد", section: "٣كهر١" },
  { id: "s2", academicId: "20240002", name: "علي", section: "٣كهر١" },
  { id: "s3", academicId: "20240003", name: "يوسف", section: "٥تجر١" },
];
const base = { kind: "event", title: "زيارة معرض التعليم العالي", location: "مركز البحرين الدولي للمعارض", date: "2026-10-20", day: "الثلاثاء", startTime: "09:00", endTime: "12:30", students };

test.beforeEach(async () => { await clear("attendanceSheets"); });

test("defaultConsentText() fills the event details, and an edited text overrides it", () => {
  assert.equal(defaultConsentText(base), "نرجو من حضرتكم التكرم بالموافقة على مشاركة ابنكم في فعالية «زيارة معرض التعليم العالي» يوم الثلاثاء الموافق 2026-10-20 من الساعة 09:00 صباحًا حتى الساعة 12:30 مساءً في مركز البحرين الدولي للمعارض، علمًا بأن الطلبة سيكونون برفقة المعلمين المرافقين طوال مدة الفعالية.");
  assert.equal(defaultConsentText({ title: "ندوة" }), "نرجو من حضرتكم التكرم بالموافقة على مشاركة ابنكم في فعالية «ندوة»، علمًا بأن الطلبة سيكونون برفقة المعلمين المرافقين طوال مدة الفعالية.");
  assert.equal(consentTextOf({ ...base, consentText: "  نص معدّل " }), "نص معدّل");
  assert.equal(consentTextOf(base), defaultConsentText(base));
});

test("consent summary counts approved/declined/pending and the attendance sheet is only the approved students", () => {
  const event = { ...base, consents: { s1: "approved", s3: "declined", ghost: "approved" } };
  assert.equal(consentOf(event, students[1]), "pending");
  assert.deepEqual(consentSummary(event), { approved: 1, declined: 1, pending: 1, total: 3 });
  assert.deepEqual(approvedStudents(event).map((s) => s.name), ["أحمد"]);
});

test("event files are kept apart from sheets; consents are set, reset and survive editing the candidates", async () => {
  await assert.rejects(() => createAttendanceSheet({ ...base, students: [] }), /الطلبة/);
  await createAttendanceSheet({ title: "كشف قديم", students: [students[0]] });
  const created = await createAttendanceSheet(base);
  assert.equal((await listAttendanceSheets()).length, 2);
  assert.deepEqual((await listEventFiles()).map((e) => e.title), ["زيارة معرض التعليم العالي"]);

  await setConsent(created.id, students[0], "approved");
  await setConsent(created.id, students[1], "declined");
  await setConsent(created.id, students[1], "pending");
  let event = await getEventFile(created.id);
  assert.deepEqual(event.consents, { s1: "approved" });

  // تعديل المرشحين (المحرر لا يرسل consents) يبقي الردود المسجلة.
  await updateAttendanceSheet(created.id, { ...base, students: [...students, { id: "s4", name: "سالم" }] });
  event = await getEventFile(created.id);
  assert.deepEqual(event.consents, { s1: "approved" });
  assert.deepEqual(consentSummary(event), { approved: 1, declined: 0, pending: 3, total: 4 });

  await saveConsentText(created.id, "  نص خاص  ");
  assert.equal((await getEventFile(created.id)).consentText, "نص خاص");

  await removeEventFile(created.id);
  assert.deepEqual(await listEventFiles(), []);
});
