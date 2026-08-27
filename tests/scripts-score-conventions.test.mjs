import { test } from "node:test";
import assert from "node:assert/strict";
import { isEncodedAbsenceScore } from "../scripts/lib/score-conventions.mjs";

test("isEncodedAbsenceScore recognizes the literal 0.5 encoding, as number or string", () => {
  assert.equal(isEncodedAbsenceScore(0.5), true);
  assert.equal(isEncodedAbsenceScore("0.5"), true);
});

test("isEncodedAbsenceScore leaves real scores alone", () => {
  assert.equal(isEncodedAbsenceScore(0), false);
  assert.equal(isEncodedAbsenceScore(50), false);
  assert.equal(isEncodedAbsenceScore(100), false);
  assert.equal(isEncodedAbsenceScore(5), false);
});

test("isEncodedAbsenceScore is false for non-numeric input", () => {
  assert.equal(isEncodedAbsenceScore(null), false);
  assert.equal(isEncodedAbsenceScore(undefined), false);
  assert.equal(isEncodedAbsenceScore("غائب"), false);
});
