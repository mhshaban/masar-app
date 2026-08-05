import { test } from "node:test";
import assert from "node:assert/strict";
import { stripBidiMarks, normalizeArabicIndicDigits, normalizeKey } from "../src/services/text-normalize.js";

test("stripBidiMarks removes RLM/LRM/embedding marks but keeps the visible text", () => {
  assert.equal(stripBidiMarks("دين807‏"), "دين807");
  assert.equal(stripBidiMarks("‎دين807"), "دين807");
});

test("normalizeArabicIndicDigits converts Arabic-Indic digits to ASCII", () => {
  assert.equal(normalizeArabicIndicDigits("دين٨٠٧"), "دين807");
  assert.equal(normalizeArabicIndicDigits("٢٠٢٥"), "2025");
});

test("normalizeKey combines both normalizations and trims", () => {
  assert.equal(normalizeKey("  دين٨٠٧‏  "), "دين807");
});

test("normalizeKey handles null/undefined without throwing", () => {
  assert.equal(normalizeKey(null), "");
  assert.equal(normalizeKey(undefined), "");
});
