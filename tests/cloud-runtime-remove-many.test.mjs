import { test } from "node:test";
import assert from "node:assert/strict";

// نفس أسلوب cloud-runtime-listwhere.test.mjs — يشغّل كود fetch الحقيقي
// (بدون fake-cloud-backend.mjs) عمدًا، للتأكد فعليًا من عدد طلبات HTTP
// المُرسَلة، لا فقط النتيجة النهائية. يثبّت إصلاح عطل حقيقي بالإنتاج
// (2026-09-24): تغيير صيغة id لـtermAverages/courseGrades جعل كل الصفوف
// القديمة "بلا مصدر" دفعة واحدة أثناء الاستيراد، وPromise.all لطلبات
// remove() فردية بهذا العدد (آلاف) أطلق آلاف اتصالات HTTP متزامنة من
// المتصفح دفعة وحدة فأغرق Supabase — يظهر كخطأ "تعذر الاتصال بالخادم"
// عشوائي بلا علاقة فعلية بشبكة المستخدم. removeMany يجب أن يحذف بدفعات
// (id=in.(...))، لا طلب واحد لكل معرّف.
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

const { removeMany, clear } = await import("../src/services/cloud-runtime.js");

test("removeMany() sends one batched DELETE per chunk, not one request per id", async () => {
  requests.length = 0;
  const ids = Array.from({ length: 1200 }, (_, i) => `id-${i}`);
  await removeMany("courseGrades", ids);
  // 1200 معرّفًا بحجم دفعة 500 = 3 طلبات فقط، لا 1200.
  assert.equal(requests.length, 3);
  for (const r of requests) {
    assert.equal(r.method, "DELETE");
    assert.match(r.url, /courseGrades\?id=in\.\(/);
  }
});

test("removeMany() URL-encodes each id (Arabic/spaces/dashes) inside the in.() list", async () => {
  requests.length = 0;
  const ids = [
    "20244146--الفصل الدراسي الأول - العام الدراسي 2025/2026--كيم803",
    "20244147--الفصل الدراسي الثاني - العام الدراسي 2025/2026--عرب804",
  ];
  await removeMany("courseGrades", ids);
  assert.equal(requests.length, 1);
  const url = requests[0].url;
  for (const id of ids) assert.ok(url.includes(encodeURIComponent(id)), `expected ${url} to include the encoded id ${id}`);
  // الفاصلة بين المعرّفين تبقى حرفية (فاصل قائمة in.())، لا مشفّرة.
  assert.ok(url.includes(`${encodeURIComponent(ids[0])},${encodeURIComponent(ids[1])}`));
});

test("removeMany() with an empty id list sends no requests", async () => {
  requests.length = 0;
  await removeMany("courseGrades", []);
  assert.equal(requests.length, 0);
});

test("clear() batches its deletes via removeMany instead of one request per row", async () => {
  requests.length = 0;
  const rows = Array.from({ length: 700 }, (_, i) => ({ id: `id-${i}`, data: { id: `id-${i}` } }));
  let listCalled = false;
  globalThis.fetch = async (url, options) => {
    if (!options?.method || options.method === "GET") {
      listCalled = true;
      return { ok: true, status: 200, json: async () => rows, text: async () => "" };
    }
    requests.push({ url: String(url), method: options.method });
    return { ok: true, status: 200, json: async () => [], text: async () => "" };
  };
  await clear("courseGrades");
  assert.ok(listCalled, "clear() must list existing ids first");
  assert.equal(requests.length, 2); // 700 صفًا بحجم دفعة 500 = دفعتان
});
