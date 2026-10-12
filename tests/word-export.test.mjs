import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWordDocumentHtml, styleWordBody } from "../src/services/word-export.js";

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

test("styleWordBody() styles column headers, row labels and zebra rows inline in the Masar template", () => {
  const html = styleWordBody(`<h2>القسم</h2>
    <table><tr><th>التاريخ</th><th>الملاحظة</th></tr><tr><td>1</td><td>أ</td></tr><tr><td>2</td><td>ب</td></tr><tr><td>3</td><td>ج</td></tr></table>
    <table><tr><th>الاسم</th><td class="blank-value">س</td></tr></table>
    <div class="document-approval"><strong>الاعتماد</strong></div>`);
  assert.match(html, /<h2><span style="color:#C8923A;font-size:8pt">&#9632;<\/span>&nbsp;القسم<\/h2>/);
  assert.match(html, /<th align="right" style="background:#1A2744;color:#FFFFFF;[^"]*">التاريخ<\/th>/);
  const [, row1, row2] = html.match(/<td align="right" style="([^"]*)">1<\/td>[\s\S]*?<td align="right" style="([^"]*)">2<\/td>/);
  assert.doesNotMatch(row1, /background/);
  assert.match(row2, /^background:#F8F9FC;/);
  assert.match(html, /<th align="right" style="background:#F1F4F9;color:#2C3E6B;[^"]*">الاسم<\/th><td align="right" style="[^"]*" class="blank-value">س<\/td>/);
  assert.match(html, /<table width="100%" cellspacing="0" cellpadding="0">/);
  assert.match(html, /<div class="document-approval"><strong><span style="color:#C8923A;font-size:8pt">&#9632;<\/span>&nbsp;الاعتماد<\/strong>/);
});
