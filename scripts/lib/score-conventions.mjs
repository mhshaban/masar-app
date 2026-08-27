// منقول حرفيًا من src/modules/grades/score-conventions.js (كان بالتطبيق قبل
// نقل استيراد الدرجات لـCowork — راجع commit "نقل استيراد الدرجات والشهادات
// (Excel + PDF) من مسار إلى Cowork"). القاعدتان هنا اصطلاح خاص بهذه المدرسة،
// مؤكَّد من عيّنات حقيقية — لا تُغيَّر بدون مراجعة المرشد.

// This school encodes an absence as the literal score 0.5 rather than a
// separate marker or text flag, in both the Excel checkpoint-grade exports
// and the PDF certificates — apply the same interpretation everywhere a
// raw score value is parsed, so it isn't mistaken for a genuine 0.5%.
export function isEncodedAbsenceScore(score) {
  return Number(score) === 0.5;
}

// A single grade row's percentage as a 0..1 fraction.
export function gradeRowPct(g) {
  if (g.percentage != null) return Number(g.percentage);
  const max = Number(g.maxScore) || 100;
  return Number(g.score) / max;
}
