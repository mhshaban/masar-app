import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { bulkPut, clear } from "../src/services/cloud-runtime.js";
import { getStudent, updateStudentPhoto, removeStudentPhoto } from "../src/modules/students/students-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
  // Seeding students directly (count > 0) short-circuits ensureStudentsSeeded's
  // fetch("data/students.local.json"), which doesn't exist in Node.
  await bulkPut("students", [{ id: "s1", name: "طالب" }]);
});

test("updateStudentPhoto attaches a data URL to the student record without touching other fields", async () => {
  const updated = await updateStudentPhoto("s1", "data:image/jpeg;base64,abc123");
  assert.equal(updated.photo, "data:image/jpeg;base64,abc123");
  assert.equal(updated.name, "طالب");

  const fetched = await getStudent("s1");
  assert.equal(fetched.photo, "data:image/jpeg;base64,abc123");
});

test("removeStudentPhoto clears the photo field", async () => {
  await updateStudentPhoto("s1", "data:image/jpeg;base64,abc123");
  await removeStudentPhoto("s1");
  const fetched = await getStudent("s1");
  assert.equal(fetched.photo, null);
});

test("updateStudentPhoto on a missing student id is a no-op that returns null", async () => {
  assert.equal(await updateStudentPhoto("does-not-exist", "data:x"), null);
});
