import { test } from "node:test";
import assert from "node:assert/strict";

// هذا الاختبار يتعمّد عدم استيراد tests/helpers/fake-cloud-backend.mjs —
// يبي يشغّل كود fetch الحقيقي بـ cloud-runtime.js (مموَّه) ليتأكد من تجاوز
// حد الصفوف الذي يرجعه PostgREST بصمت لكل طلب (رُصد فعليًا: سجل طلبة فيه
// أكثر من 1000 صف كان يظهر 1000 فقط بكل شاشة تعتمد على list()، رغم إن كل
// الصفوف محفوظة صح — العلة كانت بالقراءة فقط، لا الكتابة).
globalThis.sessionStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
  setItem(k, v) { this._store.set(k, String(v)); },
  removeItem(k) { this._store.delete(k); },
};

const TOTAL_ROWS = 2500; // > صفحتين كاملتين (1000+1000+500) لاختبار التوقف الصحيح
const ALL_ROWS = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
  id: `s${String(i).padStart(5, "0")}`,
  data: { id: `s${String(i).padStart(5, "0")}`, name: `طالب ${i}` },
}));

let requestCount = 0;
globalThis.fetch = async (url, options) => {
  requestCount += 1;
  const rangeHeader = options?.headers?.Range;
  assert.ok(rangeHeader, "list() must send a Range header to paginate");
  const [start, end] = rangeHeader.split("-").map(Number);
  const page = ALL_ROWS.slice(start, end + 1);
  return {
    ok: true,
    json: async () => page,
    text: async () => "",
  };
};

const { list } = await import("../src/services/cloud-runtime.js");

test("list() pages through all rows instead of stopping at PostgREST's default per-request row cap", async () => {
  requestCount = 0;
  const rows = await list("students");
  assert.equal(rows.length, TOTAL_ROWS, "must return every row, not just the first page");
  assert.equal(requestCount, 3, "2500 rows at 1000/page should take 3 requests (1000+1000+500)");
  assert.equal(rows[0].id, "s00000");
  assert.equal(rows[TOTAL_ROWS - 1].id, `s${String(TOTAL_ROWS - 1).padStart(5, "0")}`);
});
