import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
let created = 0;
URL.createObjectURL = () => `blob:photo-${++created}`;
URL.revokeObjectURL = () => {};

const { setAccessToken } = await import("../src/services/supabase-config.js");
const { cloudStudentPhotoUrl, studentPhotoCloudPath, resetCloudStudentPhotoCache } = await import("../src/modules/students/student-photo-cloud.js");

test("builds the storage path from the student id", () => {
  assert.equal(studentPhotoCloudPath("20254617"), "20254617/avatar.webp");
});

test("fetches the avatar with the user's session token and caches hits and misses", async () => {
  resetCloudStudentPhotoCache();
  setAccessToken("user-token", 3600);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization });
    if (url.includes("20254617")) return new Response(new Blob(["img"]), { status: 200 });
    return new Response("not found", { status: 400 });
  };
  assert.equal(await cloudStudentPhotoUrl("20254617"), "blob:photo-1");
  assert.equal(await cloudStudentPhotoUrl("20254617"), "blob:photo-1");
  assert.equal(await cloudStudentPhotoUrl("20269999"), null);
  assert.equal(await cloudStudentPhotoUrl("20269999"), null);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/storage\/v1\/object\/authenticated\/student-photos\/20254617\/avatar\.webp$/);
  assert.equal(calls[0].auth, "Bearer user-token");
});

test("does not call storage without a signed-in session", async () => {
  resetCloudStudentPhotoCache();
  store.clear();
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response("", { status: 200 }); };
  assert.equal(await cloudStudentPhotoUrl("20254617"), null);
  assert.equal(called, false);
});
