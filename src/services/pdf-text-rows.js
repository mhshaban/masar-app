// استخراج نص PDF كصفوف (كل صف = عناصر نص بنفس ارتفاع y تقريبًا، من اليمين
// لليسار) عبر pdf.js — منطق مشترك بين قراءة شهادة طالب واحد عند تصفّح
// ملفه (student-certificate-local.js) ومسح مجلد الشهادات كامل لتحديث
// معدلات الطلبة (academic-averages-import-service.js)، بدل تكراره بالملفين.
import { ensurePdfJs } from "./vendor-loader.js?v=2026-09-07-academic-fix-1";

export async function extractPdfTextRows(file) {
  const library = await ensurePdfJs();
  const task = library.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const rows = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item) => item.str?.trim()).map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] })).sort((a, b) => b.y - a.y);
      const pageRows = [];
      for (const item of items) {
        let row = pageRows.find((entry) => Math.abs(entry.y - item.y) < 3);
        if (!row) { row = { y: item.y, items: [] }; pageRows.push(row); }
        row.items.push(item);
      }
      for (const row of pageRows) rows.push(row.items.sort((a, b) => b.x - a.x).map((item) => item.text));
      page.cleanup();
    }
    return rows;
  } finally {
    await task.destroy();
  }
}
