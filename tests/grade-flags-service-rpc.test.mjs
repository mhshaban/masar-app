import { test } from "node:test";
import assert from "node:assert/strict";

// نفس أسلوب cloud-runtime-listwhere.test.mjs — يتعمّد تشغيل كود fetch
// الحقيقي (بدون fake-cloud-backend.mjs) للتأكد إن computeStudentGradeSummaries
// فعليًا يستدعي دالة Postgres الجاهزة (masar_grade_summaries) بمسار
// الإنتاج، بدل ما يجيب جدول الدرجات كامل للمتصفح، وإنه يرجع تلقائيًا
// للحساب المحلي القديم لو الدالة غير مطبَّقة بعد (رمز 404 مثلًا) بدل ما
// تنكسر الشاشة.
globalThis.sessionStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
  setItem(k, v) { this._store.set(k, String(v)); },
  removeItem(k) { this._store.delete(k); },
};

let calls = [];
let rpcShouldFail = false;

globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  if (url.includes("/rest/v1/rpc/masar_grade_summaries")) {
    if (rpcShouldFail) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => "function not found" };
    }
    return {
      ok: true,
      json: async () => [
        { student_id: "20254220", avg_pct: "35", failing_subject_codes: ["ريض801"], absent_count: 0, barred_count: 1, reasons: ["المعدل العام 35% أقل من 50%", "محروم في 1 مادة"] },
      ],
      text: async () => "",
    };
  }
  // مسار الاحتياط (list("grades") بعد فشل الـRPC) — يحاكي صفحة واحدة بلا استمرار.
  if (url.includes("/rest/v1/grades")) {
    return {
      ok: true,
      json: async () => [{ id: "g1", data: { id: "g1", studentId: "999", subjectCode: "ريض801", score: 20 } }],
      text: async () => "",
    };
  }
  return { ok: true, json: async () => [], text: async () => "" };
};

const { computeStudentGradeSummaries } = await import("../src/modules/grades/grade-flags-service.js");

test("computeStudentGradeSummaries calls the masar_grade_summaries RPC and maps snake_case fields to the app's existing camelCase shape", async () => {
  calls = [];
  rpcShouldFail = false;
  const summaries = await computeStudentGradeSummaries();

  const rpcCall = calls.find((c) => c.url.includes("masar_grade_summaries"));
  assert.ok(rpcCall, "expected a call to the masar_grade_summaries RPC endpoint");
  assert.equal(rpcCall.options.method, "POST");
  assert.deepEqual(JSON.parse(rpcCall.options.body), { p_fail_threshold_pct: 50 });

  assert.deepEqual(summaries, [{
    studentId: "20254220",
    avgPct: 35,
    failingSubjectCodes: ["ريض801"],
    absentCount: 0,
    barredCount: 1,
    reasons: ["المعدل العام 35% أقل من 50%", "محروم في 1 مادة"],
  }]);
});

test("computeStudentGradeSummaries falls back to the local full-scan computation when the RPC is not available yet (e.g. migration not applied)", async () => {
  calls = [];
  rpcShouldFail = true;
  const summaries = await computeStudentGradeSummaries();

  assert.ok(calls.some((c) => c.url.includes("masar_grade_summaries")), "must still attempt the RPC first");
  assert.ok(calls.some((c) => c.url.includes("/rest/v1/grades")), "must fall back to fetching the grades collection");
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].studentId, "999");
});
