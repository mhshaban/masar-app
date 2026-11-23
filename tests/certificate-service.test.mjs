import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/fake-cloud-backend.mjs";
import { clear } from "../src/services/cloud-runtime.js";
import { createAttendanceSheet } from "../src/modules/forms/attendance-service.js";
import { CERTIFICATE_TEMPLATES } from "../src/modules/forms/certificates-ui.js";
import {
  normalizeCertificateRecord, listCertificates, getCertificate, saveCertificate, removeCertificate,
} from "../src/modules/forms/certificate-service.js";

globalThis.__MASAR_TEST_AUTH__ = {
  getCurrentProfile: () => ({ id: "user-1", full_name: "مرشد تجريبي", email: "guide@example.com" }),
};

test.beforeEach(async () => { await clear("attendanceSheets"); });

const input = (over = {}) => ({
  templateKey: "top", title: "", date: "2026-11-23",
  settings: { intro: "مقدمة", body: "سبب", closing: "ختام", date: "2026-11-23", signers: [{ name: "م", title: "مدير المدرسة" }] },
  recipients: [{ name: " هود ", title: "الطالب", sub: "20244001 | 2ك3", average: "98.5" }, { name: "  " }],
  ...over,
});

test("normalizeCertificateRecord() يشذّب المستلمين ويحذف الفارغ ويعطي عنوانًا افتراضيًا", () => {
  const r = normalizeCertificateRecord(input(), CERTIFICATE_TEMPLATES);
  assert.equal(r.kind, "certificate");
  assert.equal(r.title, "تهنئة المتفوقين");
  assert.equal(r.recipients.length, 1);
  assert.equal(r.recipients[0].name, "هود");
  assert.equal(r.settings.date, undefined);
  assert.throws(() => normalizeCertificateRecord(input({ recipients: [] }), CERTIFICATE_TEMPLATES), /مستلم/);
  assert.throws(() => normalizeCertificateRecord(input({ templateKey: "x" }), CERTIFICATE_TEMPLATES), /قالب/);
});

test("حفظ وتعديل وحذف سجل الشهادات، والسجل لا يخلط بقية سجلات الفعاليات", async () => {
  await createAttendanceSheet({ kind: "approval", title: "استمارة اعتماد" });
  const saved = await saveCertificate(null, normalizeCertificateRecord(input({ title: "تكريم الفصل الأول" }), CERTIFICATE_TEMPLATES));
  assert.equal(saved.createdByName, "مرشد تجريبي");
  let list = await listCertificates();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "تكريم الفصل الأول");

  await saveCertificate(saved.id, normalizeCertificateRecord(input({ title: "معدّل", recipients: [{ name: "أ" }, { name: "ب" }] }), CERTIFICATE_TEMPLATES));
  const updated = await getCertificate(saved.id);
  assert.equal(updated.title, "معدّل");
  assert.equal(updated.recipients.length, 2);
  assert.equal(updated.createdAt, saved.createdAt);

  await removeCertificate(saved.id);
  list = await listCertificates();
  assert.equal(list.length, 0);
});

test("أماكن القالب تُحفظ وتُقرأ ولا تظهر في سجل الشهادات", async () => {
  const { getCertificateLayout, saveCertificateLayout } = await import("../src/modules/forms/certificate-service.js");
  assert.deepEqual(await getCertificateLayout("top"), {});
  await saveCertificateLayout("top", { text: { x: 3, y: -2, size: 95 } });
  await saveCertificateLayout("top", { text: { x: 4 } });
  assert.deepEqual(await getCertificateLayout("top"), { text: { x: 4 } });
  assert.deepEqual(await getCertificateLayout("email"), {});
  assert.equal((await listCertificates()).length, 0);
});
