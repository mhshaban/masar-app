import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWordDocumentHtml } from "../src/services/word-export.js";

// Plain CSS3 `@page { size: A4 landscape }` alone is silently ignored by real
// Microsoft Word's HTML import filter — it only honors its own
// `mso-page-orientation` descriptor on a named `@page Section1` rule, applied
// to the content via `div.Section1 { page: Section1; }` (see word-export.js).
// Both rules are emitted together: the plain one for browsers/print-preview,
// the mso one for Word itself.
test("buildWordDocumentHtml defaults to A4 portrait when no orientation is given", () => {
  const html = buildWordDocumentHtml("عنوان", "<p>محتوى</p>");
  assert.match(html, /@page \{ size: A4 portrait;/);
  assert.match(html, /@page Section1 \{ size: 595\.3pt 841\.9pt; mso-page-orientation: portrait;/);
  assert.match(html, /<div class="Section1">/);
});

test("buildWordDocumentHtml switches the page to A4 landscape when asked, with pre-swapped physical dimensions for Word's mso-page-orientation", () => {
  const html = buildWordDocumentHtml("عنوان", "<p>محتوى</p>", { orientation: "landscape" });
  assert.match(html, /@page \{ size: A4 landscape;/);
  assert.match(html, /@page Section1 \{ size: 841\.9pt 595\.3pt; mso-page-orientation: landscape;/);
});
