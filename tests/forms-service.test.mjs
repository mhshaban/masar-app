import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/fake-cloud-backend.mjs";
import { clear } from "../src/services/cloud-runtime.js";
import { createDepartmentForm, listDepartmentForms, updateDepartmentForm, saveTeacher, listTeachers, importTeachers } from "../src/modules/forms/forms-service.js";

const student = { id: "s-1", name: "طالب تجريبي", academicId: "2026001", civilId: "123", level: "الثاني", section: "201", track: "علمي" };

test.beforeEach(async () => { await clear("departmentForms"); await clear("schoolTeachers"); });

test("referral keeps a student snapshot and supports feedback workflow", async () => {
  const form = await createDepartmentForm("social_guidance", student, { reason: "حالة تحتاج متابعة", requestedAction: "دراسة الحالة" });
  assert.equal(form.student.name, student.name);
  assert.equal(form.destination, "قسم الإرشاد الاجتماعي");
  assert.equal(form.status, "pending");
  await updateDepartmentForm(form.id, { status: "completed", feedback: "تم اتخاذ الإجراء" });
  const [saved] = await listDepartmentForms();
  assert.equal(saved.status, "completed");
  assert.equal(saved.feedback, "تم اتخاذ الإجراء");
});

test("section change requires a guardian and a reason", async () => {
  await assert.rejects(() => createDepartmentForm("section_change", student, { requestKind: "section", reason: "سبب" }), /ولي الأمر/);
  const form = await createDepartmentForm("section_change", student, { requestKind: "section", guardianName: "ولي الأمر", reason: "سبب" });
  assert.equal(form.fields.requestKind, "section");
});

test("teacher register stores searchable identifying fields", async () => {
  await saveTeacher({ name: " أحمد محمد ", employeeNo: "T-01", department: "الرياضيات", photoDataUrl: "data:image/jpeg;base64,AA" });
  const [teacher] = await listTeachers();
  assert.equal(teacher.name, "أحمد محمد");
  assert.equal(teacher.employeeNo, "T-01");
});

test("teacher batch import uses the personal number as a stable id", async () => {
  const count = await importTeachers([{ name: "معلم أول", personalNo: "001234567", department: "الرياضيات" }, { name: "معلم ثان", personalNo: "009876543", department: "العلوم" }]);
  assert.equal(count, 2);
  const teachers = await listTeachers();
  assert.equal(teachers.length, 2);
  assert.ok(teachers.some((teacher) => teacher.id === "teacher-001234567"));
});
