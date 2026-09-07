import { test } from "node:test";
import assert from "node:assert/strict";
import { teacherPhotoMatchScore, legacyPhotoFile, copyLegacyTeacherPhotos } from "../src/modules/forms/teacher-photo-local.js";

test("teacher photos match exact personal or employee number, never partial ids", () => {
  const teacher = { personalNo: "123456789", employeeNo: "T12" };
  assert.equal(teacherPhotoMatchScore("١٢٣٤٥٦٧٨٩.jpg", teacher), 120);
  assert.equal(teacherPhotoMatchScore("T12.png", teacher), 110);
  assert.equal(teacherPhotoMatchScore("0123456789.jpg", teacher), 0);
});

test("legacy photo export preserves original bytes and rejects unsafe filenames", async () => {
  const file = legacyPhotoFile({ personalNo: "123" }, "data:image/png;base64,AQID");
  assert.equal(file.name, "123.png");
  assert.deepEqual([...new Uint8Array(await file.blob.arrayBuffer())], [1,2,3]);
  assert.throws(() => legacyPhotoFile({ personalNo: "../123" }, "data:image/png;base64,AQID"));
});

test("photo copy skips existing files and verifies each newly written file", async () => {
  const contents = new Map([["123.png", new Blob(["keep"])]]);
  const folder = { async getFileHandle(name, options) {
    if (!contents.has(name) && !options?.create) throw Object.assign(new Error(), { name: "NotFoundError" });
    return { async createWritable() { return { async write(blob) { contents.set(name, blob); }, async close() {}, async abort() {} }; }, async getFile() { return contents.get(name); } };
  }};
  const result = await copyLegacyTeacherPhotos(folder,
    async () => ({ rows: [{id:"1",personalNo:"123",hasPhoto:true},{id:"2",personalNo:"456",hasPhoto:true}], total:2 }),
    async () => "data:image/png;base64,AQID");
  assert.deepEqual(result, {copied:1, skipped:1, failed:0});
  assert.equal(await contents.get("123.png").text(), "keep");
  assert.equal(contents.get("456.png").size, 3);
});
