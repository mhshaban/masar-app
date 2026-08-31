import "./helpers/fake-cloud-backend.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowToStudent, commitStudentsImport } from "../src/services/students-import-service.js";
import { list as listAll, count } from "../src/services/cloud-runtime.js";
import { ensureStudentsSeeded } from "../src/services/students-source.js";
import { updateStudent } from "../src/modules/students/students-service.js";

// The exact row (by column index) from the school's real كشف الطلاب sheet
// for student 20254220 — pinned here byte-for-byte against the sheet's own
// header order, and its expected output pinned against the shape the old
// data/students.local.json seed actually produced for the same student
// (confirmed identical before this importer replaced that seed path).
const REAL_ROW = [
  1, 1, 1, "100803962", "20254220", "سجاد جاسم علي السني", "SAJJAD JASIM ALI ALSENI",
  "sajjad_j_alseni3962@moe.bh", "الأول", "٢تلم١", "تأسيسي", "الصناعي",
  38894400, 33350568, null, null, null,
  "الفترتان (الذهاب والعودة)", 806,
  "الفترة المسائية", "الفترة الصباحية", "الفترة الصباحية", "الفترة الصباحية", "الفترة الصباحية",
  "710036019@moe.bh", "خالد بدري حامد المشعور", 38886280, "khaled.b.almashoor@moe.bh", "الإلكترونيات ",
  "", "", null, null, null, 15, "002-2",
];

test("rowToStudent maps a real كشف الطلاب row to exactly the shape the app expects", () => {
  const student = rowToStudent(REAL_ROW, 0);
  assert.deepEqual(student, {
    id: "20254220",
    civilId: "100803962",
    academicId: "20254220",
    name: "سجاد جاسم علي السني",
    nameEn: "SAJJAD JASIM ALI ALSENI",
    email: "sajjad_j_alseni3962@moe.bh",
    level: "الأول",
    section: "٢تلم١",
    department: "تأسيسي",
    track: "الصناعي",
    phones: ["38894400", "33350568"],
    transport: "الفترتان (الذهاب والعودة)",
    complexNumber: "806",
    weekSchedule: {
      sunday: "الفترة المسائية",
      monday: "الفترة الصباحية",
      tuesday: "الفترة الصباحية",
      wednesday: "الفترة الصباحية",
      thursday: "الفترة الصباحية",
    },
    counselor: {
      name: "خالد بدري حامد المشعور",
      phone: "38886280",
      email: "khaled.b.almashoor@moe.bh",
      department: "الإلكترونيات",
    },
    socialGuidance: null,
    supportNeeded: null,
    nonArabNationality: null,
    specializationPreference: null,
    minSpecializationThreshold: null,
    seatNumber: "15",
    committee: "002-2",
  });
});

test("rowToStudent falls back to civilId, then a positional id, when academicId is missing", () => {
  const noAcademic = [...REAL_ROW];
  noAcademic[4] = null;
  assert.equal(rowToStudent(noAcademic, 0).id, "100803962");

  const neither = [...noAcademic];
  neither[3] = null;
  assert.equal(rowToStudent(neither, 4).id, "student-5");
});

test("commitStudentsImport replaces the whole roster (كشف الطلاب reissues in full each time)", async () => {
  await commitStudentsImport([
    { id: "20254220", academicId: "20254220", name: "طالب أول" },
    { id: "20254221", academicId: "20254221", name: "طالب ثاني" },
  ]);
  assert.equal(await count("students"), 2);

  await commitStudentsImport([
    { id: "20254222", academicId: "20254222", name: "طالب ثالث" },
  ]);
  const rows = await listAll("students");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "طالب ثالث");
});

test("a new roster import preserves counselor notes for the same student", async () => {
  await commitStudentsImport([{ id: "20254220", academicId: "20254220", name: "طالب أول", notes: "متابعة أسبوعية" }]);
  await commitStudentsImport([{ id: "20254220", academicId: "20254220", name: "الاسم المحدّث" }]);
  const [student] = await listAll("students");
  assert.equal(student.name, "الاسم المحدّث");
  assert.equal(student.notes, "متابعة أسبوعية");
});

test("editing basic student data keeps the stable record id and stores notes", async () => {
  await commitStudentsImport([{ id: "20254220", academicId: "20254220", name: "طالب أول", level: "الأول" }]);
  const updated = await updateStudent("20254220", { name: "طالب محدّث", level: "الثاني", notes: "يحتاج متابعة" });
  assert.equal(updated.id, "20254220");
  assert.equal(updated.academicId, "20254220");
  assert.equal(updated.name, "طالب محدّث");
  assert.equal(updated.level, "الثاني");
  assert.equal(updated.notes, "يحتاج متابعة");
  assert.equal(await count("students"), 1);
});

test("commitStudentsImport handles an empty roster without throwing", async () => {
  await commitStudentsImport([{ id: "x", academicId: "x", name: "طالب" }]);
  await commitStudentsImport([]);
  assert.equal(await count("students"), 0);
});

test("a fresh import is picked up immediately, not stuck on a stale cached 'unavailable' result", async () => {
  await commitStudentsImport([]);
  // Establishes and caches the {available:false} result — this is exactly
  // what mountStudentsView's first render does when the roster is empty.
  const before = await ensureStudentsSeeded();
  assert.equal(before.available, false);

  await commitStudentsImport([{ id: "20254220", academicId: "20254220", name: "سجاد جاسم علي السني" }]);

  const after = await ensureStudentsSeeded();
  assert.equal(after.available, true, "roster status must reflect the import, not the cached pre-import state");
  assert.equal(after.count, 1);
});
