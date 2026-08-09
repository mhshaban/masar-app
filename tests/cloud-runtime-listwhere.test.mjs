import { test } from "node:test";
import assert from "node:assert/strict";

// نفس أسلوب cloud-runtime-pagination.test.mjs — يتعمّد تشغيل كود fetch
// الحقيقي (بدون fake-cloud-backend.mjs) للتأكد من إن listWhere() فعليًا
// يرسل فلتر Supabase من طرف الخادم (data->>field=eq.value) بدل ما يجيب كل
// المجموعة ويفلترها بالمتصفح — هذا بالضبط اللي كان يخلي عرض المسار
// الأكاديمي لطالب واحد ياخذ أكثر من 3 دقايق (list("grades") كان يسحب كل
// درجات المدرسة كاملة أول ما صار عندها آلاف الصفوف الحقيقية).
globalThis.sessionStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
  setItem(k, v) { this._store.set(k, String(v)); },
  removeItem(k) { this._store.delete(k); },
};

const SERVER_ROWS = [
  { id: "g1", data: { id: "g1", studentId: "20254220", score: 90 } },
  { id: "g2", data: { id: "g2", studentId: "99999999", score: 10 } },
  { id: "g3", data: { id: "g3", studentId: "20254220", score: 85 } },
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
  const rows = await listWhere("grades", "studentId", "20254220");
  assert.ok(lastUrl.includes("data->>studentId=eq.20254220"), `expected a server-side filter in the URL, got: ${lastUrl}`);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.studentId === "20254220"), "must not leak another student's rows");
});
