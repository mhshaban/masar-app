import { ensurePdfJs } from "./vendor-loader.js?v=2026-09-07-academic-fix-1";

export function groupPdfItems(items, page = 1) {
  const rows = [];
  const positioned = items.filter(item => item.str?.trim()).map(item => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width || 0 })).sort((a, b) => b.y - a.y);
  for (const item of positioned) {
    let row = rows.find(entry => Math.abs(entry.y - item.y) < 3);
    if (!row) { row = { page, y: item.y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  for (const row of rows) row.items.sort((a, b) => b.x - a.x);
  return rows;
}

export async function readPositionedPdfRows(file) {
  const library = await ensurePdfJs();
  const task = library.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const rows = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      rows.push(...groupPdfItems((await page.getTextContent()).items, number));
      page.cleanup();
    }
    return rows;
  } finally { await task.destroy(); }
}
