import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWordDocumentHtml } from "../src/services/word-export.js";

test("buildWordDocumentHtml defaults to A4 portrait when no orientation is given", () => {
  const html = buildWordDocumentHtml("عنوان", "<p>محتوى</p>");
  assert.match(html, /@page \{ size: A4 portrait;/);
});

test("buildWordDocumentHtml switches the page to A4 landscape when asked", () => {
  const html = buildWordDocumentHtml("عنوان", "<p>محتوى</p>", { orientation: "landscape" });
  assert.match(html, /@page \{ size: A4 landscape;/);
});
