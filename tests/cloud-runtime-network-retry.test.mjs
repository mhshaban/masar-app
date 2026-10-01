import { test } from "node:test";
import assert from "node:assert/strict";

// نفس أسلوب cloud-runtime-remove-many.test.mjs — يشغّل كود fetch الحقيقي
// عمدًا. يثبّت إصلاح عطل حقيقي بالإنتاج (2026-10-01): المرشد أبلغ عن
// "تعذّر الاتصال" أثناء "تحديث شامل" رغم إن سجلات Supabase أظهرت نجاح كل
// الطلبات بلا استثناء (لا خطأ خادم واحد) — يعني fetch() نفسها فشلت لحظيًا
// مرة واحدة وسط مئات الطلبات المتتالية (عملية تستغرق دقائق)، فأسقطت
// العملية كاملة رغم نجاح كل شيء آخر. request() بـcloud-runtime.js تعيد
// المحاولة الآن تلقائيًا (3 مرات) لعطل اتصال لحظي من هذا النوع تحديدًا.
globalThis.sessionStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
  setItem(k, v) { this._store.set(k, String(v)); },
  removeItem(k) { this._store.delete(k); },
};

let callCount = 0;
let failuresBeforeSuccess = 0;
globalThis.fetch = async () => {
  callCount += 1;
  if (callCount <= failuresBeforeSuccess) throw new TypeError("Failed to fetch");
  return { ok: true, status: 200, json: async () => [], text: async () => "" };
};

const { list } = await import("../src/services/cloud-runtime.js");

test("a single transient fetch failure is retried automatically and the call still succeeds", async () => {
  callCount = 0;
  failuresBeforeSuccess = 1;
  const result = await list("students");
  assert.deepEqual(result, []);
  assert.equal(callCount, 2, "should have retried once after the first failure");
});

test("a genuine persistent connection failure still surfaces the Arabic connection-error message after retries are exhausted", async () => {
  callCount = 0;
  failuresBeforeSuccess = Infinity;
  // Distinct collection name from the first test so list()'s own read cache
  // doesn't short-circuit this call before fetch is ever invoked again.
  await assert.rejects(() => list("academicFlags"), (error) => {
    assert.match(error.message, /تعذّر الاتصال بالخادم/);
    return true;
  });
  assert.equal(callCount, 3, "should have attempted exactly 3 times before giving up");
});
