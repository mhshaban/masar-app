import "./helpers/fake-cloud-backend.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { parseTeachersRows } from "../src/services/school-data-import-service.js";
import { parsePromotedRows } from "../src/modules/promoted/promoted-service.js";

test("updated teachers sheet maps stable IDs and contact fields", () => {
  const rows = [
    ["الرقم الشخصي", "الاسم باللغة العربية", "الاسم باللغة الإنجليزية", "القسم", "الوظيفة", "رقم الاتصال", "البريد الالكتروني", "teams"],
    ["001234567", " معلم محدث ", "UPDATED TEACHER", "الرياضيات", "معلم أول", 33330000, "teacher@moe.bh", "https://teams.example/teacher"],
  ];
  const [teacher] = parseTeachersRows(rows);
  assert.equal(teacher.id, "teacher-001234567");
  assert.equal(teacher.name, "معلم محدث");
  assert.equal(teacher.phone, "33330000");
  assert.equal(teacher.jobTitle, "معلم أول");
});

test("promoted rows match the incoming updated roster before production is changed", () => {
  const rows = [
    ["الرقم الاكاديمي", "اسم الطالب", "المقرر", "حالة الطالب"],
    ["20260001", "طالب محدث", "ريض", ""],
  ];
  const [row] = parsePromotedRows(rows, [{ id: "20260001", academicId: "20260001", name: "طالب محدث" }]);
  assert.equal(row.matchStatus, "matched");
  assert.equal(row.subjectCode, "ريض");
  assert.equal(row.cleared, false);
});
