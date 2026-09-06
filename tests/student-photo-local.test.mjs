import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStudentPhotoKey, studentPhotoMatchScore } from "../src/modules/students/student-photo-local.js";

test("normalizes a student photo filename and Arabic digits", () => {
  assert.equal(normalizeStudentPhotoKey("٢٠٢٦٠٠٠١.jpg"), "20260001");
  assert.equal(normalizeStudentPhotoKey("20260001.PNG"), "20260001");
});

test("matches a student photo by academic id before civil id", () => {
  const student = { id: "20260001", academicId: "20260001", civilId: "123456789" };
  assert.equal(studentPhotoMatchScore("20260001.jpg", student), 120);
  assert.equal(studentPhotoMatchScore("123456789-photo.jpg", student), 80);
  assert.equal(studentPhotoMatchScore("20260002.jpg", student), 0);
});
