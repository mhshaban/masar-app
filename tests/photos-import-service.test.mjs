import "./helpers/fake-cloud-backend.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  academicIdFromFilename,
  matchPhotoFiles,
  commitPhotoMatches,
} from "../src/services/photos-import-service.js";
import { bulkPut, get } from "../src/services/cloud-runtime.js";

test("academicIdFromFilename extracts the academic ID when the file is named for it exactly", () => {
  assert.equal(academicIdFromFilename("20254220.jpg"), "20254220");
  assert.equal(academicIdFromFilename("20254220.PNG"), "20254220");
});

test("academicIdFromFilename picks the longest digit run over a shorter incidental prefix (e.g. a camera index)", () => {
  assert.equal(academicIdFromFilename("IMG_2_20254220.jpg"), "20254220");
  assert.equal(academicIdFromFilename("20254220 - سجاد جاسم علي السني.jpeg"), "20254220");
});

test("academicIdFromFilename normalizes Arabic-Indic digits the same as ASCII", () => {
  assert.equal(academicIdFromFilename("٢٠٢٥٤٢٢٠.jpg"), "20254220");
});

test("academicIdFromFilename returns null for a filename with no usable digit run", () => {
  assert.equal(academicIdFromFilename("photo.jpg"), null);
  assert.equal(academicIdFromFilename("img12.jpg"), null); // شارت بس رقمين — أقل من الحد الأدنى ٤ خانات
});

test("matchPhotoFiles matches files to students by academicId, and separates unmatched and duplicate files", async () => {
  await bulkPut("students", [
    { id: "20254220", academicId: "20254220", name: "سجاد" },
    { id: "20214438", academicId: "20214438", name: "طالب آخر" },
  ]);

  const files = [
    { name: "20254220.jpg" },
    { name: "20214438.png" },
    { name: "20214438 - نسخة.png" }, // نفس الطالب، ملف مكرر
    { name: "99999999.jpg" }, // رقم غير موجود بالسجل
  ];

  const { matched, unmatched, duplicates } = await matchPhotoFiles(files);

  assert.equal(matched.length, 2);
  assert.deepEqual(matched.map((m) => m.student.id).sort(), ["20214438", "20254220"]);

  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].academicId, "99999999");

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].student.id, "20214438");
  assert.equal(duplicates[0].files.length, 2);
});

test("commitPhotoMatches writes the photo onto each matched student without touching its other fields", async () => {
  await bulkPut("students", [{ id: "s1", academicId: "111", name: "طالب", level: "الأول" }]);
  const student = await get("students", "s1");

  const written = await commitPhotoMatches([{ student, dataUrl: "data:image/jpeg;base64,AAA" }]);
  assert.equal(written, 1);

  const after = await get("students", "s1");
  assert.equal(after.photo, "data:image/jpeg;base64,AAA");
  assert.equal(after.name, "طالب");
  assert.equal(after.level, "الأول");
});
