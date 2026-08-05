export async function extractPdfRows(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const allRows = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
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
