import test from "node:test";
import assert from "node:assert/strict";
import {
  academicYear, editedOn, templateDefaults, certificateMarkup, CERTIFICATE_TEMPLATES,
  studentRecipient, teacherRecipient, departmentRecipient,
} from "../src/modules/forms/certificates-ui.js";

test("العام الدراسي وتاريخ التحرير", () => {
  assert.equal(academicYear("2026-11-23"), "2026/2027");
  assert.equal(academicYear("2027-03-01"), "2026/2027");
  assert.equal(academicYear("2027-09-01"), "2027/2028");
  assert.equal(editedOn("2026-11-23"), "حرر في نوفمبر 2026");
  assert.equal(editedOn(""), "");
});

test("القوالب الخمسة موجودة وكلها تُرسم", () => {
  assert.deepEqual(Object.keys(CERTIFICATE_TEMPLATES), ["departments", "top", "staff", "email", "general"]);
  for (const key of Object.keys(CERTIFICATE_TEMPLATES)) {
    const html = certificateMarkup(key, { name: "محمد علي", title: "الطالب", sub: "20244001 | 1ك1", average: "98.5" }, { date: "2026-11-23" });
    assert.ok(html.includes("محمد علي"), key);
    assert.ok(html.includes("حرر في نوفمبر 2026"), key);
    assert.ok(html.includes("الثانوية الصناعية للبنين"), key);
  }
});

test("لا يظهر لقب «رئيس قسم الإرشاد الأكاديمي» في أي قالب", () => {
  for (const key of Object.keys(CERTIFICATE_TEMPLATES)) {
    assert.ok(!JSON.stringify(templateDefaults(key, "2026-11-23")).includes("رئيس قسم الإرشاد"), key);
  }
});

test("المعدل يظهر في قالب المتفوقين فقط وعند تعبئته", () => {
  const r = { name: "س", average: "98.50" };
  assert.ok(certificateMarkup("top", r).includes("98.50%"));
  assert.ok(!certificateMarkup("top", { ...r, average: "" }).includes("c-average"));
  assert.ok(!certificateMarkup("staff", r).includes("98.50"));
});

test("اللقب قبل الاسم في القوالب التي تستخدمه فقط، والمدخلات مُهرّبة", () => {
  assert.ok(certificateMarkup("email", { name: "أحمد", title: "الأستاذ" }).includes("الأستاذ / "));
  assert.ok(!certificateMarkup("top", { name: "أحمد", title: "الطالب" }).includes("الطالب / "));
  assert.ok(certificateMarkup("general", { name: "<b>x</b>" }).includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("تجهيز المستلمين من الطلاب والمعلمين والأقسام", () => {
  const st = { name: "هود صلاح", academicId: "20244001", section: "1ك2" };
  assert.equal(studentRecipient(st, "top").sub, "الرقم الاكاديمي 20244001 | شعبة 1ك2");
  assert.equal(studentRecipient(st, "general").sub, "20244001 | 1ك2");
  assert.equal(teacherRecipient({ name: "علي" }).title, "الأستاذ");
  assert.equal(departmentRecipient("الديزل").name, "قسم الديزل");
  assert.equal(departmentRecipient("قسم الكهرباء").name, "قسم الكهرباء");
});
