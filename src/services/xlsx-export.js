// يبني ملف xlsx حقيقي بالكامل من طرف المتصفح، عبر نفس حزمة SheetJS
// المُضمَّنة محليًا لقراءة الإكسل عند الاستيراد (src/vendor/xlsx.core.min.js
// — تدعم الكتابة أيضًا، لا حاجة لمكتبة إضافية). rows مصفوفة كائنات عادية؛
// مفاتيح الكائن الأول تصير عناوين الأعمدة تلقائيًا (json_to_sheet).
export function downloadRowsAsXlsx(filename, sheetName, rows) {
  const ws = window.XLSX.utils.json_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
  window.XLSX.writeFile(wb, `${filename}.xlsx`);
}
