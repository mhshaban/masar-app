// نسخة Node من src/services/pdf-parser.js's extractPdfRows — تجميع النصوص
// بصفوف حسب إحداثي Y، ثم ترتيب كل صف يمين-لشمال حسب X — عبر pdfjs-dist بدل
// window.pdfjsLib المتصفح. standardFontDataUrl/cMapUrl ضروريان هنا (بخلاف
// المتصفح) وإلا النص العربي يطلع تالفًا بصمت.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFJS_DIST = path.join(__dirname, "..", "..", "node_modules", "pdfjs-dist");

export async function extractPdfRows(buf) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: path.join(PDFJS_DIST, "standard_fonts") + path.sep,
    cMapUrl: path.join(PDFJS_DIST, "cmaps") + path.sep,
    cMapPacked: true,
  }).promise;
  const allRows = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items
      .map((it) => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }))
      .filter((it) => it.text);
    items.sort((a, b) => b.y - a.y);
    const rows = [];
    for (const item of items) {
      const row = rows.find((r) => Math.abs(r.y - item.y) < 3);
      if (row) row.items.push(item);
      else rows.push({ y: item.y, items: [item] });
    }
    for (const row of rows) {
      row.items.sort((a, b) => b.x - a.x);
      allRows.push(row.items.map((i) => i.text));
    }
  }
  return allRows;
}
