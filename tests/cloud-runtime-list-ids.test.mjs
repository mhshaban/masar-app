import { test } from "node:test";
import assert from "node:assert/strict";

// نفس أسلوب cloud-runtime-listwhere.test.mjs — يشغّل fetch حقيقيًا عمدًا.
// يثبّت تحسين أداء حقيقي (2026-09-24): commitAcademicAverages/
// commitClassSchedules كانا يستخدمان list() (يسحب data الكامل لكل صف)
// فقط ليقارنا المعرّفات — وحده هذا كان يأخذ 40+ ثانية من صفحات قراءة
// متتالية لجدول courseGrades (20 ألف+ صف)، يمدّد "تحديث شامل" لدقائق.
// listIds() يطلب select=id فقط، بلا عمود data إطلاقًا.
globalThis.sessionStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
  setItem(k, v) { this._store.set(k, String(v)); },
  removeItem(k) { this._store.delete(k); },
};

const urls = [];
globalThis.fetch = async (url, options) => {
  urls.push(String(url));
  const range = options?.headers?.Range || "0-999";
  const [start, end] = range.split("-").map(Number);
  const allIds = Array.from({ length: 1500 }, (_, i) => `id-${i}`);
  const page = allIds.slice(start, end + 1).map((id) => ({ id }));
  return { ok: true, status: 200, json: async () => page, text: async () => "" };
};

const { listIds } = await import("../src/services/cloud-runtime.js");

test("listIds() requests only the id column, never data", async () => {
  urls.length = 0;
  await listIds("courseGrades");
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.match(url, /select=id(&|$)/, `expected select=id only, got: ${url}`);
    assert.ok(!url.includes("data"), `must not request the data column: ${url}`);
  }
});

test("listIds() paginates across the full collection and returns plain id strings", async () => {
  urls.length = 0;
  const ids = await listIds("courseGrades");
  assert.equal(ids.length, 1500);
  assert.equal(ids[0], "id-0");
  assert.equal(ids[1499], "id-1499");
  assert.equal(urls.length, 2); // 1500 IDs across PAGE_SIZE=1000 pages = 2 requests
  assert.equal(typeof ids[0], "string");
});
