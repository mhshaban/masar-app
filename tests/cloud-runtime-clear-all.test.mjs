import { test } from "node:test";
import assert from "node:assert/strict";

// نفس أسلوب cloud-runtime-remove-many.test.mjs — يشغّل كود fetch الحقيقي
// عمدًا. clearAll() بديل أبسط لـclear() لمجموعة صغيرة/متوسطة (الجدول
// الدراسي): طلب DELETE واحد بفلتر id=not.is.null (يطابق كل صف، يحقق
// شرط PostgREST بوجود فلتر) بدل جلب كل المعرّفات أولًا (list()) ثم حذفها
// دفعة بدفعة — أقل طلبات، وبلا حاجة لمقارنة معرّفات قديمة/جديدة إطلاقًا.
globalThis.sessionStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
  setItem(k, v) { this._store.set(k, String(v)); },
  removeItem(k) { this._store.delete(k); },
};

const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), method: options?.method });
  return { ok: true, status: 200, json: async () => [], text: async () => "" };
};

const { clearAll } = await import("../src/services/cloud-runtime.js");

test("clearAll() sends exactly one DELETE request with an id=not.is.null filter, regardless of collection size", async () => {
  requests.length = 0;
  await clearAll("classSchedules");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "DELETE");
  assert.match(requests[0].url, /classSchedules\?id=not\.is\.null/);
});
