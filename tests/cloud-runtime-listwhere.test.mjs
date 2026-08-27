import { test } from "node:test";
import assert from "node:assert/strict";

// نفس أسلوب cloud-runtime-pagination.test.mjs — يتعمّد تشغيل كود fetch
// الحقيقي (بدون fake-cloud-backend.mjs) للتأكد من إن listWhere() فعليًا
// يرسل فلتر Supabase من طرف الخادم (data->>field=eq.value) بدل ما يجيب كل
// المجموعة ويفلترها بالمتصفح — هذا بالضبط اللي كان يخلي عرض المسار
// الأكاديمي لطالب واحد ياخذ أكثر من 3 دقايق تاريخيًا (list("grades") كان
// يسحب كل درجات المدرسة كاملة أول ما صار عندها آلاف الصفوف الحقيقية،
// قبل أن ينتقل استيراد الدرجات لـCowork ويُحذف جدول grades من مسار كليًا
// — termAverages أدناه مثال حي بديل، نفس آلية الفلترة بالضبط).
globalThis.sessionStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
  setItem(k, v) { this._store.set(k, String(v)); },
  removeItem(k) { this._store.delete(k); },
};

const SERVER_ROWS = [
  { id: "t1", data: { id: "t1", studentId: "20254220", averagePct: 90 } },
  { id: "t2", data: { id: "t2", studentId: "99999999", averagePct: 10 } },
  { id: "t3", data: { id: "t3", studentId: "20254220", averagePct: 85 } },
];

let lastUrl = null;
globalThis.fetch = async (url) => {
  lastUrl = url;
  // يحاكي فلترة PostgREST الفعلية من طرف الخادم — لو الكود ما أرسل الفلتر
  // بالـ URL، هذا التمويه يرجّع كل الصفوف (بما فيها طالب ثاني) فيفشل الاختبار.
  const match = /data->>studentId=eq\.([^&]+)/.exec(url);
  const rows = match
    ? SERVER_ROWS.filter((r) => r.data.studentId === decodeURIComponent(match[1]))
    : SERVER_ROWS;
  return { ok: true, json: async () => rows, text: async () => "" };
};

const { listWhere } = await import("../src/services/cloud-runtime.js");

test("listWhere() filters server-side via the URL, not by fetching everything and filtering in JS", async () => {
  const rows = await listWhere("termAverages", "studentId", "20254220");
  assert.ok(lastUrl.includes("data->>studentId=eq.20254220"), `expected a server-side filter in the URL, got: ${lastUrl}`);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.studentId === "20254220"), "must not leak another student's rows");
});
