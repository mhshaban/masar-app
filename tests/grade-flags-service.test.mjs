import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear, bulkPut } from "../src/services/cloud-runtime.js";
import { computeStudentGradeSummaries } from "../src/modules/grades/grade-flags-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("computeStudentGradeSummaries flags a student below the failing threshold with a human-readable reason", async () => {
  await bulkPut("grades", [
    { id: "g1", studentId: "s1", subjectCode: "ريض801", score: 40, scoreStatus: null },
  ]);
  const summaries = await computeStudentGradeSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].studentId, "s1");
  assert.ok(summaries[0].reasons.some((r) => r.includes("40%")));
});

// طلاب يحتاجون متابعة بالرئيسية يستدعي مرشحي الحالات ومرشحي خطط الدعم معًا
// بـ Promise.all، وكل واحد منهم يستدعي computeStudentGradeSummaries()
// بشكل مستقل — بدون مشاركة، هذا يعني فحص كامل جدول الدرجات مرتين بالتوازي
// عند كل فتح للرئيسية (رُصد فعليًا: 22,982+ صفًا، بطء ملموس). هذا الاختبار
// يتأكد إن الاستدعاءات المتزامنة (نفس الدورة المتزامنة، تمامًا كما تحدث من
// Promise.all حقيقي) تتشارك جلبًا واحدًا فقط، لا اثنين.
test("computeStudentGradeSummaries shares one in-flight scan of the grades collection across concurrent callers instead of fetching twice", async () => {
  await bulkPut("grades", [{ id: "g1", studentId: "s1", subjectCode: "ريض801", score: 40 }]);

  const backend = globalThis.__MASAR_TEST_BACKEND__;
  let listCalls = 0;
  const originalList = backend.list;
  backend.list = async (collection) => {
    if (collection === "grades") listCalls += 1;
    return originalList(collection);
  };
  try {
    const [a, b] = await Promise.all([computeStudentGradeSummaries(), computeStudentGradeSummaries()]);
    assert.equal(listCalls, 1, "two concurrent callers must share a single grades fetch");
    assert.deepEqual(a, b);
  } finally {
    backend.list = originalList;
  }
});

test("computeStudentGradeSummaries fetches fresh data again on a later, non-concurrent call (no stale caching)", async () => {
  await bulkPut("grades", [{ id: "g1", studentId: "s1", subjectCode: "ريض801", score: 40 }]);
  const first = await computeStudentGradeSummaries();
  assert.equal(first.length, 1);

  // يحاكي دفعة استيراد جديدة صارت بين الاستدعاءين — لازم النتيجة الثانية
  // تعكسها فورًا، لا نسخة قديمة محفوظة بذاكرة مؤقتة.
  await bulkPut("grades", [{ id: "g2", studentId: "s2", subjectCode: "عرب801", score: 30 }]);
  const second = await computeStudentGradeSummaries();
  assert.equal(second.length, 2, "must not serve a stale cached result after new grades were imported");
});
