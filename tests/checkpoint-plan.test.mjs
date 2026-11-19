import test from "node:test";
import assert from "node:assert/strict";
import { classifyRecord, sessionsFor, withSessionLog } from "../src/modules/grades/checkpoint-plan.js";
import { listZeroEntries, resolveZero } from "../src/modules/grades/checkpoint-service.js";

const sub = (name, score, max = 25) => ({ name, code: "", score, maxScore: max, pct: Math.round(score / max * 10000) / 100, status: null });

test("classification bands and groups, open zeros ignored", () => {
  assert.equal(classifyRecord({ subjects: [sub("أ", 24), sub("ب", 23), sub("ج", 25)] }).category, "top");
  const low = classifyRecord({ subjects: [sub("أ", 5), sub("ب", 6), sub("ج", 7), sub("د", 24)] });
  assert.deepEqual([low.category, low.group], ["low", "A"]);
  const mid = classifyRecord({ subjects: [sub("أ", 10), sub("ب", 22), sub("ج", 22)] });
  assert.deepEqual([mid.category, mid.group], ["mid", "oneWeak"]);
  assert.equal(classifyRecord({ subjects: [sub("أ", 24), sub("ب", 0)] }).category, "top");
  assert.equal(classifyRecord({ subjects: [sub("أ", 24), { ...sub("ب", 0), zeroConfirmed: true }] }).category, "low");
  assert.equal(classifyRecord({ subjects: [sub("أ", 0)] }).category, "none");
  const gone = classifyRecord({ subjects: [{ ...sub("أ", 0), zeroConfirmed: true }, { ...sub("ب", 0), zeroConfirmed: true }] });
  assert.deepEqual([gone.category, gone.group], ["low", "absentAll"]);
  assert.ok(sessionsFor(gone).some((s) => s.id === "low-parents"));
});

test("sessions follow group and level", () => {
  assert.deepEqual(sessionsFor({ category: "low", group: "A" }).map((s) => s.id), ["low-group", "low-parents", "low-tutoring"]);
  assert.deepEqual(sessionsFor({ category: "low", group: "B" }).map((s) => s.id), ["low-group", "low-tutoring"]);
  assert.equal(sessionsFor({ category: "mid", group: "oneWeak" }).length, 1);
  assert.equal(sessionsFor({ category: "top", group: "" }).length, 1);
});

test("session log add and clear", () => {
  let r = withSessionLog({ id: "x" }, "low-group", { date: "2026-11-30", parentAttended: false });
  assert.equal(r.plan.sessions["low-group"].date, "2026-11-30");
  r = withSessionLog(r, "low-group", null);
  assert.equal(r.plan.sessions["low-group"], undefined);
});

test("zero review: correct, confirm, absent", () => {
  const rec = { id: "r", term: "T", checkpoint: 1, studentId: "1", subjects: [sub("الرسم الفني", 0, 10), sub("الرياضيات", 20)] };
  assert.equal(listZeroEntries([rec], { term: "T" }).length, 1);
  const fixed = resolveZero(rec, "الرسم الفني", { type: "score", score: "8" });
  assert.equal(fixed.subjects[0].pct, 80);
  assert.equal(fixed.averagePct, 80);
  const conf = resolveZero(rec, "الرسم الفني", { type: "confirm" });
  assert.equal(listZeroEntries([conf], { term: "T" }).length, 0);
  assert.equal(resolveZero(rec, "الرسم الفني", { type: "absent" }).subjects[0].status, "absent");
  assert.throws(() => resolveZero(rec, "الرسم الفني", { type: "score", score: "11" }));
});
