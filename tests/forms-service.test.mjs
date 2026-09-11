import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/fake-cloud-backend.mjs";
import { clear } from "../src/services/cloud-runtime.js";
import { createDepartmentForm, listDepartmentForms, updateDepartmentForm, saveTeacher, listTeachers, listTeachersDirectory, getTeacherPhoto, importTeachers, listLegacyTeacherPhotoIds, removeLegacyTeacherPhotos, listFormsForStudent } from "../src/modules/forms/forms-service.js";

const student = { id: "s-1", name: "طالب تجريبي", academicId: "2026001", civilId: "123", level: "الثاني", section: "201", track: "علمي" };
globalThis.__MASAR_TEST_AUTH__ = {
  getCurrentProfile: () => ({ id: "user-1", full_name: "مرشد تجريبي", email: "guide@example.com" }),
};

test.beforeEach(async () => { await clear("departmentForms"); await clear("schoolTeachers"); });

test("referral keeps a student snapshot and supports feedback workflow", async () => {
  const form = await createDepartmentForm("social_guidance", student, { reason: "حالة تحتاج متابعة", requestedAction: "دراسة الحالة" });
  assert.equal(form.student.name, student.name);
  assert.equal(form.destination, "قسم الإرشاد الاجتماعي");
  assert.equal(form.status, "pending");
  assert.equal(form.createdById, "user-1");
  assert.equal(form.createdByName, "مرشد تجريبي");
  assert.ok(form.createdAt);
  await updateDepartmentForm(form.id, { status: "completed", feedback: "تم اتخاذ الإجراء" });
  const [saved] = await listDepartmentForms();
  assert.equal(saved.status, "completed");
  assert.equal(saved.feedback, "تم اتخاذ الإجراء");
  assert.equal(saved.createdByName, "مرشد تجريبي");
  assert.equal(saved.updatedByName, "مرشد تجريبي");
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

test("editing a teacher updates the same record without creating a duplicate", async () => {
  const original = await saveTeacher({ name: "معلم تجريبي", personalNo: "123456789", department: "الرياضيات", photoDataUrl: "data:image/jpeg;base64,AA" });
  await saveTeacher({ ...original, name: "معلم محدّث", department: "العلوم" });
  const teachers = await listTeachers();
  assert.equal(teachers.length, 1);
  assert.equal(teachers[0].id, original.id);
  assert.equal(teachers[0].name, "معلم محدّث");
  assert.equal(teachers[0].department, "العلوم");
  assert.equal(teachers[0].photoDataUrl, "data:image/jpeg;base64,AA");
});

test("teacher batch import uses the personal number as a stable id", async () => {
  const count = await importTeachers([{ name: "معلم أول", personalNo: "001234567", department: "الرياضيات" }, { name: "معلم ثان", personalNo: "009876543", department: "العلوم" }]);
  assert.equal(count, 2);
  const teachers = await listTeachers();
  assert.equal(teachers.length, 2);
  assert.ok(teachers.some((teacher) => teacher.id === "teacher-001234567"));
});

test("editing teacher metadata without photo field preserves the legacy photo", async () => {
  const teacher = await saveTeacher({ name: "معلم", personalNo: "987", photoDataUrl: "data:image/png;base64,AQID" });
  const updated = await saveTeacher({ id: teacher.id, name: "معلم محدث" });
  assert.equal(updated.photoDataUrl, teacher.photoDataUrl);
  assert.equal(updated.personalNo, "987");
});

test("teacher directory paginates metadata and fetches a photo only on demand", async () => {
  await importTeachers(Array.from({ length: 30 }, (_, index) => ({ name: `معلم ${String(index).padStart(2, "0")}`, personalNo: String(1000 + index), photoDataUrl: index === 0 ? "data:image/jpeg;base64,AA" : "" })));
  const firstPage = await listTeachersDirectory({ offset: 0, limit: 25 });
  assert.equal(firstPage.total, 30);
  assert.equal(firstPage.rows.length, 25);
  assert.equal("photoDataUrl" in firstPage.rows[0], false);
  assert.equal(await getTeacherPhoto("teacher-1000"), "data:image/jpeg;base64,AA");
});

test("legacy photo deletion requires admin and preserves all teacher metadata", async () => {
  await importTeachers(Array.from({ length: 52 }, (_, index) => ({ name: `معلم ${index}`, personalNo: String(2000 + index), department: "العلوم", photoDataUrl: index % 2 ? "" : "data:image/png;base64,AQID" })));
  const before = await listTeachers();
  const ids = await listLegacyTeacherPhotoIds();
  assert.equal(ids.length, 26);
  await assert.rejects(() => removeLegacyTeacherPhotos(ids), /للإدمن فقط/);
  assert.deepEqual(await listTeachers(), before);
  const originalProfile = globalThis.__MASAR_TEST_AUTH__.getCurrentProfile;
  globalThis.__MASAR_TEST_AUTH__.getCurrentProfile = () => ({ id: "admin-test", role: "admin" });
  try {
    assert.equal(await removeLegacyTeacherPhotos([...ids, ids[0], "missing"]), 26);
    assert.deepEqual(await listLegacyTeacherPhotoIds(), []);
    assert.deepEqual(await listTeachers(), before.map((teacher) => {
      if (!teacher.photoDataUrl) return teacher;
      const { photoDataUrl, ...metadata } = teacher;
      return metadata;
    }));
    assert.equal(await removeLegacyTeacherPhotos(ids), 0);
  } finally {
    globalThis.__MASAR_TEST_AUTH__.getCurrentProfile = originalProfile;
  }
});

test("listFormsForStudent returns only that student's forms", async () => {
  const other = { ...student, id: "s-2", academicId: "2026002" };
  await createDepartmentForm("social_guidance", student, { reason: "حالة أولى" });
  await createDepartmentForm("registration", student, { reason: "طلب ثانٍ" });
  await createDepartmentForm("social_guidance", other, { reason: "طالب آخر" });

  const rows = await listFormsForStudent(student.id);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((f) => f.studentId === student.id));
});
